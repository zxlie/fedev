"use strict";

/**
 * 事件处理器
 * @constructor
 * @author xianliezhao
 */
function EventHandler(data) {
    this.clear(data);
}

/**
 * 清除所有事件监听
 */
EventHandler.prototype.clear = function (data) {
    // 事件列表
    this._eventStack = [];

    // 预设的数据
    this._initData = data || this._initData;

    // 这个事件是在defaultController中添加的
    this.onOver = null
};

/**
 * 事件绑定
 * @param toCallMethod
 * @param assignTag
 * @param toCallParam
 */
EventHandler.prototype.add = function (toCallMethod, assignTag, toCallParam) {
    if (!toCallMethod || 'function' != typeof toCallMethod) {
        return;
    }
    this._eventStack.push([toCallMethod, assignTag, toCallParam]);
};


/**
 * 事件触发，或先执行defaultController中的事件
 * @param noPrepare true时：不使用预设的数据，主要是在controller中预设的
 */
EventHandler.prototype.listen = function (noPrepare) {

    var self = this;

    return new Promise(function (resolve, reject) {

        var eventCount = self._eventStack.length;
        var eventData = {};
        var eventOnOver = self.onOver;

        // 当且仅当为true时生效
        if (noPrepare !== true) {
            Object.keys(self._initData || {}).map(function (key) {
                eventData[key] = self._initData[key];
            });
        }

        // 把所有的listenOn都执行完之后再执行其他的
        function _onEverythingDone() {
            try {
                // 如果在defaultController中绑定过事件，那就执行它，但如果事件返回false，则中断操作
                if (typeof eventOnOver === 'function' && false === eventOnOver(eventData)) {
                    return;
                }
                resolve && resolve(eventData);
            } catch (err) {
                reject && reject(err)
            }
        }

        if (eventCount == 0) {
            _onEverythingDone();
            return;
        }

        // 执行listenOn绑定的事件
        self._eventStack.map(function (item) {
            var toCallMethod = item[0],
                assignTag = item[1],
                toCallParam = item[2];

            var evtPass = function (data) {
                eventData[assignTag] = data;
                eventCount--;
                if (eventCount <= 0) {
                    _onEverythingDone()
                }
            };
            toCallParam.unshift(evtPass);
            toCallMethod.apply(null, toCallParam);
        });
    });
};


/**
 * 创建实例
 * @param data
 * @returns {EventHandler}
 * @private
 */
exports.__create = function (data) {
    return new EventHandler(data);
};



