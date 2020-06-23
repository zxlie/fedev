/**
 * 配置config.js，安装monster之后，将配置文件修改为线上配置
 * @author zhaoxianlie
 */
var fs = require('fs');
var path = require('path');

var createOnlineCfg = function () {
    // config.json文件地址
    var filepath = path.resolve('../monster/config/config.json');
    // 得到config的原内容
    var cfg = require(filepath);

    // 修改config.api
    cfg.api.hosts = {
        api: 'api.local.com',
        mlsfe: 'mlsfe.biz'
    };

    // 修改config.server
    cfg.server.rbMode = false;
    cfg.server.isDebug = false;
    cfg.server.compressTpl = true;
    cfg.server.cluster = true;

    // 修改statics
    cfg.statics.isDebug = false;
    cfg.statics.cluster = true;

    // 修改vhost
    cfg.vhost = {
        "baidufe.com": {
            "^/fehelper": "fehelper",
            "^/resume": "resume",
            ".*": "blog"
        },
        "doitbegin.com": "blog",
        "127.0.0.1": "blog",
        "fehelper.com": "fehelper",
        "www.baidufe.com": {
            "^/fehelper": "fehelper",
            "^/resume": "resume",
            ".*": "blog"
        },
        "www.doitbegin.com": "blog",
        "www.fehelper.com": "fehelper"
    };

    // 修改site
    cfg.site.DOMAIN = {
        "WWW": "//www.baidufe.com/",
        "STATIC": "//static.baidufe.com/"
    };
    cfg.site.JS_Defer = true;

    // 保存配置
    cfg = JSON.stringify(cfg, null, 4);
    fs.writeFileSync(filepath, cfg);
};

exports.createOnlineCfg = createOnlineCfg;
