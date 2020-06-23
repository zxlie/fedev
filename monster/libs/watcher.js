/**
 * 监测模板文件的内容变化
 * @author xianliezhao
 */
var fs = require('fs');
var path = require('path');
var _watched = {};

/**
 * 检测文件内容的内容变化，有变化时执行callback
 * @param filePath   待监测的模板名
 * @param callback 如果文件有变化，做这件事情
 */
module.exports = function (filePath, callback) {
    if (_watched[filePath]) {
        return;
    }

    function onFileChange(cur, prev) {
        callback && callback(cur, prev);
    }

    if (process.platform === 'win32') {
        fs.watch(filePath, {
            persistent: true,
            interval: 10
        }, onFileChange);
    } else {
        fs.watchFile(filePath, {
            persistent: true,
            interval: 10
        }, onFileChange);
    }

    _watched[filePath] = true;
};
