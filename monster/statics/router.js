/**
 * 静态文件服务器模块
 * @author zhaoxianlie
 */
var url = require('url'),
    fs = require('fs'),
    path = require('path');

// 已缓存的文件配置
var staticMapFile = path.resolve('../config/.static.map.json');
var processor = require('./base/processor.js');

var cache = {}, outputed = null, notfound = {};


/**
 * statics 静态文件服务器，在这里处理静态文件请求
 * @param req
 * @param res
 */
exports.route = function (req, res) {
    var urlObj = url.parse(req.url);
    var statfs = urlObj.pathname;
    var query = urlObj.query;
    var md5_path = monster.base.md5(statfs);
    var md5_query = monster.base.md5(query) || '0';

    if (!outputed) {
        try {
            outputed = require(staticMapFile);
        } catch (e) {
            outputed = {};
        }
    }
    var now = new Date;
    var lastModified = now.toUTCString();

    // 检查当前请求的静态文件是否是否已缓存
    if (outputed[md5_path]) {
        if (outputed[md5_path][md5_query]) {
            lastModified = outputed[md5_path][md5_query];
        } else {
            delete outputed[md5_path];
        }
    }

    req.__request_time = now;
    var expires = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 30);

    if (!monster.config.statics.isDebug && lastModified == req.headers['if-modified-since']) {
        monster.logger.statics(304, req, 'From Cache');
        res.writeHead(304, {"Expires": expires.toUTCString()});
        res.end();
        return;
    }

    // 删除缓存，防止文件冗余
    delete outputed[md5_path];

    // 获取处理器
    var proc = processor.getProcessor(req);

    // 静态文件服务器支持的mime-type
    var contentType = monster.base.mimeType.getByExt('.' + proc.fileType);
    var headers = {
        'Accept-Ranges': 'bytes',
        'Content-Type': contentType,
        "Last-Modified": lastModified,
        "Expires": expires.toUTCString(),
        "Cache-Control": 'max-age=' + 315360000,
        "Date": (new Date).toUTCString(),
        "Server": "node-server living in " + monster.config.server.hostname,
        "Access-Control-Allow-Origin": "*"
    };

    var md5Key = monster.base.md5(proc.uri);
    if (notfound[md5Key]) {
        proc.response(null, proc.uri, headers, req, res);
    } else {
        // 多文件合并加载的情况（主要针对js）
        var timer = setTimeout(function () {
            monster.logger.statics(500, req, 'Timeout');
            res.end();
        }, monster.config.statics.max_time);
        proc.func(proc.uri, function (data, file) {
            clearTimeout(timer);
            if (!notfound[md5Key]) {
                proc.response(data, file, headers, req, res);
            }
            notfound[md5Key] = data == null;
        }, proc.fileType, req);

        outputed[md5_path] = {};
        outputed[md5_path][md5_query] = lastModified;
        fs.writeFile(staticMapFile, JSON.stringify(outputed, null, 4));
    }
};