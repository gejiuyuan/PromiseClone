'use strict';

const PROMISE_CLONE_NAME = 'PromiseClone';

const AGGREGATE_CLONE_ERROR = 'AggregateCloneError';

const PROMISE_CLONE_STATES = {
    PENDING: 'pending',
    FULFILLED: 'fullfilled',
    REJECTED: 'rejected',
};

const isFunc = ins => typeof ins === 'function';

const isNativeReg = new RegExp(String.raw`function .*\(\) \{ \[native code\] \}`);

const isNative = (Ctor) => isFunc(Ctor) && isNativeReg.test(Ctor.toString());

/**
 * 全局对象
 */
const _globalThis =
    globalThis !== void 0
        ? globalThis
        : self !== void 0
            ? self
            : window !== void 0
                ? window
                : global !== void 0
                    ? global
                    : {};

/**
 * 异步执行API nextTick
 */
const nextTick = (() => {
    const {
        process,
        MutationObserver,
        setImmediate,
        setTimeout
    } = _globalThis;
    const { nextTick: processNextTick } = process || {};

    if (processNextTick) {
        return function nextTick() {
            processNextTick.call(process);
        }
    }
    else if (isNative(MutationObserver)) {
        //初始化count计数器
        let count = 1;
        //nextTick调用队列
        const nextTickCallbacks = [];
        //创建一个将被监听内容变化的文本
        const textNode = document.createTextNode(count + '');
        //创建DOM变动观察者
        const nextTickObserver = new MutationObserver(function () {
            //执行队列第一个
            nextTickCallbacks.shift()();
            //如果队列还有任务就在下次异步回调中执行
            if (nextTickCallbacks.length) {
                changeText();
            }
        });
        //观察textNode文本变化
        nextTickObserver.observe(textNode, {
            characterData: true
        });
        function changeText() {
            textNode.data = count = count === 1 ? 0 : 1;
        }
        return function nextTick(cb) {
            !nextTickCallbacks.length && changeText();
            nextTickCallbacks.push(cb);
        }
    }
    else if (isFunc(setImmediate)) {
        return function nextTick(cb) {
            setImmediate(cb);
        }
    }
    else if (isFunc(setTimeout)) {
        return function nextTick(cb, timeout, ...args) {
            setTimeout(cb, timeout, ...args);
        }
    }
})();

//类似于AggregateError，将在调用Promise.any全rejected时抛出
class AggregateCloneError extends Error {
    name = AGGREGATE_CLONE_ERROR;
    constructor(message) {
        super();
        this.error = this.message = message;
    }
}

/**
 * 解析promise返回值结果，并区分做resolve或reject操作
 * @param {res} promise.then中的返回值
 * @param {thenPromise} promise.then本体
 * @param {resolve} resolve成功函数
 * @param {reject} reject失败函数
 */
const parsePromiseResult = (res, thenPromise, resolve, reject) => {
    //如果返回结果和其本体相同，抛出循环引用的错误
    if (Object.is(res, thenPromise)) {
        reject(new ReferenceError("chaining cycle detected in PromiseClone"));
    }
    //如果返回结果是复杂类型
    else if (res === Object(res)) {
        try {
            //尝试获取返回结果的then方法（以判断其是否为一个promise实例）
            const { then } = res;
            if (isFunc(then)) {
                try {
                    //执行该返回的promise实例的then方法，然后递归调用parsePromiseResult，从而深层解析promise返回值
                    then.call(
                        res,
                        (y) => parsePromiseResult(y, thenPromise, resolve, reject),
                        reject
                    );
                }
                catch (err) {
                    reject(err);
                }
            }
            else {
                resolve(res);
            }
        }
        catch (err) {
            reject(err);
        }
    }
    //原始类型结果直接resolve
    else {
        resolve(res);
    }
};

const {
    PENDING,
    REJECTED,
    FULFILLED
} = PROMISE_CLONE_STATES;

function PromiseClone(excutor) {

    if (!new.target) {
        throw new TypeError(
            `Fail to construct 'PromiseClone': Please use the 'new ' operator, this native object constructor cannot be called as a function`
        )
    }
    //初始化状态为等待中
    this.state = PENDING;
    //初始化结果为undefined
    this.result = void 0;
    // 异步成功函数存储器
    const onResolvedCallbacks = [];
    //异步失败函数存储器
    const onRejectedCallbacks = [];

    const thisProto = Object.getPrototypeOf(this);
    if (!thisProto.then) {
        thisProto.then = function then(onresolved, onrejected) {
            //初始化成功和失败回调
            !isFunc(onresolved) && (onresolved = (value) => value);
            !isFunc(onrejected) && (onrejected = (error) => {
                throw error;
            });
            //创建新的PromiseClone实例
            const thenPromise = new PromiseClone((resolve, reject) => {
                const { state } = this;
                const fullfilledCb = () => {
                    try {
                        let res = onresolved(this.result);
                        parsePromiseResult(res, thenPromise, resolve, reject);
                    }
                    catch (err) {
                        reject(err);
                    }
                };
                const rejectedCb = () => {
                    try {
                        let res = onrejected(this.result);
                        parsePromiseResult(res, thenPromise, resolve, reject);
                    }
                    catch (err) {
                        reject(err);
                    }
                };
                //如果是成功状态，就调用成功回调
                if (state === FULFILLED) {
                    nextTick(fullfilledCb);
                }
                //与上同理
                else if (state === REJECTED) {
                    nextTick(rejectedCb);
                }
                //如果仍处于等待中，就先将成功和失败回调暂存起来
                else if (state === PENDING) {
                    onResolvedCallbacks.push(() => nextTick(fullfilledCb));
                    onRejectedCallbacks.push(() => nextTick(rejectedCb));
                }
            });
            //返回该PromiseClone实例
            return thenPromise;
        };
    }

    const resolve = (value) => {
        //在处理resolve时，应该判断value是否为PromiseClone实例，如果是，则拿到它的返回结果
        parsePromiseResult(
            value,
            this,
            (value) => {
                //如果状态没有变更过，就允许更改状态为成功
                if (this.state === PENDING) {
                    this.state = FULFILLED;
                    this.result = value;
                    onResolvedCallbacks.forEach((fn) => fn()); //执行所有保存的then成功回调
                }
            },
            reject
        );
    };

    const reject = (error) => {
        //与上同理
        if (this.state === PENDING) {
            this.state = REJECTED;
            this.result = error;
            onRejectedCallbacks.forEach((fn) => fn()); //与上同理
        }
    };

    try {
        //运行执行器函数
        excutor(resolve, reject);
    }
    catch (err) {
        //如果报错了，就更该状态失败
        reject(err);
    }
}

