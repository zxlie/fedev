/**
 * est模板引擎的插件方法
 * @author xianliezhao
 */
var fs = require('fs');
var path = require('path');
var url = require('url');
var crypto = require('crypto');
var staticFileStamps;
var jsModDep;

/**
 * HTML转义
 * @param str
 * @returns {string}
 */
exports.html_encode = function(str) {
    str = String(str) || "";
    return str.toString()
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\"/g, '&quot;')
        .replace(/'/g, '&#039;');
};

/**
 * URL转义
 * @param str
 * @returns {string}
 */
exports.url_encode = function(str) {
    return encodeURIComponent(str);
};

/**
 * 对象克隆
 * @param obj
 * @returns {{}}
 */
exports.cloneObj = function(obj) {
    var ret = {};
    for (var keys = Object.keys(obj), l = keys.length; l; --l)
        ret[keys[l - 1]] = obj[keys[l - 1]];

    return ret;
};

/**
 * 字符串截取
 * @param str
 * @param len
 * @param pad
 * @returns {string}
 */
exports.substr = exports.mSubstr = function(str, len, pad) {
    if (!str || 0 == str.length) return '';
    if (undefined == pad) pad = '...';
    len = (function getStringLengthArr(s, len) {
        var w = 0;
        var time = 0;
        for (length = s.length; time < length;) {
            if (/[^\x00-\xff]/.test(s[time])) {
                w += 2;
            } else {
                w += 1;
            }
            time++;
            if (w >= (len * 2)) {
                break;
            }
        }
        return time;
    })(str, len);
    return str.substr(0, len) + ((pad && str.length > len) ? pad : '');
};

/**
 * 将\n转换为br换行符
 * @param html
 * @returns {*}
 */
exports.nl2br = function(html) {
    if (typeof html != 'string') {
        console.log(html, 'not a string');
        return '';
    }
    return html.replace(/\n/g, '<br />');
};

/**
 * 将query对象拼接成一个url
 * @param obj
 * @param query
 * @returns {string}
 */
exports.getLink = function(obj, query) {
    obj = obj || {};
    query = query || {};
    var url = [];
    delete query['frm'];
    for (var k in query) {
        if (k in obj) continue;
        url.push(k + '=' + encodeURIComponent(query[k]));
    }

    for (var x in obj) {
        if (obj[x] === null) continue;
        url.push(x + '=' + encodeURIComponent(obj[x]));
    }

    return '?' + url.join('&');
};

/**
 * 日期格式化：将日期对象转换为pattern对应的字符串
 * @param source  日期对象
 * @param pattern   日期格式化规则，默认：yyyy-MM-dd
 */
exports.dateFormat = function(source, pattern) {
    if ('string' != typeof pattern) {
        return source.toString();
    }
    if (!(source instanceof Date)) {
        source = new Date(source);
    }

    if (!pattern) {
        pattern = 'yyyy-MM-dd';
    }

    function replacer(patternPart, result) {
        pattern = pattern.replace(patternPart, result);
    }

    var pad = function(source, length) {
        var pre = "",
            negative = (source < 0),
            string = String(Math.abs(source));

        if (string.length < length) {
            pre = (new Array(length - string.length + 1)).join('0');
        }

        return (negative ? "-" : "") + pre + string;
    };

    var year = source.getFullYear(),
        month = source.getMonth() + 1,
        date2 = source.getDate(),
        hours = source.getHours(),
        minutes = source.getMinutes(),
        seconds = source.getSeconds();

    replacer(/yyyy/g, pad(year, 4));
    replacer(/yy/g, pad(parseInt(year.toString().slice(2), 10), 2));
    replacer(/MM/g, pad(month, 2));
    replacer(/M/g, month);
    replacer(/dd/g, pad(date2, 2));
    replacer(/d/g, date2);

    replacer(/HH/g, pad(hours, 2));
    replacer(/H/g, hours);
    replacer(/hh/g, pad(hours % 12, 2));
    replacer(/h/g, hours % 12);
    replacer(/mm/g, pad(minutes, 2));
    replacer(/m/g, minutes);
    replacer(/ss/g, pad(seconds, 2));
    replacer(/s/g, seconds);

    return pattern;
};

/**
 * 获取一堆静态文件的merge到一起的唯一戳
 * @param files 静态文件列表，array
 * @param type 文件类型：css 、 js
 */
var getStamp = exports.getStamp = function(files, type) {
    files = [].concat(files);
    type = type || 'css';
    // 戳都缓存：到文件
    var fileStamp = path.resolve(monster.config.path.log + '/static-file-stamp.json');
    var defaultVersion = new Date().getTime();
    var cache = {}, result;
    var key = files.join(',');

    // 将带有命名空间的地址修正为真实地址
    var _nsToRealPath = function(url, fileType) {
        fileType = fileType || 'css';
        return path.resolve(__dirname + '/../../../') + '/' + url.replace(':', '/static/' + fileType + '/');
    };

    // 从path中提取命名空间
    var _getNsFromPath = function(path) {
        var r = /([a-z]+)\/static\/(js|css|swf|img|html)/.exec(path) || /([a-z]+)\:.+/.exec(path);
        return (r && r[1]) ? r[1] : '';
    };

    // 获取指定命名空间下的jsMod.json文件路径
    var _getJsModJsonByNs = function(ns) {
        return path.resolve(__dirname + '../../../../' + ns + '/static/js/jsMod.json');
    };

    // 将完整路径转换为命名空间的路径
    var _realPathToNs = function(url) {
        return url.replace(/\/static\/js\//, ':');
    };

    // 根据内容生成md5
    var _getMd5 = function(content) {
        var md5 = crypto.createHash('md5').update(content).digest("hex");
        return md5.substr(-10);
    };

    // 获取一个js文件的stamp（可能有依赖文件）
    var _getJsStamp = function(filename) {
        var arr = [],
            stamp;
        var file = _nsToRealPath(filename, type);
        var tmp = file;
        // js有相互依赖，所以需要把内容都读取出来生成一个md5
        if (!(new RegExp('\\.' + type + '$')).test(filename)) {
            tmp = file + '.' + type;
        }

        var md5 = defaultVersion;
        // 如果文件存在，则用文件内容生成md5戳
        if (fs.existsSync(tmp)) {
            md5 = _getMd5(fs.readFileSync(tmp));
        }
        arr.push(md5);

        // 分析当前这个静态js属于哪个模块
        var ns = _getNsFromPath(filename) || _getNsFromPath(_nsToRealPath(filename, type));
        if (!jsModDep || !jsModDep[ns]) {
            var jsModFile = _getJsModJsonByNs(ns);
            if (fs.existsSync(jsModFile)) {
                jsModDep = jsModDep || {};
                jsModDep[ns] = require(jsModFile);
            }
        }
        if (jsModDep && jsModDep[ns]) {
            var depon = jsModDep[ns][filename] || jsModDep[ns][_realPathToNs(filename)] || [];
            depon.forEach(function(dep) {
                if (!cache[dep]) {
                    stamp = _getJsStamp(dep);
                    staticFileStamps[type][dep] = stamp;
                    arr.push(stamp);
                    cache[dep] = true;
                }
            });
        }

        return _getMd5(arr.join(','));
    };

    // 获取css文件的stamp
    var _getCssStamp = function(filename) {
        var file = _nsToRealPath(filename, type);
        var tmp = file;
        if (!(new RegExp('\\.' + type + '$')).test(filename)) {
            tmp += '.' + type;
            if (!fs.existsSync(tmp)) {
                tmp = file + '.' + 'less';
            }
        }
        // 如果文件存在，则用文件内容生成md5戳
        if (fs.existsSync(tmp)) {
            return _getMd5(fs.readFileSync(tmp));
        } else {
            return defaultVersion;
        }
    };

    // 内存缓存中有，就直接返回
    if (staticFileStamps && staticFileStamps[type]) {
        result = staticFileStamps[type][key];
        if (result) {
            return result;
        }
    } else if (staticFileStamps && !staticFileStamps[type]) {
        staticFileStamps[type] = {};
    } else {
        staticFileStamps = {
            'css': {},
            'js': {}
        };
    }

    // 如果缓存文件存在，则直接从缓存文件中获取hash
    if (fs.existsSync(fileStamp)) {
        try {
            staticFileStamps = require(fileStamp);
            staticFileStamps && (result = staticFileStamps[type][key]);
        } catch (e) {
            return _getMd5(defaultVersion);
        }
    }
    // 如果result为空，则重新读取文件生成
    if (!result) {
        result = files.map(function(filename) {
            if (!filename) {
                return '';
            }
            var stamp;
            if (type == 'css') {
                stamp = _getCssStamp(filename);
            } else {
                stamp = _getJsStamp(filename);
            }
            staticFileStamps[type][filename] = stamp;
            return stamp;
        }).join(',');
        result = _getMd5(result);
        staticFileStamps[type][key] = result;
        fs.writeFileSync(fileStamp, JSON.stringify(staticFileStamps, null, 4));
    }

    return result;
};

/**
 * 引用静态文件
 * @param staticDomain 静态文件域名
 * @param files 需要引入的静态文件
 * @param opts 配置项
 */
exports.importFiles = function(staticDomain, files, opts) {
    files = [].concat(files);
    // 过滤掉不合法的file
    var arr = [];
    files.forEach(function(f) { !! f ? arr.push(f) : '';
    });
    files = arr;

    var result = '';
    if (files.length) {
        opts = opts || {};
        if (typeof opts !== 'object') {
            opts = {
                type: opts
            };
        }
        var stamp = getStamp(files, opts.type);
        if (opts.type == 'js') {
            result = '<script type="text/javascript" src="' +
                staticDomain + '~' + files.join('+') + '.js' +
                '?v=' + stamp + '" ></script>';
        } else {
            result = '<link rel="stylesheet" href="' +
                staticDomain + '~' + files.join('+') + '.css' +
                '?v=' + stamp + '" />';
        }

        // 如果是加载js，并且指定为defer模式load全部，则处理之
        if (opts.type == 'js' && opts.load && opts.defer) {
            result += '<script>fml.iLoad();</script>';
        }
    }
    return result;
};