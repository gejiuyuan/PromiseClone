import {
    AGGREGATE_CLONE_ERROR,
    isFunc
} from "./constants.js";

//类似于AggregateError，将在调用Promise.any全rejected时抛出
export class AggregateCloneError extends Error {
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
export const parsePromiseResult = (res, thenPromise, resolve, reject) => {
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
