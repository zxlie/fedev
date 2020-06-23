var fs = require("fs"),
    url = require('url'),
    querystring = require('querystring');

global.monster.controller = require('./base/controller.js');

var lookuped = {};

/**
 * 路由控制器
 * @param request
 * @param response
 */
function route(request, response) {

    var reqUrl = null;
    try {
        reqUrl = url.parse('http://' + request.headers.host + request.url, true);
    } catch (err) {
        monster.logger.fatal({
            req: request,
            msg: 'Route Parse Error:' + request.url
        });
        response.writeHead(500, {'Content-Type': 'text/plain'});
        response.end('url is wrong');
        return
    }

    // 如果是 /favicon.ico 请求，则不处理，否则可能会出现 404 的情况
    if (reqUrl.pathname == '/favicon.ico') {
        response.end('');
        return;
    }

    request.__request_time = new Date;
    request.__get = reqUrl.query;
    request.__post = {};

    // ======================从域名解析出模块名==========================
    var appName = monster.config.vhost[reqUrl.hostname];
    if (typeof appName == 'object') {
        var tmpName = '';
        Object.keys(appName).some(function (reg) {
            if ((new RegExp(reg)).test(reqUrl.pathname)) {
                tmpName = appName[reg];
                return true;
            }
        });
        if (!tmpName) {
            tmpName = appName['.*'];
        }
        appName = tmpName;
    }

    // 如果是mobile访问的，则判断是否需要响应式rewrite
    var ua = (request.headers['user-agent'] || '').toLocaleLowerCase();
    if (/iphone|android|(windows\s+phone)/i.test(ua)) {
        var wapApp = monster.config.wap_rewrite && monster.config.wap_rewrite[appName];
        if (wapApp) {
            appName = wapApp;
        }
    }

    // ==========================request uri解析==========================
    // 格式： /[文件夹名]/js文件名/方法名/参数
    var reqPath = reqUrl.pathname.substr(1);
    if (!reqPath) {
        if (monster.config.server.hostDafault && monster.config.server.hostDafault[appName]) {
            reqPath = monster.config.server.hostDafault[appName];
        } else {
            reqPath = monster.config.server.defaultAction || 'index/';
        }
    }

    var modUriSeg = reqPath.replace(/\/+/g, '/').replace(/\/$/, '').split('/');
    if (modUriSeg.length < 3) {
        modUriSeg.push('index');
    }
    var mods = modUriSeg.splice(-3);

    // js模块的路径
    var modPath = monster.config.path.webRoot + appName + '/controller/'
        + (modUriSeg.length ? modUriSeg.join('/') + '/' : '');
    delete modUriSeg;

    var modName = mods[0] + '.js';
    var modFilePath = modPath + modName;
    var fn = mods[1];
    var param = mods.length == 3 ? mods[2] : null;
    // 判断路由是否存在，如：/diamond/offer
    if (!lookuped[modFilePath] && !fs.existsSync(modFilePath)) {
        // 如果不存在，继续找：/diamond/offer/index
        modName = mods[1] + '.js';
        modFilePath = modPath + mods[0] + '/' + modName;
        fn = mods[2];
        param = null;
        if (!lookuped[modFilePath] && !fs.existsSync(modFilePath)) {
            // 跳转到通用错误页
            dealWithErrorPage(appName, request, response);
            return;
        }
    }

    lookuped[modFilePath] = true;
    var ctrler = loadController(modFilePath);
    if (param) {
        try {
            param = decodeURIComponent(param);
        } catch (err) {
            console.log(err, param);
        }
    }

    // ==========================进入到对应的controller进行执行=======================
    if ('function' != typeof ctrler[fn] &&
        'function' == typeof ctrler.instance) {
        ctrler = ctrler.instance(appName + '/');
    }

    if ('function' == typeof ctrler[fn]) {
        exeAppScript(appName, request, response, ctrler, fn, param);
    } else if ('function' == typeof ctrler['__call']) {
        exeAppScript(appName, request, response, ctrler, fn, param, true);
    } else if ('function' == typeof ctrler['index']) {
        exeAppScript(appName, request, response, ctrler, 'index', fn);
    } else {
        dealWithErrorPage(appName, request, response);
    }
}

/**
 * 夹在controller
 * @param ctrlPath
 * @returns {*}
 */
