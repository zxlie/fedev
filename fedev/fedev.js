/**
 * fedev入口程序
 * @author zhaoxianlie
 */
var downloader = require('./libs/downloader.js');
var help = require('./libs/help.js');
var server = require('./libs/server.js');
var log = require('./libs/log.js');
var svn = require('./libs/svnTool.js');

(function () {
    var args = process.argv.splice(2);
    switch (args[0]) {
        case '-v':
            help.version();
            break;

        ///////////////////////////////////// 安装fedev
        case '-is':
        case 'install':
            downloader.install(args[1]);
            break;
        case '-iso':
            downloader.install('--online');
            break;

        ///////////////////////////////////// 升级fedev
        case '-u':
        case 'upgrade':
            downloader.upgrade(args[1], args[2]);
            break;
        case '-ufo':
            downloader.upgrade('--fedev', '--online');
            break;
        case '-umo':
            downloader.upgrade('--monster', '--online');
            break;
        case '-uf':
            downloader.upgrade('--fedev');
            break;
        case '-um':
            downloader.upgrade('--monster');
            break;

        ///////////////////////////////////// 下载代码
        case '-c':
        case 'co':
            downloader.downloadApp(args[1]);
            break;

        ///////////////////////////////////// 在测试机、线上机器 部署模块代码
        case 'release':
            downloader.release(args[1], args[2]);
            break;
        case '-l':
            downloader.release(args[1]);
            break;
        case '-li':
            downloader.release(args[1], '-i');
            break;

        ///////////////////////////////////// 启动服务
        case '-s':
        case 'start':
            server.start(null, args[1]);
            break;
        case '-so':
            server.start(null, '--online');
            break;

        ///////////////////////////////////// 重启服务
        case '-r':
        case 'restart':
            server.restart(null, args[1]);
            break;
        case '-ro':
            server.restart(null, '--online');
            break;

        ///////////////////////////////////// 停止服务
        case '-p':
        case 'stop':
            server.stop(null, args[1]);
            break;
        case '-po':
            server.stop(null, '--online');
            break;

        ///////////////////////////////////// 停止所有服务
        case '-P':
        case 'stopAll':
            server.stopAll(null, args[1]);
            break;

        ///////////////////////////////////// 删除模板缓存
        case '-cl':
        case 'clear':
            server.clear(null, args[1]);
            break;

        ///////////////////////////////////// 删除模板缓存
        case '-lro':
        case 'logRestart':
            server.logRestart();
            break;

        ///////////////////////////////////// 拉分支
        case '-sb':
        case 'svn-branch':
            svn.createBranch();
            break;

        ///////////////////////////////////// 分支合并到主干
        case '-sm':
        case 'svn-merge':
            svn.mergeToTrunk();
            break;

        ///////////////////////////////////// 查看server日志
        case '-ls':
        case 'log-server':
            log.tailLog('ls');
            break;
        case '-lsa':
            log.tailLog('lsa');
            break;
        case '-lse':
            log.tailLog('lse');
            break;

        ///////////////////////////////////// 查看静态文件服务器日志
        case '-lj':
        case 'log-jserver':
            log.tailLog('lj');
            break;

        ///////////////////////////////////// 启动fedev机器上的各个服务
        case '-fs':
        case 'fedev-start':
            cmd.feDevStart();
            break;

        ///////////////////////////////////// 使用帮助
        case '-h':
            help.help(args[1]);
            break;

        ///////////////////////////////////// 创建模板
        case '-ct':
        case 'create':
            template.create();
            break;

        default:
            help.help();
            break;
    }
})();