//设置Object.prototype.toString.call()调用时的结果为[object PromiseClone]
Object.defineProperty(PromiseClone, Symbol.toStringTag, {
    value: PROMISE_CLONE_NAME,
});

//返回一个异步成功PromiseClone实例
Promise.resolve = function (value) {
    return new PromiseClone((resolve, reject) => {
        resolve(value);
    });
};

//捕获失败状态，并执行失败回调
PromiseClone.prototype.catch = function (onrejected) {
    return this.then(null, onrejected);
};

//捕获失败和成功状态，并执行失败回调
PromiseClone.prototype.finally = function (onFullfilledRejected) {
    return this.then(onFullfilledRejected, onFullfilledRejected);
};

//返回一个异步失败PromiseClone实例
PromiseClone.reject = function reject(error) {
    return new PromiseClone((resolve, reject) => {
        reject(error);
    });
};

//即Promise.all静态方法
PromiseClone.all = function all(iterable) {
    return new PromiseClone((resolve, reject) => {
        //若interable参数不具备迭代器接口，更改为失败状态
        try {
            iterable = [...iterable];
        } catch (err) {
            reject(err);
        }

        const { length } = iterable;
        const arr = [];
        //如果数组或类数组为空，就返回一个空数组
        if (length === 0) {
            resolve(arr);
            return;
        }

        let count = 0;
        const handleLogic = (i, curItem) => {
            arr[i] = curItem;
            if (++count >= length) {
                resolve(arr);
            }
        };

        for (let i = 0; i < length; i++) {
            let curItem = iterable[i];
            //遇到失败PromiseClone实例或错误抛出时，就更改为失败状态
            if (isPromiseClone(curItem)) {
                curItem.then(
                    (res) => {
                        handleLogic(i, res);
                    },
                    (err) => {
                        reject(err);
                    }
                );
            }
            else {
                handleLogic(i, curItem);
            }
        }
    });
};

//即Promise.race静态方法
PromiseClone.race = function race(iterable) {
    return new PromiseClone((resolve, reject) => {
        try {
            iterable = [...iterable];
        } catch (err) {
            reject(err);
        }

        let { length } = iterable;

        for (let i = 0; i < length; i++) {
            let curItem = iterable[i];
            if (isPromiseClone(curItem)) {
                //等待解析完curItem（一个Promise实例）后，再返回最终结果
                curItem.then(resolve, reject);
            }
            else {
                //如果是非Promise，就放到异步的成功Promise中，以防先于前面的promise执行而带来的结果错误
                PromiseClone.resolve(curItem).then(resolve);
            }
        }
    });
};

//即Promise.allsettled
PromiseClone.allSettled = function allSettled(iterable) {
    return new PromiseClone((resolve, reject) => {
        try {
            iterable = [...iterable];
        } catch (err) {
            reject(err);
        }

        let { length } = iterable;
        let promiseResArr = [];

        if (length === 0) {
            resolve(promiseResArr);
            return;
        }

        let count = 0;
        const handleLogic = (curIdx, val, status) => {
            const resKey = status === "fulfilled" ? "value" : "reason";
            promiseResArr[curIdx] = {
                status,
                [resKey]: val,
            };
            if (++count >= length) {
                resolve(promiseResArr);
            }
        };

        for (let i = 0; i < length; i++) {
            const curItem = iterable[i];
            if (isPromiseClone(curItem)) {
                curItem.then(
                    (res) => handleLogic(i, res, "fulfilled"),
                    (err) => handleLogic(i, err, "rejected")
                );
            }
            else {
                handleLogic(i, curItem, "fulfilled");
            }
        }
    });
};

//即Promise.any
PromiseClone.any = function any(iterable) {
    return new PromiseClone((resolve, reject) => {
        try {
            iterable = [...iterable];
        } catch (err) {
            reject(err);
        }

        let count = 0;
        const { length } = iterable;
        const handleReject = (err) => {
            if (++count >= length) {
                reject(
                    new AggregateCloneError("No Promise in PromiseClone.any was resolved")
                );
            }
        };

        //如果是空的可迭代对象，返回失败的promise
        if (length === 0) {
            handleReject();
            return;
        }

        for (let i = 0; i < length; i++) {
            const curItem = iterable[i];
            if (isPromiseClone(curItem)) {
                curItem.then(resolve, handleReject);
            }
            else {
                PromiseClone.resolve(curItem).then(resolve);
            }
        }
    });
};

module.exports = PromiseClone;
