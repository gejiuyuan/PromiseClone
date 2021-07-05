export const PROMISE_CLONE_NAME = 'PromiseClone';

export const AGGREGATE_CLONE_ERROR = 'AggregateCloneError';

export const PROMISE_CLONE_STATES = {
    PENDING: 'pending',
    FULFILLED: 'fullfilled',
    REJECTED: 'rejected',
}

export const NOOP = function (a, b, c) { }

export const isFunc = ins => typeof ins === 'function';

export const isNativeReg = new RegExp(String.raw`function .*\(\) \{ \[native code\] \}`)

export const isNative = (Ctor) => isFunc(Ctor) && isNativeReg.test(Ctor.toString())

export const { toString } = Object.prototype;

export const isPromiseClone =
    ins =>
        toString.call(ins).slice(8, -1) === PROMISE_CLONE_NAME &&
        ['then', 'catch', 'finally'].every(_ => isFunc(ins[_]));

/**
 * 全局对象
 */
export const _globalThis =
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
export const nextTick = (() => {
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
                changeText()
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