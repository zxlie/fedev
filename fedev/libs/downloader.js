/**
 * SVN代码下载模块，包括环境代码、模块代码等
 *
 * @author zhaoxianlie
 */
var fs = require('fs');
var prompt = require('./prompt.js');
var child_process = require('child_process');
var path = require('path');
var svn = require('./svnTool.js');
var cfg = require('./configure.js');
var tools = require('./tools.js');

/**
 * 下载代码
 * @param to
 * @param downloadMode
 * @param svnPath
 * @param callback
 */
var download = function (to, downloadMode, svnPath, callback) {
    process.stdout.write('代码下载中，请稍等....');
    var intervalId = setInterval(function () {
        process.stdout.write('.');
    }, 1000);

    // 下载代码的命令
    var cmd = 'svn #downloadMode# #svn.path# #to#'
        .replace(/#to#/, to)
        .replace(/#downloadMode#/, downloadMode)
        .replace(/#svn.path#/, svnPath);

    child_process.exec(cmd, function (error, stdout, stderr) {
        clearInterval(intervalId);
        process.stdout.write('\n');
        if (error) {
            var errMsg = '代码下载失败！错误信息如下：\n' + stderr;
            console.log(errMsg);
            return;
        }

        callback && callback(error);
    });
};

/**
 * 下载环境代码
 * @param mode 代码下载方式：0:安装，1：更新
 * @param env   安装环境，--online表示线上，其他情况表示线下，主要是配置不一样
 */
var downloadMonster = function (mode, env) {
    var svnPath = svn.TRUNK_ROOT + 'monster';
    var svnToDir = mode == 0 ? '../monster' : '../hb-update-by-alien';
    download(svnToDir, 'export --force', svnPath, function () {
        // 如果是文件更新模式，则只将框架部分的代码覆盖过去，不覆盖配置文件
        var cmds = [];
        if (mode == 1) {
            if (env == '--online') {
                // 先对老环境做备份处理
                cmds.push('mkdir -p ../backup');
                cmds.push('cp -r ../monster ../backup/monster.' + tools.dateFormat(new Date(), 'yyyyMMddHHmmss'));
            } else {
                cmds.push('rm -rf ' + svnToDir + '/config/config.json');
            }
            cmds.push('cp -r ' + svnToDir + '/* ../monster/');
            cmds.push('rm -rf ' + svnToDir);
        }
        child_process.exec(cmds.join(' && '), function (error) {
            if (error) {
                console.log(error);
            } else {
                if (env == '--online') {
                    cfg.createOnlineCfg();
                }
                console.log('monster 已' + (mode == 0 ? '安装' : '升级到最新版本') + '！');
            }
        });
    });
};

/**
 * 下载FeDev环境
 */
var downloadFeDev = function (callback) {
    var svnPath = svn.TRUNK_ROOT + 'fedev/';
    var svnToDir = 'fedev-by-alien';
    download(svnToDir, 'export --force', svnPath, function () {
        var cmds = [];
        // 比较一下，下载下来的版本是否确实比现在的版本新？
        var newVersion = require(path.resolve(svnToDir) + '/libs/help.js')._feDevVersion;
        var curVersion = require('./help.js')._feDevVersion;
        if (newVersion != curVersion) {
            cmds.push('cp -r ' + svnToDir + '/* .');
            console.log('FeDev已更新至：' + newVersion);
        } else {
            console.log('当前FeDev已经是最新版本。');
        }
        cmds.push('rm -rf ' + svnToDir);
        child_process.exec(cmds.join(' && '), function (err) {
            callback && callback();
        });
    });
};

/**
 * 下载模块代码，支持三种模式下载
 * @param svnAddress    svn地址，三种模式：
 * 1、trunk.pro  下载pro的trunk代码
 * 2、branch.pro_20140624 下载分支号为pro_20140624的pro分支
 * 3、http://svn.meilishuo..... 完整的SVN地址
 * @private
 */
var _execModuleDownload = function (svnAddress, svnToDir) {
    if (/branch\.[\w+]/.test(svnAddress)) {
        svnAddress = svnAddress.replace('branch.', svn.BRANCH_ROOT);
    } else if (/trunk\.[\w+]/.test(svnAddress)) {
        svnAddress = svnAddress.replace('trunk.', svn.TRUNK_ROOT);
    } else if (/[\w]+_[\d]+/.test(svnAddress) && svnAddress.indexOf('http://') < 0) {
        svnAddress = svn.BRANCH_ROOT + svnAddress;
    } else if (/^[a-z]+$/.test(svnAddress.trim()) && svnAddress.indexOf('http://') < 0) {
        svnAddress = svn.TRUNK_ROOT + svnAddress;
    }
    if (!svnToDir) {
        prompt.startStepByStep({
            step1: function () {
                prompt.readLine('将代码下载到那个目录？：', function (toDir) {
                    if (!toDir) return false;
                    svnToDir = '../' + toDir;
                    download(svnToDir, 'co', svnAddress);
                    return true;
                });
            }
        });
    } else {
        download(svnToDir, 'co', svnAddress);
    }
};

/**
 * 下载模块代码
 * @param inputSvnAddr  需要下载的模块地址，可选
 * @returns {boolean}
 */
var downloadApp = function (inputSvnAddr) {
    if (inputSvnAddr) {
        _execModuleDownload(inputSvnAddr);
        return true;
    }
    var svnToDir = Math.random();
    prompt.startStepByStep({
        step1: function () {
            prompt.readLine('将代码下载到那个目录？：', function (toDir) {
                if (!toDir) return false;
                svnToDir = '../' + toDir;
                return true;
            });
        },
        step2: function () {
            prompt.readLine('你的SVN地址是？：', function (svnAddress) {
                if (!svnAddress) return false;
                _execModuleDownload(svnAddress, svnToDir);
                return true;
            });
        }
    });
};

/**
 * 安装fe-dev环境
 * @param env 安装环境，默认是本地环境；--online 线上环境；
 */
var install = function (env) {
    downloadMonster(0, env);
};

/**
 * 更新monster环境
 * @param mode --fedev / --monster / --all
 * @param env --online
 */
var upgrade = function (mode, env) {
    mode = (mode || '').trim();
    if (mode == '--fedev') {
        downloadFeDev();
    } else if (mode == '--monster') {
        downloadMonster(1, env);
    } else {
        downloadFeDev(function () {
            downloadMonster(1, env);
        });
    }
};

/**
 * 执行模块部署
 * @param modName
 * @returns {boolean}
 */
var _execModuleRelease = function (svnAddress) {
    var modName = '';
    svnAddress = (svnAddress || '').trim();

    // 多种模式的兼容
    if (/http\:\/\/svn.meilishuo/.test(svnAddress)) {
        svnAddress = svnAddress.replace(/(.+)\/$/, function ($0, $1) {
            return $1;
        });
    } else if (/branch\.[\w+]/.test(svnAddress)) {
        svnAddress = svnAddress.replace('branch.', svn.BRANCH_ROOT);
    } else if (/trunk\.[\w+]/.test(svnAddress)) {
        svnAddress = svnAddress.replace('trunk.', svn.TRUNK_ROOT);
    } else if (/[\w]+_[\d]+/.test(svnAddress)) {
        svnAddress = svn.BRANCH_ROOT + svnAddress;
    } else if (/^[a-z]+$/.test(svnAddress)) {
        svnAddress = svn.TRUNK_ROOT + svnAddress;
    }

    var arr = /^(?:dev_)?([a-z]+)(_[\w]+)?/.exec(svnAddress.substr(svnAddress.lastIndexOf('/') + 1));
    modName = arr ? arr[1] : null;
    if (!modName) {
        console.log('请输入正确的模块名、分支号、或SVN完整地址！');
        return true;
    }

    // 如果是要更新monster，则调用upgrade方法
    if (modName == 'monster') {
        upgrade();
        return true;
    }

    var to = '.download.' + Math.random();
    download(to, 'export --force', svnAddress, function (err) {
        if (err) {
            console.log('模块发布失败，请确认你的模块名、SVN账号密码等是否正确！');
            process.exit();
            return;
        }
        // 代码下载成功后，则将其手动copy到对应目录
        var cmds = [
                'cd ' + to,
                'sh build.sh',
                'cp -r output/' + modName + ' ' + '../../ > /dev/null',
            'cd ../ && rm -rf .download.*'
        ].join(' && ');
        console.log('正在编译【' + modName + '】模块...');
        var child = child_process.exec(cmds, function (error, stdout, stderr) {
            if (!error) {
                console.log('模块【' + modName + '】部署成功！');
            } else {
                console.log(error);
            }
            process.exit();
        });
        child.stdout.on('data', function (data) {
            process.stdout.write(data);
        });
    });
};

/**
 * QA 测试机、线上机器 部署代码时可用这个命令
 * @param theModule 需要部署的模块名或SVN路径
 * @param releaseMode 部署模式，-i：部署前不进行询问
 */
var release = function (theModule, releaseMode) {
    theModule = (theModule || '').trim();
    // 无询问模式，直接部署
    if (theModule && releaseMode == '-i') {
        _execModuleRelease(theModule);
        return true;
    }
    prompt.startStepByStep({
        step1: function () {
            prompt.readLine('本次部署将会覆盖原来的代码，请确认（y/n）：', function (yn) {
                if (!yn) return false;
                if (yn == 'n') {
                    console.log('代码部署操作已被取消！');
                    process.exit();
                    return true;
                }
                return true;
            });
        },
        step2: function () {
            if (theModule) {
                _execModuleRelease(theModule);
            } else {
                prompt.readLine('请输入需要发布的模块名或分支号或svn路径：', function (modName) {
                    if (!modName) return false;
                    _execModuleRelease(modName);
                    return true;
                });
            }
        }
    });
};

exports.install = install;
exports.upgrade = upgrade;
exports.downloadApp = downloadApp;
exports.release = release;