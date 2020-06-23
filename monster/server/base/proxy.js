/**
 * 通过远程接口获取数据
 *
 * @example
 * var proxy = require('./proxy.js').__create();
 * proxy.setup(...);
 * proxy.web(...);
 *
 * @author zhaoxianlie
 */
var http = require('http');
var https = require('https');
var fs = require('fs');
var url = require('url');
var path = require('path');
var zlib = require('zlib');
var querystring = require('querystring'),
    cookie = require('./cookie.js');

var hosts = monster.config.api.hosts || {},
    port = monster.config.api.port || 80;

/**
 * 一个网络代理，在服务器之间进行数据拉取和提交
 * @param req
 * @param res
 * @param notify
 * @constructor
 */
var Proxy = function (req, res, notify) {
    this.req = req;
    this.res = res;
    this.notify = notify;
};

/**
 * 初始化proxy，设定相关参数
 * @param remoteUri 请求地址
 * @param method    请求类型，get 、 post
 * @param noJsonParse   是否按照源数据格式返回，不进行json parse
 */
Proxy.prototype.setup = function (remoteUri, method, noJsonParse) {
    var hostSource = 'web';
    var thePort;
    var isHttps = false;
    var isAbsPath = false;

    // 看看是不是本地数据的模拟
    if (remoteUri.indexOf('fedev::') > -1) {
        remoteUri = remoteUri.replace('fedev::', 'http://127.0.0.1:7749');
    }

    // 这种格式：http://www.baidu.com/a/b/c
    if (remoteUri.indexOf('http://') > -1 || remoteUri.indexOf('https://') > -1) {
        isAbsPath = true;
        if(remoteUri.indexOf('https://') > -1) {
            isHttps = true;
        }
        remoteUri = remoteUri.replace('http://', '').replace('https://', '');
        hostSource = remoteUri.substring(0, remoteUri.indexOf('/'));
        remoteUri = remoteUri.substr(remoteUri.indexOf('/'));
        // 支持这种格式：192.168.10.122:8080::/getInfo
        if (hostSource.indexOf(':') > 0) {
            hostSource = hostSource.split(':');
            thePort = hostSource[1];
            hostSource = hostSource[0];
        }
        if(!thePort && isHttps) {
            thePort = 443;
        }
    }
    // 这种格式：pro::/meizuan/getCalendar
    else if (remoteUri.indexOf('::') > 0) {
        remoteUri = remoteUri.split('::');
        hostSource = remoteUri[0];
        remoteUri = remoteUri[1];
    }

    var host = isAbsPath ? hostSource : hosts[hostSource];
    if (!host) {
        host = hostSource;
        monster.logger.fatal({
            status: 404,
            req: this.req,
            msg: [
                'remoteUri=' + remoteUri,
                'msg=' + 'Data Source: ' + hostSource + ' is not configed'
            ].join(',')
        });
    } else {
        // 这里要兼容这种形式：在monster.config.json中配置的host为：hostname:port/path
        try {
            var obj = url.parse('http://' + host + remoteUri);
            host = obj.hostname;
            thePort = thePort || obj.port;
            remoteUri = obj.path;
        } catch (err) {
            var hostArr = host.split(':');
            host = hostArr[0];
            thePort = thePort || hostArr[1];
        }
    }
    thePort = thePort || port;

    // 初始化完毕这一堆参数
    this.httpClient = isHttps ? https : http;
    this.host = host;
    this.port = thePort;
    this.remoteUri = remoteUri;
    this.noJsonParse = !!noJsonParse;
    this.reqHeaders = {};
    this.method = !method ? 'GET' : method;
    this.hostSource = hostSource;

    return this;
};

/**
 * 执行这个Proxy，将data数据传递到server进行处理，完毕后交给callback响应
 * @param callback  数据处理完后的回调
 * @param data      提交的数据
 * @param options   配置参数
 * @config mode      proxy类型：1：普通get/post代理；2：文件下载；3：multipart
 * @config fileName  下载文件时所指定的文件名
 */
