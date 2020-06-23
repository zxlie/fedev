"use strict";

// 入口文件
require('../libs/global.js');

// 获取参数，也许是命令行传入的，也有可能是cluster里fork出来的
var arg = process.argv.splice(2)[0] || process.env.SERVICE_NAME;

switch (arg) {
    case 'clear':
        require('child_process').exec([
            'rm -rf ' + monster.config.path.log + '/compiles/*.est',
            'rm -rf ' + monster.config.path.log + '/*.json'
        ].join(' && '));
        break;
    case 'server':
        require('../server/index.js');
        break;
    case 'statics':
        require('../statics/index.js');
        break;
}
