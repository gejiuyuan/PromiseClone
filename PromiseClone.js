const PENDING = 'pending';
const FULFILLED = 'fulfilled';
const REJECTED = 'rejected';

const { toString } = Object.prototype;
const isPromiseClone =
    ins =>
        toString.call(ins).slice(8, -1) === 'PromiseClone' &&
        ['then', 'catch'].every(_ => typeof ins[_] === 'function');

//类似于AggregateError，将在Promise.any全失败时抛出
class AggregateCloneError extends Error {
    name = 'AggregateCloneError'
    constructor(message) {
        super()
        this.error = this.message = message
    }
}

const noop = function (a, b, c) { }

const isFunc = ins => typeof ins === 'function'

const isNative = (Ctor) => isFunc(Ctor) && /native code/.test(Ctor.toString())

/**
 * 全局对象
 */
const _globalThis = globalThis !== void 0
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
    } = _globalThis

    const { nextTick } = process || {}

    if (nextTick) {
        return nextTick.bind(process)
    }
    else if (isNative(MutationObserver)) {
        //初始化count计数器
        let count = 1
        //nextTick调用队列
        let nextTickCallbacks = []
        //创建一个将被监听内容变化的文本
        const textNode = document.createTextNode(count + '')
        //创建DOM变动观察者
        const nextTickObserver = new MutationObserver(function () {
            //执行队列第一个
            nextTickCallbacks.shift()();
            //如果队列还有任务就在下次异步回调中执行
            if (nextTickCallbacks.length) {
                changeText()
            }
        })
        //观察textNode文本变化
        nextTickObserver.observe(textNode, {
            characterData: true
        })
        function changeText() {
            textNode.data = count = count === 1 ? 0 : 1;
        }
        return function (cb) {
            if (!nextTickCallbacks.length) {
                changeText();
            }
            nextTickCallbacks.push(cb)
        }
    }
    else if (isFunc(setImmediate)) {
        return setImmediate
    }
    else if (isFunc(setTimeout)) {
        return setTimeout
    }

})();



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

        reject(new ReferenceError('chaining cycle detected in PromiseClone'))

        //如果返回结果是复杂类型
    } else if (res === Object(res)) {

        try {

            //尝试获取返回结果的then方法（以判断其是否为一个promise实例）
            let then = res.then;

            if (typeof then === 'function') {

                try {

                    //执行该返回的promise实例的then方法，然后递归调用parsePromiseResult，从而深层解析promise返回值
                    then.call(res, y => {
                        parsePromiseResult(y, thenPromise, resolve, reject);
                    }, n => {
                        reject(n);
                    });

                } catch (err) {
                    reject(err);
                }

            } else {
                resolve(res);
            }

        } catch (err) {
            reject(err);

        }

        //原始类型结果直接resolve
    } else {

        resolve(res);

    }

}

class PromiseClone {

    constructor(excutor) {

        this.state = PENDING; //初始化状态为等待中
        this.result = void 0; //初始化结果为undefined

        this.onResolvedCallbacks = []; //异步成功函数存储器
        this.onRejectedCallbacks = []; //异步失败函数存储器

        let resolve = value => {
            //如果状态没有变更过，就允许更改状态为成功
            if (this.state === PENDING) {
                this.state = FULFILLED;
                this.result = value;
                this.onResolvedCallbacks.forEach(fn => fn()); //执行所有保存的then成功回调
            }
        }

        let reject = error => {
            //与上同理
            if (this.state === PENDING) {
                this.state = REJECTED;
                this.result = error;
                this.onRejectedCallbacks.forEach(fn => fn()); //与上同理
            }
        }


        try {
            excutor(resolve, reject); //执行执行器函数
        } catch (err) {
            reject(err); //如果报错了，就更该状态失败
        }

    }

    //设置Object.prototype.toString.call()调用时的结果为[object PromiseClone]
    get [Symbol.toStringTag]() {
        return 'PromiseClone';
    }

    then(onresolved, onrejected) {

        //初始化成功和失败回调
        typeof onresolved !== 'function' && (onresolved = value => value);
        typeof onrejected !== 'function' && (onrejected = error => {
            throw error;
        });

        //创建新的PromiseClone实例
        let thenPromise = new PromiseClone((resolve, reject) => {

            let {
                state
            } = this;

            //如果是成功状态，就调用成功回调
            if (state === FULFILLED) {

                nextTick(() => {

                    try {
                        let res = onresolved(this.result);
                        parsePromiseResult(res, thenPromise, resolve, reject);
                    } catch (err) {
                        reject(err);
                    }

                });
                return;

            }

            //与上同理
            if (state === REJECTED) {

                nextTick(() => {

                    try {
                        let res = onrejected(this.result);
                        parsePromiseResult(res, thenPromise, resolve, reject);
                    } catch (err) {
                        reject(err);
                    }

                });
                return;

            }

            //如果仍处于等待中，就先将成功和失败回调暂存起来
            if (state === PENDING) {

                this.onResolvedCallbacks.push(() => {
                    nextTick(() => {

                        try {
                            let res = onresolved(this.result);
                            parsePromiseResult(res, thenPromise, resolve, reject);
                        } catch (err) {
                            reject(err);
                        }

                    });
                });

                this.onRejectedCallbacks.push(() => {
                    nextTick(() => {

                        try {
                            let res = onrejected(this.result);
                            parsePromiseResult(res, thenPromise, resolve, reject);
                        } catch (err) {
                            reject(err);
                        }

                    });
                });

            }


        });

        //返回该PromiseClone实例
        return thenPromise;

    }