Proxy.prototype.transfer = function (callback, data, options) {
    options = options || {};
    if (!this.host) {
        callback ? callback(false, 400) : {};
        return this;
    }

    if ('undefined' == typeof data && 'function' != typeof callback) {
        data = callback;
        callback = new Function();
    }

    if (options.mode == 3) {
        // 判断是否为 multipart的post提交
        return this._multiPart(callback, data, options);
    } else if (options.mode == 2) {
        // 判断是否为 文件下载，比如报表导出
        return this._download(callback, data, options);
    } else {
        // 其他情况，都当成普通的 get 和 post 请求去处理
        return this._web(callback, data);
    }
};

/**
 * 构建 Proxy headers
 * @param data
 * @returns {*}
 * @private
 */
Proxy.prototype._buildHeaders = function (data) {

    // proxy header 设置
    var proxyHeaders = this.reqHeaders;
    var proxyDomain = ['snakeproxy', 'mls-time', 'seashell', 'clientIp',
        'referer', 'cookie', 'user-agent'
    ];
    proxyHeaders.reqHost = this.req.headers.host;
    proxyHeaders.requrl = this.req.url;
    proxyHeaders.targetEnd = this.hostSource;
    for (var i = 0, j = proxyDomain.length; i < j; i++) {
        if (this.req.headers.hasOwnProperty(proxyDomain[i])) {
            proxyHeaders[proxyDomain[i]] = this.req.headers[proxyDomain[i]];
        }
    }

    // 对提交参数进行加工
    data = querystring.stringify(data);
    if ('GET' == this.method) {
        if (data) {
            this.remoteUri = this.remoteUri.trim();
            if ('&$' == this.remoteUri.slice(-2)) {
                this.remoteUri = this.remoteUri.slice(0, -2);
            } else {
                this.remoteUri += (this.remoteUri.indexOf('?') > 0 ? '&' : '?') + data;
            }
        }
        data = '';
    } else {
        var contentType = this.req.headers['content-type'];
        if (!/^multipart\/form\-data/i.test(contentType)) {
            contentType = 'application/x-www-form-urlencoded';
        }
        proxyHeaders['Content-Type'] = contentType;
    }
    proxyHeaders['Content-Length'] = Buffer.byteLength(data, 'utf8'); //data.length;

    this.headers = proxyHeaders;
    return data;
};

/**
 * 检测Api接口是否存在错误
 * @param api
 * @param result
 * @param req
 * @returns {boolean}
 * @private
 */
var _detectApiError = function (api, result, req) {

    if (req) {
        // ua不合法，则认为是一个不需要记录的Error，可忽略
        if (!req.headers['user-agent'] || req.headers['user-agent'].length < 45) {
            return false;
        }
    }

    // 登录时候获取用户信息的接口就不当成错误了
    if (/\/user\/session/.test(api)) {
        return false;
    }

    if (!result) {
        return true;
    }

    try {
        result = JSON.parse(result) || {};
    } catch (err) {
        return false;
    }

    return false;
};

/**
 * 是否需要进行重试
 * @param retry
 * @param req
 * @private
 */
var _needReTry = function (retry, req) {
    if (retry) {
        return false;
    }
    // ua不合法也不需要重试
    if (!req.headers['user-agent'] || req.headers['user-agent'].length < 50) {
        return false;
    }

    return true;
};

/**
 * Web交互，包括 get、post数据交换，不包括file上传、文件下载
 * @param callback    数据交换完成后的回调
 * @param data        额外的提交数据
 * @param retry       重试1次
 */
