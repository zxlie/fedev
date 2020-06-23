/**
 * fedev 使用帮助
 *
 * @author zhaoxianlie
 */

var feDevVersion = 20160725.1621;

/**
 * 帮助手册
 */
var help = function (mode) {
    switch (mode) {
        case 'co':
            _h_co();
            break;
        case 'release':
            _h_release();
            break;
        default :
            _h_all();
    }
};

/**
 * 显示全部帮助
 * @private
 */
var _h_all = function () {
    console.log([
        '\n\t*********************************',
        '\t*\tFeDev使用帮助\t\t*',
        '\t*********************************',
        '======================================================',
        '使用命令 node fedev.js [options] 运行，options可选值有：\n',
        '\t-h\t\t查看fedev使用帮助',
        '\t-v\t\t查看fedev版本号',
        '',

        '\tinstall\t\t安装monster的完整环境，末尾加上--online参数表示安装线上环境',
        '\t\t\t<<<<<<<<简写模式>>>>>>>>>',
        '\t\t\t-is:安装monster，如：node fedev.js -is',
        '\t\t\t-iso:安装线上版本的monster，并生成线上配置文件',
        '',

        '\tupgrade\t\t升级monster的完整环境，可选参数：--fedev,--monster',
        '\t\t\t<<<<<<<<简写模式>>>>>>>>>',
        '\t\t\t-u:升级全套环境，如：node fedev.js -u',
        '\t\t\t-uf:升级fedev环境',
        '\t\t\t-ufo:升级线上版本，此时会更新配置文件',
        '\t\t\t-uh:升级monster环境',
        '\t\t\t-uho:升级线上版本',
        '',

        '\tco\t\t下载模块代码到环境中进行开发，详细帮助：node fedev.js -h co',
        '\t\t\t<<<<<<<<简写模式>>>>>>>>>',
        '\t\t\t-c，如：node fedev.js -c',
        '',

        '\tsvn-branch\t自动创建SVN分支',
        '\t\t\t<<<<<<<<简写模式>>>>>>>>>',
        '\t\t\t-sb，如：node fedev.js -sb',
        '',

        '\tsvn-merge\t自动将SVN分支合并到主干',
        '\t\t\t<<<<<<<<简写模式>>>>>>>>>',
        '\t\t\t-sm，如：node fedev.js -sm',
        '',

        '\tlog-server\t查看server log',
        '\t\t\t<<<<<<<<简写模式>>>>>>>>>',
        '\t\t\t-ls，查看全部错误日志，如：node fedev.js -ls',
        '\t\t\t-lsa，查看访问日志，如：node fedev.js -lsa',
        '\t\t\t-lse，查看错误日志，如：node fedev.js -lse',
        '',

        '\tlog-jserver\t查看jserver log',
        '\t\t\t<<<<<<<<简写模式>>>>>>>>>',
        '\t\t\t-lj，如：node fedev.js -lj',
        '',

        '\tclear\t\t删除模板缓存文件',
        '',

        '\trelease [app]\t在测试机部署模块，详细帮助：node fedev.js -h release',
        '\t\t\t<<<<<<<<简写模式>>>>>>>>>',
        '\t\t\t-l:有询问模式，如：node fedev.js -l',
        '\t\t\t-li:无询问模式，如：node fedev.js -li common',
        '',

        '\tstart\t\t启动monster服务，末尾加上--online参数表示在线上运行',
        '\t\t\t<<<<<<<<简写模式>>>>>>>>>',
        '\t\t\t-s:启动服务，如：node fedev.js -s',
        '\t\t\t-so:在线上环境启动服务',
        '',

        '\trestart\t\t重启monster服务，末尾加上--online参数表示在线上运行',
        '\t\t\t<<<<<<<<简写模式>>>>>>>>>',
        '\t\t\t-r:重启服务，如：node fedev.js -r',
        '\t\t\t-ro:在线上环境重启服务',
        '',

        '\tstop\t\t停止monster服务，末尾加上--online参数表示在线上运行',
        '\t\t\t<<<<<<<<简写模式>>>>>>>>>',
        '\t\t\t-p:停止服务，如：node fedev.js -p',
        '\t\t\t-po:在线上环境重启服务',
        '',

        '\tstopAll\t\t停止所有的Node服务',
        '\t\t\t<<<<<<<<简写模式>>>>>>>>>',
        '\t\t\t-P:停止全部服务，如：node fedev.js -P',
        ''
    ].join('\n'));
};

/**
 * checkout代码的详细帮助
 */
var _h_co = function () {
    console.log([
        '\n\t*********************************',
        '\t*   node fedev.js co详细帮助',
        '\t*********************************',
        '=============================================================',
        '1、node fedev.js co\t\t按照命令行交互方式下载模块',
        '  输入的SVN路径（svnPath）可遵循如下规则：',
        '    svnModule\t\t\t下载svnModule对应的主干代码',
        '    trunk.svnModule\t\t下载svnModule对应的主干代码',
        '    svnModule_tag\t\t下载svnModule_tag对应的分支代码',
        '    branch.svnModule_tag\t下载svnModule_tag对应的分支代码',
        '    svnModule_FullPath\t\t下载svn模块完整路径对应的代码',
        '2、node fedev.js co svnPath\t下载svnPath对应的代码，规则同上',
        ''
    ].join('\n'));
};

/**
 * checkout代码的详细帮助
 */
var _h_release = function () {
    console.log([
        '\n\t*********************************',
        '\t* node fedev.js release详细帮助',
        '\t*********************************',
        '=============================================================',
        '1、node fedev.js release\t按照命令行交互方式部署模块',
        '  输入的SVN路径（svnPath）可遵循如下规则：',
        '    svnModule\t\t\t部署svnModule对应的主干代码',
        '    trunk.svnModule\t\t部署svnModule对应的主干代码',
        '    svnModule_tag\t\t部署svnModule_tag对应的分支代码',
        '    branch.svnModule_tag\t部署svnModule_tag对应的分支代码',
        '    svnModule_FullPath\t\t部署svn模块完整路径对应的代码',
        '2、node fedev.js release svnPath\t部署svnPath对应的代码，规则同上',
        '3、node fedev.js release svnPath -i\t直接进入无询问模式',
        ''
    ].join('\n'));
};

/**
 * 版本号
 */
var version = function () {
    console.log('FeDev当前版本：' + feDevVersion);
};

exports._feDevVersion = feDevVersion;
exports.help = help;
exports.version = version;