    //捕获失败状态，并执行失败回调
    catch(onrejected) {
        return this.then(null, onrejected);
    }

    //返回一个异步成功PromiseClone实例
    static resolve(value) {
        return new PromiseClone((resolve, reject) => {
            resolve(value);
        });
    }

    //返回一个异步失败PromiseClone实例
    static reject(error) {
        return new PromiseClone((resolve, reject) => {
            reject(error);
        });
    }

    //即Promise.all静态方法
    static all(iterable) {

        return new PromiseClone((resolve, reject) => {

            //若interable参数不具备迭代器接口，更改为失败状态
            try {
                iterable = [...iterable];
            } catch (err) {
                reject(err)
            }

            const len = iterable.length;
            const arr = [];
            //如果数组或类数组为空，就返回一个空数组
            if (len === 0) {
                resolve(arr);
                return;
            }

            let count = 0;
            const handleLogic = (i, curItem) => {
                arr[i] = curItem;
                if (++count >= len) {
                    resolve(arr);
                }
            }

            for (let i = 0; i < len; i++) {

                let curItem = iterable[i];
                //如果该项是个PromiseClone实例，就做深层判断，拿到最里层的PromiseClone实例的结果，
                //遇到失败PromiseClone实例或错误抛出时，就更改为失败状态
                if (isPromiseClone(curItem)) {
                    let thenPromise = curItem.then(
                        res => {
                            parsePromiseResult(
                                res,
                                thenPromise,
                                res => {
                                    handleLogic(i, res);
                                },
                                err => {
                                    reject(err);
                                }
                            );
                        },
                        err => {
                            reject(err);
                        }
                    );
                }
                else {
                    handleLogic(i, curItem);
                }

            }

        });

    }

    //即Promise.race静态方法
    static race(iterable) {

        return new PromiseClone((resolve, reject) => {

            try {
                iterable = [...iterable];
            } catch (err) {
                reject(err)
            }

            let len = iterable.length;

            for (let i = 0; i < len; i++) {

                let curItem = iterable[i];
                if (isPromiseClone(curItem)) {
                    //等待解析完curItem（一个Promise实例）后，再返回最终结果
                    let thenPromise = curItem.then(
                        res => {
                            parsePromiseResult(res, thenPromise, resolve, reject);
                        },
                        err => {
                            reject(err);
                        }
                    );
                }
                else {
                    //如果是非Promise，就放到异步的成功Promise中，以防先于前面的promise执行而带来的结果错误
                    PromiseClone.resolve(curItem).then(res => {
                        resolve(res)
                    });
                }

            }

        });

    }

    static allSettled(iterable) {

        return new PromiseClone((resolve, reject) => {

            try {
                iterable = [...iterable]
            } catch (err) {
                reject(err)
            }

            let len = iterable.length
            let promiseResArr = []

            if (len === 0) {
                resolve(promiseResArr)
                return;
            }

            let count = 0;
            const handleLogic = (curIdx, val, status) => {
                const resKey = status === 'fulfilled' ? 'value' : 'reason'
                promiseResArr[curIdx] = {
                    status,
                    [resKey]: val
                }
                if (++count >= len) {
                    resolve(promiseResArr)
                }
            }

            for (let i = 0; i < len; i++) {

                const curItem = iterable[i]
                if (isPromiseClone(curItem)) {
                    const thenPromise = curItem.then(
                        res => {
                            parsePromiseResult(
                                res,
                                thenPromise,
                                ret => {
                                    handleLogic(i, ret, 'fulfilled')
                                },
                                err => {
                                    handleLogic(i, err, 'rejected')
                                }
                            )
                        },
                        err => {
                            handleLogic(i, err, 'rejected')
                        }
                    )
                }
                else {
                    handleLogic(i, curItem, 'fulfilled');
                }

            }

        })

    }

    static any(iterable) {

        return new PromiseClone((resolve, reject) => {

            try {
                iterable = [...iterable]
            } catch (err) {
                reject(err)
            }

            let count = 0
            const len = iterable.length
            const handleReject = (err) => {
                if (++count >= len) {
                    reject(new AggregateCloneError('No Promise in PromiseClone.any was resolved'));
                }
            }

            //如果是空的可迭代对象，返回失败的promise
            if (len === 0) {
                handleReject()
                return;
            }

            for (let i = 0; i < len; i++) {

                const curItem = iterable[i]
                if (isPromiseClone(curItem)) {
                    const thenPromise = curItem.then(
                        res => {
                            //深层解析promise的返回值
                            parsePromiseResult(res, thenPromise, resolve, handleReject)
                        },
                        err => {
                            handleReject(err)
                        }
                    )
                }
                else {
                    PromiseClone.resolve(curItem).then(res => {
                        resolve(res)
                    })
                }

            }

        })

    }

}