Proxy.prototype._web = function (callback, data, retry) {
    // 把数据暂存下来，如果发生400错误，可以retry一次
    var oriData = monster.base.cloneObj(data);
    data = this._buildHeaders(data);

    var options = {
        host: this.host,
        port: this.port,
        headers: this.headers,
        path: this.remoteUri,
        agent: false,
        method: this.method
    };
    var request_timer;
    var startTime = new Date;
    var self = this;

    // 正常模式
    var request = this.httpClient.request(options, function (response) {
        clearTimeout(request_timer);
        request_timer = 0;

        var res_state = response.statusCode;
        if (200 != res_state && 400 != res_state) {
            return callback(false, res_state);
        }
        var result = '';
        response.on('data', function (chunk) {
            result += chunk;
        }).on('end', function () {
            if ('""' == result) result = false;
            // 接口耗时
            var useTime = new Date - startTime;

            // 如果检测到当前请求的API接口有问题，则需要记录错误日志，并尝试重试
            if (!retry && _detectApiError(self.remoteUri, result, self.req)) {
                monster.logger.log('api', {
                    status: res_state,
                    req: self.req,
                    msg: JSON.stringify({
                        api: self.remoteUri,
                        status: res_state,
                        useTime: useTime,
                        result: result
                    })
                });
                if (_needReTry(retry, self.req)) {
                    return self._web(callback, oriData, true);
                }
            }

            try {
                result = self.noJsonParse ? result : (result ? (JSON.parse(result) || result) : false);
            } catch (err) {
                // 接口返回数据格式异常，解析失败
                monster.logger.debug({
                    status: res_state,
                    req: self.req,
                    msg: 'api-error:' + self.remoteUri
                });
            }

            // response cookie
            var proxyDomains = ['set-cookie'];
            for (var i = proxyDomains.length - 1; i >= 0; i--) {
                var proxyKey = proxyDomains[i];
                if (proxyKey in response.headers) {
                    var pdVal = response.headers[proxyKey];
                    if (!pdVal) break;
                    if ('set-cookie' == proxyKey) {
                        var cookie_set = cookie.getHandler(self.req, self.res);
                        pdVal.forEach(function (cookie_v) {
                            cookie_set.set(cookie_v);
                        })
                    } else {
                        self.res.setHeader(proxyKey, pdVal);
                    }
                }
            }
            callback && callback(result, res_state);
        });
    });
    request.on('error', function (e) {
        if (!retry && _detectApiError(self.remoteUri, null, self.req)) {
            monster.logger.info({
                status: 503,
                req: self.req,
                msg: JSON.stringify({
                    api: self.remoteUri,
                    status: 503,
                    useTime: new Date() - startTime
                })
            });
        }
        // 失败，可能只是一个偶然事件，可以做一次重试
        if (_needReTry(retry, self.req)) {
            self._web(callback, oriData, true);
        } else {
            return callback(false, 503);
        }
    });
    request_timer = setTimeout(function () {
        if (!retry && _detectApiError(self.remoteUri, null, self.req)) {
            monster.logger.log('api', {
                status: 408,
                req: self.req,
                msg: JSON.stringify({
                    api: self.remoteUri,
                    status: 408,
                    useTime: new Date() - startTime
                })
            });
        }
        // 失败，可能只是一个偶然事件，可以做一次重试
        if (_needReTry(retry, self.req)) {
            return self._web(callback, oriData, true);
        } else {
            request.abort();
            return callback(false, 408);
        }

    }, monster.config.api.timeout);

    self.notify && self.notify.on('abort', function () {
        if (!request_timer) return;
        clearTimeout(request_timer);
        request_timer = 0;
        request.abort();
        !retry && monster.logger.debug({
            status: 204,
            req: self.req,
            msg: 'api-error:' + self.remoteUri + ' | User Abort'
        });
    });

    request.write(data);
    request.end();

    return this;
};

/**
 * 用于文件下载
 * @param callback    数据交换完成后的回调
 * @param data        数据
 * @param opt         下载后的文件名等，必须接后缀
 */