var loadController = function (ctrlPath) {
    var absPath = require('path').resolve(ctrlPath);
    if (monster.config.server.isDebug) {
        // 开发模式下，监控当前文件是否发生变化，如果发生变化，则清理require.cache
        monster.base.watchFile(absPath, function (cur, prev) {
            delete require.cache[require.resolve(absPath)];
        });
    }
    return require(absPath);
};

/**
 * 执行控制器
 * @param appName   模块名
 * @param request   request对象
 * @param response  response对象
 * @param ctrler       需要加载的模块
 * @param fn        需要执行的方法：具体的页面
 * @param param     参数，多参数时，为：[p1,p2,...]
 * @param magicCall 魔法模式
 * @param isMultiParams 是否为多参数模式
 */
function exeAppScript(appName, request, response, ctrler, fn, param, magicCall, isMultiParams) {

    function toExe() {
        ctrler.setRnR && ctrler.setRnR(request, response, {"hostPath": appName + '/'});

        if (ctrler.forbidden()) {
            monster.logger.debug({
                status: 403,
                req: request,
                msg: 'request forbidden'
            });
            return response.end('request forbidden');
        }
        try {
            if (isMultiParams) {
                magicCall ? ctrler.__call(fn, param) : ctrler[fn].apply(ctrler, param);
            } else {
                magicCall ? ctrler.__call(fn, param) : ctrler[fn](param);
            }
        } catch (err) {
            // 导出详细错误信息到页面
            monster.base.error.compile(err).then(function (detail) {
                var errorInfo = {
                    debug: monster.config.server.isDebug,
                    date: new Date(),
                    url: request.url,
                    file: detail.file,
                    msg: detail.msg,
                    line: detail.line,
                    column: detail.column
                };
                // 把错误输出到日志文件中
                monster.logger.fatal({
                    status: 500,
                    req: request,
                    msg: JSON.stringify(errorInfo)
                });

                // 跳转到通用错误页
                dealWithErrorPage(appName, request, response, [500, errorInfo], true);
            });
        }
    }

    // post请求
    if ('POST' == request.method) {
        // multipart表单的处理
        if (/^multipart\/form\-data/i.test(request.headers['content-type'])) {
            preDealUpload(request, toExe);
        } else {
            // 其他post
            var data = '';
            request.addListener('data', function (chunk) {
                data += chunk;
                // 如果上传的内容超过1M，则自动断开
                if (data.length > 1024 * 1024) {
                    // 把错误输出到日志文件中
                    monster.logger.error({
                        req: request,
                        msg: 'Post的内容不能超过1M字节'
                    });
                    request.connection.destroy();
                }
            });
            request.addListener('end', function () {
                data = querystring.parse(data);
                request.__post = data;
                toExe();
            });
        }
    } else {
        toExe();
    }
}

/**
 * 把请求交给错误页来处理
 * 如果是404的话，每个app可以自己接管这个errorPage，前提是模块下得有这个controller：404.js
 *
 * @param appName 当前模块名
 * @param request
 * @param response
 * @param param 为空时，视为 404
 */
function dealWithErrorPage(appName, request, response, param) {
    if (!param) {
        monster.logger.warn({
            status: 404,
            req: request,
            msg: '页面不存在'
        });
        // 如果模块下面有404.js这个controller，则把404请求交给它处理
        var file = monster.config.path.webRoot + appName + '/controller/404.js';
        if (fs.existsSync(file)) {
            lookuped[file] = true;
            var ctrler = loadController(file);

            if ('function' != typeof ctrler['index'] && 'function' == typeof ctrler.instance) {
                ctrler = ctrler.instance(appName + '/');
            }
            exeAppScript(appName, request, response, ctrler, 'index');
            return false;
        }
    }
    exeAppScript(appName, request, response, monster.controller.instance()(appName + '/'),
        'errorPage', param || 404, false, !!param);
}

/**
 * 处理multipart的表单，将file字段对应的数据预存到本机
 * @param request
 * @param callback
 */
function preDealUpload(request, callback) {
    // 文件上传用
    var formidable = require('formidable');
    var form = new formidable.IncomingForm(),
        files = {},
        fields = {};

    form.uploadDir = monster.config.path.log + '/upload/';
    if (!fs.existsSync(form.uploadDir)) {
        monster.base.mkDirP(form.uploadDir);
    }

    form.on('field', function (field, value) {
        fields[field] = value;
    });
    form.on('file', function (field, file) {
        files[field] = file;
    });
    form.on('end', function () {
        request.__post = fields;
        request.__files = files;
        callback && callback();
    });
    form.parse(request);
}

exports.route = route;
