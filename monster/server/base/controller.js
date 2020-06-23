"use strict";

var util = require("util"),
    fs = require('fs'),
    Proxy = require('./proxy.js'),
    querystring = require('querystring'),
    events = require('events'),
    siteInfo = monster.config.site,
    path = require('path'),
    eventHandler = require('./evtHandle.js'),
    ServerHead = 'node-server living in ' + monster.config.server.hostname;

/**
 * 获取Est模板编译引擎，并进行初始化
 */
var EstEngine = require('../est/est.js');
EstEngine.init({
    debug: monster.config.server.isDebug,
    compress: monster.config.server.compressTpl,
    webRoot: monster.config.path.webRoot,
    viewFolder: 'views/',
    compiledFolder: monster.config.path.log + '/compiles/'
});


/**
 * 将处理结果写到response，发送到客户端
 * @param res
 * @param status
 * @param context
 * @param header
 * @param debugStr
 */
function writeRes(res, status, context, header, debugStr) {
    try {
        if (res.connection) {
            res.writeHead(status, header || {
                'Content-Type': 'text/plain;charset=utf-8',
                'Cache-Control': 'no-cache,no-store',
                'service': ServerHead
            });
            res.write(context);
            res.end();
        }
    } catch (err) {
        //致命错误
        monster.logger.fatal({
            'req': {},
            'msg': 'write res error: ' + err + ';' + debugStr || ''
        });
    }
}

/**
 * Controller实例
 * @constructor
 */
var Controller = function () {
};


/**
 * 设置request & response
 * @param req
 * @param res
 * @param opt
 */
Controller.prototype.setRnR = function (req, res, opt) {
    this.req = req;
    this.res = res;
    this.__reqdata = ('GET' == this.req.method ) ? this.req.__get : monster.base.array_merge({}, this.req.__get, this.req.__post);
    var client_ip = req.headers['x-forwarded-for'] || req.headers['http_client_ip'] || req.headers['x-real-ip'] || req.connection.remoteAddress;
    this.opt = opt || {};
    this.req.headers.clientIp = client_ip;

    var notify = new events.EventEmitter;
    notify.setMaxListeners(100);
    req.connection.on('close', function () {
        notify.emit('abort');
    });
    this.notify = notify;
    return this;
};

/**
 * 检查该请求是否为非法请求，禁止访问，检测ua、referrer
 * @return {Boolean}
 */
Controller.prototype.forbidden = function () {
    /*debug mode*/
    if (monster.config.server.isDebug) {
        return false;
    }

    /*anti spam*/
    var ua = (this.req.headers['user-agent'] || '').trim();
    var referrer = this.req.headers.referer || this.req.headers.referrer;
    var reqUrl = this.req.url;

    if (/^WinHTTP$/i.test(ua)) { // 机器爬虫
        return true;
    }

    if (/^\/a(j|w|jax)\//i.test(reqUrl) && (!referrer ||
        (monster.config.server.referrer && !(function () {
            return monster.config.server.referrer.split(';').some(function (r) {
                return referrer.indexOf(r) !== -1;
            });
        })))) {
        writeRes(this.res, 403, '', {
            'Content-Type': 'text/plain',
            'Cache-Control': 'no-cache,no-store',
            'service': ServerHead
        }, '[forbidden]');
        return true;
    }
    return false;
};

/**
 * 实现一个与客户端对接的ajax请求，不需要render数据到模板
 * @param url
 * @param callBack
 * @param method
 */
Controller.prototype.ajaxTo = function (url, callBack, method) {
    var res = this.res, req = this.req;
    if (!callBack) {
        callBack = function (data, res_state) {
            var status = res_state || ((false === data) ? 400 : 200);

            if (!data) {
                data = '';
            } else if ('string' != typeof data) {
                data = JSON.stringify(data);
            }

            writeRes(res, status, data, {
                'Content-Type': 'text/plain',
                'Cache-Control': 'no-cache,no-store',
                'service': ServerHead
            }, '[ajax to]');
            monster.logger.access(status, req);
        };
    }

    // 如果接口不存在就不用去请求了，直接报错
    if (!url) {
        callBack({
            code: -1,
            msg: 'Front api is not exists!'
        }, 400);
    } else if ('string' == typeof url) {
        if (req.__get.callback) {    //for jsonp
            var cbk = callBack;
            callBack = function (data, httpCode) {
                data = req.__get.callback + '(' + data + ')';
                // 把每个后端接口对应的httpCode都记录下来
                var hc = req.__httpCode || {};
                hc[url] = httpCode;
                req.__httpCode = hc;
                cbk(data);
            }
        }
        this._getProxyClient(url, method, true)(callBack);
    } else {
        self._addBackend(url, false);
        this._eventHandle.listen(true).then(callBack);
    }

};

