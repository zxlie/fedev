/**
 * SVN相关的操作，包括：拉分支、分支合并
 *
 * @author xianliezhao
 */

var fs = require('fs');
var prompt = require('./prompt.js');
var child_process = require('child_process');

// svn trunk根目录
const TRUNK_ROOT = 'svn://www.baidufe.com/';
// svn branch根目录
const BRANCH_ROOT = 'svn://www.baidufe.com/';
// 分支前缀
const BRANCH_PREFIX = 'dev_';

/**
 * 检测svn地址是否存在
 */
var svnUrlDetect = function (path, callback) {
    var to = 'svn-url-detect';
    // 下载代码的命令
    var cmd = 'svn export --force #svn.path# #to#'
        .replace(/#svn.path#/, path).replace(/#to#/, to);

    child_process.exec(cmd, function (error, stdout, stderr) {
        child_process.exec('rm -rf ' + to);
        callback && callback(!!error);
    });
};

/**
 * 创建SVN分支
 */
var createBranch = function () {
    prompt.startStepByStep({
        step1: function () {
            prompt.readLine('请输入需要拉分支的模块名，如：pro：', function (modName) {
                if (!modName) return false;
                var now = new Date();
                // svn分支名称，如：pro_20140618003215
                var branchName = BRANCH_PREFIX + modName + '_' + now.getFullYear() + (now.getMonth() + 1)
                    + now.getDate() + now.getHours() + now.getMinutes() + now.getSeconds();
                // 检测分支地址是否已经存在
                svnUrlDetect(BRANCH_ROOT + modName, function (exists) {
                    if (exists) {
                        branchName += '_1';
                    }
                    var cmd = 'svn cp ' + TRUNK_ROOT + modName + ' ' + BRANCH_ROOT + branchName
                        + ' -m "auto create branch by FeDev!"';

                    child_process.exec(cmd, function (error) {
                        if (!error) {
                            console.log('分支创建成功，地址为：\n\t' + BRANCH_ROOT + branchName);
                            console.log('执行如下命令直接下载模块：\tnode fedev.js co ' + branchName);
                        } else {
                            console.log('抱歉，分支创建失败，请稍后重试，或者手动创建！\n错误信息：' + error);
                        }
                    });
                });
                return true;
            });
        }
    });
};

/**
 * 将分支合并到主干
 * @param moduleName
 * @param branchUrl
 */
var dealSvnMerge = function (moduleName, branchUrl) {
    var mergeDir = moduleName + '-to-merge-truck';
    var cmd = 'svn co ' + TRUNK_ROOT + moduleName + ' ' + mergeDir ;
    child_process.exec(cmd, function (error, stdout, stderr) {
        if (error) {
            console.log('分支合并失败！');
            process.exit();
            return false;
        }
        console.log('正则将分支合并到主干，请稍等...');
        cmd = 'svn log -q --stop-on-copy ' + branchUrl;
        child_process.exec(cmd, function (error, stdout, stderr) {
            var logs = stdout.trim().split('\n');
            var firstRevisionLog = logs.splice(-2)[0];
            var arr = firstRevisionLog.split('|');
            // 得到分支的第一个revision
            var revision = arr[0].trim().replace(/\D/, '');
            // merge命令
            cmd = 'cd ' + mergeDir + ' && svn merge --accept postpone -r '
                + revision + ':HEAD ' + branchUrl;
            child_process.exec(cmd, function (error, stdout, stderr) {
                if (error) {
                    console.log('分支合并失败！你可尝试手动合并！错误信息如下：\n' + error);
                }
                if (stdout) {
                    console.log('分支合并信息如下：\n' + stdout);
                    console.log('\n请按照下面的步骤完成分支到主干的合并\n' +
                        '1、进入【' + mergeDir + '】目录\n' +
                        '2、执行【svn st】检测合并结果\n' +
                        '3、如果有冲突，请手动修改文件，然后【svn resolve --accept working YOUR_FILE_LIST】\n' +
                        '4、提交：【svn ci -m "branch merged,by YOUR_NAME"】\n' +
                        '5、删除【' + mergeDir + '】目录\n');
                }
            });
        });
    });
};

/**
 * 从分支合并到主干
 */
var mergeToTrunk = function () {
    prompt.startStepByStep({
        step1: function () {
            prompt.readLine('请输入分支地址或分支号：', function (branch) {
                if (!branch) return false;
                if (branch.indexOf(BRANCH_ROOT) > -1) {
                    branch = branch.replace(BRANCH_ROOT, '');
                }
                var res = /^(?:dev_)?([a-z]+)_\d+(?:_1)?/.exec(branch);
                if (!res) {
                    console.log('不是一个合法的商业前端SVN分支！');
                    process.exit();
                } else {
                    // 检测svn分支是否真的存在
                    svnUrlDetect(BRANCH_ROOT + branch, function (error) {
                        if (error) {
                            console.log('SVN分支不存在！');
                            process.exit();
                        } else {
                            dealSvnMerge(res[1], BRANCH_ROOT + branch);
                        }
                    });
                }
                return true;
            });
        }
    });
};

exports.TRUNK_ROOT = TRUNK_ROOT;
exports.BRANCH_ROOT = BRANCH_ROOT;
exports.createBranch = createBranch;
exports.mergeToTrunk = mergeToTrunk;