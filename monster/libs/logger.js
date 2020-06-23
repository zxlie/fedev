var fs = require('fs');

/**
 * 记录访问日志
 * @param status
 * @param req
 * @param msg
 */
var accessLog = function (status, req, msg) {
    var accessLogId = monster.config.path.log ? monster.config.path.log + 'access-' + monster.base.date('yyyyMMdd') + '.log' : false;
    mkLog(accessLogId, status, req, msg);
};

/**
 * 记录错误日志
 */
var errorLog = function (level, data) {
    var errorLogId = monster.config.path.log ? monster.config.path.log + 'error-' + monster.base.date('yyyyMMdd') + '.log' : false;
    var errorJsonId = monster.config.path.log ? monster.config.path.log + 'error-json-' + monster.base.date('yyyyMMdd') + '.log' : false;
    mkErrorLog(errorLogId, errorJsonId, data, level);
};

/**
 * 静态文件的log
 * @param status
 * @param req
 * @param msg
 */
var staticLog = function (status, req, msg) {
    var staticLogId = monster.config.path.log ? monster.config.path.log + 'static-' + monster.base.date('yyyyMMdd') + '.log' : false;
    mkLog(staticLogId, status, req, msg);
};

/**
 * 记录日志
 * @param file
 * @param logTxt
 */
var mkLog = function (file, status, req, msg) {
    var logTxt = msg;
    try {
        var headers = req.headers;
        logTxt = [monster.base.date('yyyy-MM-dd HH:mm:ss'), status,
            headers['clientIp'] || headers['x-forwarded-for'] || headers['x-real-ip'] || '-',
            (headers.host) + req.url, (new Date() - req.__request_time) + 'ms', msg || '', headers.referer || headers.referrer
        ].join(' | ');
    } catch (e) {
        logTxt = msg;
    }
    if (file) {
        fs.appendFile(file, logTxt + "\n");
    } else {
        console.log(logTxt)
    }
};

/**
 * 记录error日志
 * @param file
 * @param logTxt
 */
var mkErrorLog = function (file, jsonFile, data, level) {
    //init
    var req = data.req || {
            headers: {}
        };
    var msg = data.msg || '';
    var user_id = '';
    var shop_id = '';
    var status = data.status || 200;

    // 是否记录并发送到监控平台
    var needPhp = ['fatal', 'error'].indexOf(level) > -1;

    var logTxt = msg;
    var logJSON = {};
    try {

        var headers = req.headers;
        // 后端返回的数据
        var resData = req.__data || {};
        var curModule = (headers.host || '').split('.')[0];

        // 按照模块分别设置user_id和shop_id
        switch (curModule) {
            case 'shop':
                if (resData.userInfo && resData.userInfo.info) {
                    user_id = resData.userInfo.info.user_id;
                    shop_id = resData.userInfo.info.shop_id;
                }
                break;
            case 'pro':
                if (resData.shopInfo) {
                    shop_id = resData.shopInfo.shopId;
                }
                break;
            case 'lm':
                if (resData.userInfo && resData.userInfo.data) {
                    user_id = resData.userInfo.data.user_id;
                }
                break;
        }

        var logTime = monster.base.date('yyyy-MM-dd HH:mm:ss');
        var resTime = (new Date() - req.__request_time) + 'ms';

        var userAgent = headers['user-agent'];

        //打到日志文件的string
        logTxt = [logTime, status, level,
            headers['clientIp'] || headers['x-forwarded-for'] || headers['x-real-ip'] || '-',
            (headers.host) + req.url, resTime, msg || '', headers.referer, userAgent
        ].join(' | ');

        var php = null;
        if (needPhp) {
            // 把每个接口的httpCode都取出来
            var httpCodes = req.__httpCode || {};
            // 把访问的php接口、以及对应的返回code都记录下来
            var pagePhp = req.dataSource && req.dataSource.pageOnly;
            if (pagePhp && pagePhp && resData) {
                for (var key in pagePhp) {
                    php = php || {};
                    php[key] = {
                        php: pagePhp[key],
                        data: resData[key],
                        httpCode: httpCodes[pagePhp[key]]
                    };
                }
            }
        }

        //打到json文件里的对象
        logJSON = {
            'level': level,
            'ip': headers['clientIp'] || headers['x-forwarded-for'] || headers['x-real-ip'] || '-',
            'url': (headers.host) + req.url,
            'resTime': resTime,
            'referer': headers.referer,
            'userAgent': userAgent,
            'time': logTime,
            'status': status || '',
            'msg': msg,
            'php': php,
            'user_id': user_id,
            'shop_id': shop_id,
            'host_name': monster.config.server.hostname
        };
    } catch (e) {
        logTxt = msg;
        logJSON = {
            'level': 'debug',
            'ip': '',
            'url': '',
            'resTime': '',
            'referer': '',
            'time': '',
            'status': '',
            'msg': msg
        }
    }
    if (file) {
        fs.appendFile(file, logTxt + '\n');
    } else {
        console.log(logTxt)
    }

    //打印json文件
    if (jsonFile) {
        if (['fatal', 'error', 'api'].indexOf(logJSON.level) > -1) {
            fs.appendFile(jsonFile, JSON.stringify(logJSON) + '|--end--|');
        }
    }
};

//缺省日志
var defaultData = {
    'status': 500,
    'req': 'nothing',
    'msg': 'nothing',
    'user': '',
    'shop': ''
};

module.exports = {

    //debug模式，可打印字符串
    'debug': function (data) {
        if (typeof data === 'string') {
            errorLog('debug', {msg: data});
        } else {
            errorLog('debug', data || defaultData);
        }
    },

    //info，普通log —— 0
    'info': function (data) {
        errorLog('info', data || defaultData);
    },

    //warn,警告级别 —— 1
    'warn': function (data) {
        errorLog('warn', data || defaultData);
    },

    //error,错误级别 —— 2
    'error': function (data) {
        errorLog('error', data || defaultData);
    },

    //fatal,致命伤 —— 3
    'fatal': function (data) {
        data.status = 500;
        errorLog('fatal', data || defaultData);
    },

    //打Log的另外一种方式
    'log': function (level, data) {
        errorLog(level, data || defaultData);
    },

    'access': accessLog,
    'statics': staticLog
};