Proxy.prototype._download = function (callback, data, opt) {
    data = this._buildHeaders(data);
    var fileName = opt.fileName;
    var customHeaders = opt.headers || {};

    var options = {
        host: this.host,
        port: this.port,
        headers: this.headers,
        path: this.remoteUri,
        agent: false,
        method: this.method
    };
    var request_timer;
    var self = this;
    var startTime = new Date();

    // 正常模式
    var request = this.httpClient.get(options, function (response) {
        clearTimeout(request_timer);
        request_timer = 0;
        var res_state = response.statusCode;

        // 设置Header
        var _writeHead = function () {
            var resHeaders = response.headers;
            if (fileName) {
                var contentType = resHeaders['content-type'] || '';
                var ext = '';

                var all = monster.base.mimeType.getAll();
                for (var key in all) {
                    if (contentType.indexOf(all[key]) == 0) {
                        ext = key;
                        break;
                    }
                }
                var index = fileName.lastIndexOf('.');
                var extInput = fileName.substr(index > 0 ? index : fileName.length - 1);
                if (!extInput) {
                    fileName += ext;
                }
                resHeaders['content-disposition'] = 'attachment;filename="' + encodeURIComponent(fileName) + '"';
            }
            self.res.writeHead(customHeaders.status || 200, 'OK', resHeaders);
        };

        // 执行callback
        var _dealCallback = function () {
            if (!callback) return;
            if (200 != res_state) {
                monster.logger.log('api', {
                    req: self.req,
                    status: res_state,
                    msg: JSON.stringify({
                        api: self.remoteUri,
                        status: res_state,
                        useTime: new Date() - startTime
                    })
                });
                return callback(false, res_state);
            } else {
                return callback(true, res_state);
            }
        };

        response.on('end', function () {
            _dealCallback();
        });
        _writeHead();
        response.pipe(self.res);

    });
    request.on('error', function (e) {
        if (_detectApiError(self.remoteUri, null, self.req)) {
            monster.logger.info({
                status: 503,
                req: self.req,
                msg: JSON.stringify({
                    api: self.remoteUri,
                    status: 503,
                    useTime: new Date() - startTime
                })
            });
        }
        callback && callback(false, 503);
    });
    request_timer = setTimeout(function () {
        request.abort();
        if (_detectApiError(self.remoteUri, null, self.req)) {
            monster.logger.log('api', {
                req: self.req,
                status: 408,
                msg: JSON.stringify({
                    api: self.remoteUri,
                    status: 408,
                    useTime: new Date() - startTime
                })
            });
        }
        callback && callback(false, 408);
    }, 300000); // 文件下载的默认超时时间设置为5分钟

    self.notify && self.notify.on('abort', function () {
        if (!request_timer) return;
        clearTimeout(request_timer);
        request_timer = 0;
        request.abort();
        monster.logger.debug({
            status: 204,
            req: self.req,
            msg: 'api-error:' + self.remoteUri + ' | User Abort'
        });
    });

    request.write(data);

    return this;
};

/**
 * 用于文件提交
 * @param callback
 * @param data 一般情况下为null
 * @param conf 附加条件
 * @returns {Proxy}
 * @private
 */
Proxy.prototype._multiPart = function (callback, data, conf) {

    /**
     * 上传文件
     * @param files 经过formidable处理过的文件
     * @param req
     * @param postData
     */
    function uploadFile(files, req, postData) {
        var boundaryKey = Math.random().toString(16);
        var endData = '\r\n----' + boundaryKey + '--';
        var filesLength = 0, content;

        // 初始数据，把post过来的数据都携带上去
        content = (function (obj) {
            var rslt = [];
            Object.keys(obj).forEach(function (key) {
                arr = ['\r\n----' + boundaryKey + '\r\n'];
                arr.push('Content-Disposition: form-data; name="' + key + '"\r\n\r\n');
                arr.push(obj[key]);
                rslt.push(arr.join(''));
            });
            return rslt.join('');
        })(postData);

        // 组装数据
        Object.keys(files).forEach(function (key) {
            if (!files.hasOwnProperty(key)) {
                delete files.key;
                return;
            }
            content += '\r\n----' + boundaryKey + '\r\n' +
            'Content-Type: application/octet-stream\r\n' +
            'Content-Disposition: form-data; name="' + key + '"; ' +
            'filename="' + files[key].name + '"; \r\n' +
            'Content-Transfer-Encoding: binary\r\n\r\n';
            files[key].contentBinary = new Buffer(content, 'utf-8');
            filesLength += files[key].contentBinary.length + fs.statSync(files[key].path).size;
        });

        req.setHeader('Content-Type', 'multipart/form-data; boundary=--' + boundaryKey);
        req.setHeader('Content-Length', filesLength + Buffer.byteLength(endData));

        // 执行上传
        var allFiles = Object.keys(files);
        var fileNum = allFiles.length;
        var uploadedCount = 0;
        allFiles.forEach(function (key) {
            req.write(files[key].contentBinary);
            var fileStream = fs.createReadStream(files[key].path, {bufferSize: 4 * 1024});
            fileStream.on('end', function () {
                // 上传成功一个文件之后，把临时文件删了
                fs.unlink(files[key].path);
                uploadedCount++;
                if (uploadedCount == fileNum) {
                    // 如果已经是最后一个文件，那就正常结束
                    req.end(endData);
                }
            });
            fileStream.pipe(req, {end: false});
        });
    }

    this.req.headers.host = this.host;
    var options = {
        host: this.host,
        port: this.port,
        headers: this.req.headers,
        path: this.remoteUri,
        agent: false,
        method: this.req.method
    };

    // 将文件上传
    uploadFile(this.req.__files, this._getHttpRequest(options, callback, conf), this.req.__post);

    return this;
};

