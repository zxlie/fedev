/**
 * 静态文件服务器模块
 * @author zhaoxianlie
 */

require('../libs/global.js');
var router = require("./router.js");
var fs = require("fs");
var http = require("http");
var cluster = require('cluster');
var numCPUs = require('os').cpus().length;

// 全局错误捕获
process.on('uncaughtException', function (err) {

    // 如果错误码为'EADDRINUSE'，则设置错误码为 2，并退出当前进程
    (err.code == 'EADDRINUSE') && process.exit(2);
    
    // 导出详细错误信息到页面
    monster.base.error.compile(err).then(function (detail) {
        var errorInfo = {
            debug: monster.config.statics.isDebug,
            date: new Date(),
            file: detail.file,
            msg: detail.msg,
            line: detail.line,
            column: detail.column
        };
        // 把错误输出到日志文件中
        monster.logger.fatal({
            status: 500,
            msg: JSON.stringify(errorInfo)
        });
    });

    // 打印到控制台
    console.log(err.stack);
});


function start(port) {
    function onRequest(request, response) {
        router.route(request, response);
    }

    if (cluster.isMaster && monster.config.statics.cluster) {
        for (var i = 0; i < numCPUs; i++) {
            cluster.fork({
                SERVICE_NAME: 'statics'
            });
        }

        cluster.on('death', function (worker) {
            console.log('worker ' + worker.process.pid + ' died at:', monster.base.date('yyyy-MM-dd HH:mm:ss'));
            cluster.fork();
        });
        cluster.on('exit', function (worker, code) {
            console.log('worker ' + worker.process.pid + ' died at:', monster.base.date('yyyy-MM-dd HH:mm:ss'));
            if (code !== 2) {
                cluster.fork();
            }
        });
    } else {
        http.createServer(onRequest).listen(port || 8794);
        console.log("服务已启动，进程号：", process.pid);
    }

    // 将node的进程pid写入文件
    fs.createWriteStream("../config/.pids", {
        flags: "a",
        encoding: "utf-8",
        mode: 0666
    }).write(process.pid + "\n");
}

// 启动服务
start(monster.config.statics.onPort);
