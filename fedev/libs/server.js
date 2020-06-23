/**
 * fedev 服务模块
 *
 * @author zhaoxianlie
 */
var child_process = require('child_process');
var path = require('path');

/**
 * 通过脚本进行服务器操作
 * @param opType    start、restart、stop、stopAll、clear
 * @param callback  执行完成后的操作
 * @param mode      如果mode参数为 --online ，则表示是要启动线上服务；否则表示线下
 */
var execShell = function (opType, callback, mode) {
    // 如果mode参数为 --online ，则表示是要启动线上服务
    var shellName = 'service.sh';
    opType = (opType == 'stopAll' && mode == '--online') ? 'stop' : opType;
    var cmd = 'cd ../monster/bin && sh ' + shellName + ' ' + opType;
    var child = child_process.exec(cmd);

    // 线上stop模式，直接打印msg，因为 线上stop 模式会将所有 node服务停掉，包括当前fedev.js
    if (mode == '--online') {
        if (opType == 'stop') {
            console.log('service & statics stopped!');
            callback && callback();
            process.exit();
            return;
        } else if (opType == 'restart') {
            console.log('server & statics restarted!');
            callback && callback();
            process.exit();
            return;
        }
    }

    child.stdout.on('data', function (data) {
        process.stdout.write(data);
        // start 和 restart 会导致命令行挂起，所以需要在这里强制exit，模拟：nohup
        if (opType == 'start' || opType == 'restart' || 'logRestart') {
            // 输出这条log的时候，说明所有服务都已经启动好了
            if (/statics\s+service\s+started/i.test(data)) {
                callback && callback();
                process.exit();
            }else if(/log\s+server\s+restarted/i.test(data)) {
                callback && callback();
                process.exit();
            }
        }
    });
};

/**
 * 打印本地虚拟域名信息
 * @private
 */
var _dumpDomain = function () {
    var cfg = require('path').resolve('../monster/config/config.json');
    var vhost = require(cfg).vhost;
    console.log('按住【command】点击下面的域名可以直接打开：\n' + JSON.stringify(vhost, null, 4) + '\n');
};

/**
 * 启动server
 * @param callback  执行完成后的操作
 * @param mode      如果mode参数为 --online ，则表示是要启动线上服务；否则表示线下
 */
var start = function (callback, mode) {
    execShell('start', function () {
        _dumpDomain();
        callback && callback();
    }, mode);
};

/**
 * 重启server
 * @param callback  执行完成后的操作
 * @param mode      如果mode参数为 --online ，则表示是要启动线上服务；否则表示线下
 */
var restart = function (callback, mode) {
    execShell('restart', function () {
        _dumpDomain();
        callback && callback();
    }, mode);
};

/**
 * 停止server
 * @param callback  执行完成后的操作
 * @param mode      如果mode参数为 --online ，则表示是要启动线上服务；否则表示线下
 */
var stop = function (callback, mode) {
    execShell('stop', callback, mode);
};

/**
 * 停止所有的服务
 * @param callback  执行完成后的操作
 * @param mode      如果mode参数为 --online ，则表示是要启动线上服务；否则表示线下
 */
var stopAll = function (callback, mode) {
    execShell('stopAll', callback, mode);
};

/**
 * 清除est缓存
 * @param callback  执行完成后的操作
 * @param mode      如果mode参数为 --online ，则表示是要启动线上服务；否则表示线下
 */
var clear = function (callback, mode) {
    execShell('clear', callback, mode);
};

/**
 * 重启log server：主要是给crontab使用的
 */
var logRestart = function () {
    execShell('logRestart', null, '--online');
};

exports.start = start;
exports.restart = restart;
exports.stop = stop;
exports.stopAll = stopAll;
exports.clear = clear;
exports.logRestart = logRestart;