/**
 * 文件下载
 * @param url       文件、报表的url
 * @param options   可指定多个参数，比如：
 *      fileName：下载后的文件名
 *      headers：返回头
 * @param callback  回调
 */
Controller.prototype.download = function (url, options, callback) {
    if (!callback) {
        var res = this.res, req = this.req;
        callback = function (success, res_state) {
            var status = !success ? 400 : 200;
            if (4000 <= res_state) {
                status = res_state;
            }
            monster.logger.access(status, req);
        }
    }

    options = typeof options == 'object' ? options : {fileName: options};
    this._getProxyClient(url, 'GET', true)(callback, null, {
        mode: 2,
        fileName: options.fileName,
        headers: options.headers
    });
};

/**
 * multi-part 表单的提交
 * @param url       文件上传的地址
 * @param callback  上传完成后的回调
 * @param endResponse   是否上传完成后直接结束请求，执行response.end
 */
Controller.prototype.multiPart = function (url, callback, endResponse) {
    if (!callback) {
        var res = this.res, req = this.req;
        callback = function (data, res_state) {
            var status = res_state ? res_state : (false === data) ? 400 : 200;
            // 把每个后端接口对应的httpCode都记录下来
            var hc = req.__httpCode || {};
            hc[url] = status;
            req.__httpCode = hc;
            if (4000 <= res_state) {
                status = res_state;
            }

            monster.logger.access(status, req);
        }
    }

    this._getProxyClient(url, 'POST', true)(callback, null, {
        mode: 3, // 3 表示multi-part表单
        endResponse: endResponse
    });
};

/**
 * 从HTTP请求中获取数据，比如get、post参数
 * @param key
 * @param dataSource
 * @param defaultV
 * @return {*}
 */
Controller.prototype.getQuery = function (key, dataSource, defaultV) {
    if (dataSource == null || monster.base.isUnDefined(dataSource)) {
        dataSource = this.__reqdata;
    }
    if (monster.base.isUnDefined(defaultV)) {
        defaultV = '';
    }
    var ret = dataSource[key];
    if (monster.base.isUnDefined(ret)) {
        ret = defaultV;
    }
    return ret;
};

/**
 * 渲染数据到模板
 * @param tplName 需要渲染的模板
 * @param data 用来渲染的数据
 * @param options 其他的一些配置项
 * @p-config targetApp 可以指定目标模块（相对tplName而言）
 * @p-config headers 指定当前渲染的headers
 */