/**
 * 获取Http包生成的Request实例，Proxy的核心
 * @param options
 * @param callback
 * @param conf
 * @returns {*}
 * @private
 */
Proxy.prototype._getHttpRequest = function (options, callback, conf) {
    var self = this;
    var request_timer;
    var startTime = new Date();

    var request = this.httpClient.request(options, function (response) {
        if (request_timer) clearTimeout(request_timer);

        var res_state = response.statusCode;
        if (200 != res_state && 400 != res_state && 4000 > res_state) {
            return callback(false, res_state);
        }

        var result = [];
        response.on('data', function (chunk) {
            result.push(chunk);
        });

        // 处理response
        var _dealResponse = function (data) {
            var buffer = data;
            try {
                data = data.toString('utf8');
                data = data ? (JSON.parse(data) || data) : false;
            } catch (err) {
                // 接口返回数据格式异常，解析失败
                monster.logger.debug({
                    status: res_state,
                    req: self.req,
                    msg: 'api-error:' + self.remoteUri
                });
            }

            callback && callback(data, res_state);

            // 如果配置了不结束response，则不执行res.end
            if (conf.endResponse !== false) {
                self.res.writeHead(response.statusCode, 'OK', {
                    'content-type': 'text/plain; charset=utf-8',
                    'content-length': buffer.length
                });
                self.res.write(buffer);
                self.res.end();
            }
        };

        response.on('end', function () {
            result = Buffer.concat(result);
            if (response.headers['content-encoding'] == 'gzip') {
                zlib.gunzip(result, function (err, dezipped) {
                    var data = err ? new Buffer('{}') : dezipped;
                    _dealResponse(data);
                });
            } else {
                _dealResponse(result);
            }
        });
    });
    request.on('error', function (e) {
        if (_detectApiError(self.remoteUri, null, self.req)) {
            monster.logger.info({
                status: 503,
                req: self.req,
                msg: JSON.stringify({
                    api: self.remoteUri,
                    status: 503,
                    useTime: new Date() - startTime
                })
            });
        }
        callback && callback(false, 503);
    });
    request_timer = setTimeout(function () {
        request.abort();
        if (_detectApiError(self.remoteUri, null, self.req)) {
            monster.logger.log('api', {
                status: 408,
                req: self.req,
                msg: JSON.stringify({
                    api: self.remoteUri,
                    status: 408,
                    useTime: new Date() - startTime
                })
            });
        }
        callback && callback(false, 408);
    }, 300000); // 文件上传的默认超时时间设置为5分钟

    self.notify && self.notify.on('abort', function () {
        if (!request_timer) return;
        clearTimeout(request_timer);
        request_timer = 0;
        request.abort();
        monster.logger.debug({
            status: 204,
            req: self.req,
            msg: 'api-error:' + self.remoteUri + ' | User Abort'
        });
    });
    return request;
};

/**
 * 创建一个Proxy实例
 * @param req
 * @param res
 * @param notify
 * @returns {Proxy}
 */
var create = function (req, res, notify) {
    return new Proxy(req, res, notify);
};

exports.__create = create;
