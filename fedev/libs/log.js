/**
 * 日志查看模块，server日志和jserver日志
 *
 * @author zhaoxianlie
 */
var fs = require('fs');
var path = require('path');
var child_process = require('child_process');
var tools = require('./tools.js');

/**
 * 根据类型查看日志，分server和jserver两种
 * @param type
 */
var logTail = function (type) {
    var logFiles = ['-f'];

    var tp = /ls/.test(type) ? 'server' : /lj/.test(type) ? 'statics' : /ld/.test(type) ? 'dserver' : type;
    var logNameJson = path.resolve('../monster/config/.log_name.json');

    if (fs.existsSync(logNameJson)) {
        var logNames = require(logNameJson);
        if (logNames[tp] && fs.existsSync(logNames[tp])) {
            logFiles.push(logNames[tp]);
        }
    }

    var logPath = require(path.resolve('../monster/config/config.json')).path.log;
    if(type == 'lsa' || type == 'ls') {
        logFiles.push(logPath + 'access-' + tools.dateFormat(new Date(),'yyyyMMdd') + '.log');
    }
    if(type == 'lse' || type == 'ls') {
        logFiles.push(logPath + 'error-' + tools.dateFormat(new Date(),'yyyyMMdd') + '.log');
    }
    if(type == 'lj') {
        logFiles.push(logPath + 'static-' + tools.dateFormat(new Date(),'yyyyMMdd') + '.log');
    }
    if(type == 'ld') {
        logFiles.push(logPath + 'data-' + tools.dateFormat(new Date(),'yyyyMMdd') + '.log');
    }

    var spawn = child_process.spawn('tail', logFiles);
    spawn.stdout.on('data', function (data) {
        console.log(data.toString('utf-8'));
    });
};

exports.tailLog = logTail;