Controller.prototype.render = function (tplName, data, options) {
    var now = new Date();
    options = options || {};
    data = data || [];
    var self = this;

    // 查看访问的后端php接口
    if (self.req.__get['__php__']) {
        //show php api
        if (self.req.__get['__php__'] == '/rb/' + (now.getMonth() + now.getDate() + 1)) {
            writeRes(this.res, 200, JSON.stringify(self.req.dataSource || {}), null, '[__php__]');
            monster.logger.access(201, self.req, 'php debug');
            return;
        }
    }
    // 在线上，这个rb模式是被关闭的
    if (monster.config.server.rbMode !== false) {
        // 查看page data
        if (self.req.__get['__pd__']) {
            //show page data
            if (self.req.__get['__pd__'] == '/rb/' + (now.getMonth() + now.getDate() + 1)) {
                writeRes(this.res, 200, JSON.stringify(data), null, '[__pd__]');
                monster.logger.access(201, self.req, 'data debug');
                return;
            }
        }
    }

    if (!data['_JSmods']) {
        data['_JSmods'] = [];
    }

    /**
     * 模板编译解析成功，直接发回客户端进行渲染
     * @param html
     */
    var resolve = function (html) {
        monster.logger.access(200, self.req);

        // 正确输出
        writeRes(self.res, 200, html, monster.base.extend({
            'Content-Type': 'text/html;charset=utf-8',
            'Cache-Control': 'no-cache,no-store',
            'service': ServerHead
        }, options.headers), self.req.url + ',[render]');
    };

    /**
     * 模板解析失败，则输出错误信息
     * @param reason
     */
    var reject = function (reason) {
        monster.logger.access(503, self.req);

        // 解析详细的错误信息，并输出到页面
        monster.base.error.compile(reason.err, 'tpl', reason.fileMap).then(function (detail) {
            var errorInfo = {
                debug: monster.config.server.isDebug,
                date: monster.base.date('yyyy-MM-dd HH:mm:ss'),
                url: self.req.url,
                file: detail.file,
                origin: reason.fileMap && reason.fileMap[detail.file],
                msg: detail.msg,
                line: detail.line,
                column: detail.column,
                originalCode: detail.originalCode || ''
            };
            // 把错误输出到日志文件中
            self.log('fatal', JSON.stringify(errorInfo));
            self.errorPage(503, errorInfo);
        }, function () {
            self.errorPage(503, {});
        });
    };

    EstEngine.render({
        moduleName: (options.targetApp || this.appPath).replace(/\//g, ''),
        tplName: tplName,
        pageData: data
    }).then(resolve, reject);
};

/**
 * 404错误页面
 * @param code
 * @param errorInfo
 */
Controller.prototype.errorPage = function (code, errorInfo) {
    try {
        if (!code) code = 404;
        // 如果当前模块下有这个错误页的模板，那就直接用，但是如果没有，就去common模块找
        var tplName = 'error/error.html';
        var errorApp = 'common/';
        var tplPath = monster.config.path.webRoot + errorApp + 'views/';
        var exists = false;
        if (fs.existsSync(tplPath + tplName)) {
            exists = true;
        } else {
            tplPath = monster.config.path.webRoot + this.appPath + 'views/';
            if (fs.existsSync(tplPath + tplName)) {
                errorApp = this.appPath;
                exists = true;
            }
        }

        if (exists) {
            var data = monster.base.cloneObj(siteInfo);

            // 增加对HTTPS的支持，HTTPS模式下，静态文件不走CDN
            if (this.req.headers.encrypted) {
                data.JCSTATIC_BASE = data.HTTPS_JCSTATIC_BASE || '/'
            }
            if (!data.pageTitle) {
                data.pageTitle = '糟糕，出错了';
            }
            data.php = this.req.dataSource;
            data.errorInfo = errorInfo || {};
            data.errorInfo.code = code;

            this.render(tplName, data, {
                targetApp: errorApp
            });
        } else {
            writeRes(this.res, code, code + '', null, '[error page]');
        }
    } catch (e) {
        writeRes(this.res, code, code + '', null, '[error page-catched]');
    }
};


/**
 * 重定向请求
 * @param url
 * @param proxyArgs
 */
Controller.prototype.redirectTo = function (url, proxyArgs) {
    var args;
    if (proxyArgs) {
        args = this.req.__get;
    }
    if (args) {
        args = require('querystring').stringify(args);
        if (args) url += (url.indexOf('?') > 0 ? '&' : '?') + args;
    }
    writeRes(this.res, 301, '', {
        'Location': url,
        'Cache-Control': 'no-cache,must-revalidate,no-store',
        'Pragma': 'no-cache'
    }, '[redirect]');
    return false;
};


/**
 * 通过一个php数据接口，指定请求方式，获取数据
 * @param remoteUri
 * @param method
 * @param noJsonParse
 * @return {Function}
 */
Controller.prototype._getProxyClient = function (remoteUri, method, noJsonParse) {
    var data = this.req.__get;
    if ((method = method || this.req.method) == 'POST') {
        var querys = querystring.stringify(this.req.__get);
        if (querys) remoteUri += (remoteUri.indexOf('?') > 0 ? '&' : '?') + querys;
        data = this.req.__post;
    }

    var proxy = Proxy.__create(this.req, this.res, this.notify)
        .setup(remoteUri, method || this.req.method, noJsonParse);
    var self = this;
    return function (evt, passData, options) {
        var evtBake = evt;
        evt = function (respData, httpCode) {
            // 把每个后端接口对应的httpCode都记录下来
            var hc = self.req.__httpCode || {};
            hc[remoteUri] = httpCode;
            self.req.__httpCode = hc;
            typeof evtBake == 'function' && evtBake(respData, httpCode);
        };
        proxy.transfer(evt, passData || data, options);
    }
};


/**
 * 监听某php数据接口
 * @param toCallMethod
 * @param assignTag
 * @return {Function}
 */
Controller.prototype.addEvent = function (toCallMethod, assignTag) {
    var self = this;
    return function () {
        var args = Array.prototype.splice.call(arguments, 0);
        return self._eventHandle.add(toCallMethod, assignTag, args);
    }
};

/**
 * 提前处理
 * @param evt
 */
Controller.prototype.preDeal = function (evt) {
    this._eventHandle.onOver = evt;
};

/**
 * 添加后端接口
 * @param apis
 * @param common
 * @private
 */
Controller.prototype._addBackend = function (apis, common) {

    var self = this;
    // 清理掉所有的事件监听器
    self._eventHandle.clear();

    if (common) {
        // 把仅页面设置的php接口记录下来
        self.req.dataSource_pageOnly = monster.base.cloneObj(apis);
        var dftCtrl = monster.config.path.webRoot + self.opt.hostPath + 'controller/__common.js';
        require(path.resolve(dftCtrl)).common.call(self, apis);
    }
    for (var k in apis) {
        var phpClient = this._getProxyClient(apis[k]);
        self.addEvent(phpClient, k)();
    }

    // 把php接口的数据都存下来，包括：公共接口和仅页面的接口
    var pageOnly = monster.base.cloneObj(this.req.dataSource_pageOnly || {});
    var commonApi = {};
    for (var key in apis) {
        if (!pageOnly[key]) {
            commonApi[key] = apis[key];
        }
    }
    delete this.req.dataSource_pageOnly;
    self.req.dataSource = {
        common: commonApi,
        pageOnly: pageOnly
    };
};

/**
 * 请求后端接口，获取数据
 * @param apis 需要请求的数据接口
 * @param common 是否需要进行公共接口控制
 * @return {*}
 */
Controller.prototype.backend = function (apis, common) {
    var self = this;

    self._addBackend(apis, common);

    return new Promise(function (resolve, reject) {
        // 成功
        var success = function (data) {
            if (self._prevData) {
                data = monster.base.array_merge(self._prevData, data);
                delete self._prevData;
            }

            // 这里做一个对静态文件万无一失的兼容，是https才走本域，否则都走cdn
            if (self.req.headers.encrypted) {
                data.JCSTATIC_BASE = data.HTTPS_JCSTATIC_BASE || '/'
            } else if (data.JCSTATIC_BASE != siteInfo.WAP_JCSTATIC_BASE) {
                data.JCSTATIC_BASE = siteInfo.JCSTATIC_BASE;
            }

            // 查看controller data
            if (monster.config.server.rbMode !== false && self.req.__get['__cd__']) {
                //show snake data
                var now = new Date();
                if (self.req.__get['__cd__'] == '/rb/' + (now.getMonth() + now.getDate() + 1)) {
                    writeRes(self.res, 200, JSON.stringify(data), null, '[__cd__]');
                    monster.logger.access(201, self.req, 'data debug');
                    return;
                }
            }

            // 把请求回来的数据，携带到req对象上
            self.req.__data = data;
            resolve && resolve(data);
        };

        // 失败
        var fail = function (err) {

            monster.base.error.compile(err).then(function (detail) {
                var errorInfo = {
                    debug: monster.config.server.isDebug,
                    date: new Date(),
                    url: self.req.url,
                    file: detail.file,
                    msg: detail.msg,
                    line: detail.line,
                    column: detail.column
                };
                //后台接口出错，打印日志
                self.log('fatal', JSON.stringify(errorInfo));
                self.errorPage(503, errorInfo);
            });

            reject && reject(data);
        };

        self._eventHandle.listen().then(success, fail);
    });

};


/**
 * 打log
 * @param level 级别
 * @param msg
 */
Controller.prototype.log = function (level, msg) {
    var needLog = {
        msg: msg,
        req: this.req
    };
    monster.logger[level](needLog);
};


/**
 * 对外暴露的instance入口
 * @param maps
 * @returns {Function}
 */
exports.instance = function (maps) {
    var mod = new Function();
    util.inherits(mod, Controller);
    if (maps) {
        for (var k in maps)
            mod.prototype[k] = maps[k];
    }

    return function (appPath) {
        var modObj = new mod;

        modObj.appPath = appPath;
        modObj._eventHandle = eventHandler.__create(siteInfo);

        return modObj;
    }
};

/**
 * 通用处理
 * @param func
 * @returns {*}
 */
exports.common = function (func) {
    return func;
};
