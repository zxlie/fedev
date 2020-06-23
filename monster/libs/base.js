var util = require('util'),
    cryto = require('crypto'),
    fs = require('fs');

/**
 * 对象拷贝
 * @param obj
 * @returns {{}}
 */
exports.cloneObj = function (obj) {
    var ret = {};
    for (var keys = Object.keys(obj), l = keys.length; l; --l)
        ret[keys[l - 1]] = obj[keys[l - 1]];

    return ret;
};

exports.isUnDefined = function (varObj) {
    return ('undefined' == typeof varObj);
};

exports.md5 = function md5(str) {
    return str ? cryto.createHash('md5').update(str.toString()).digest("hex") : '';
};

exports.array_merge = function (f) {
    var ret = f;
    var args = Array.prototype.slice.call(arguments, 1);
    var argLen = args.length;
    for (var i = 0; i < argLen; i++) {
        var o = args[i];
        if (!o) continue;
        for (var k in o) {
            ret[k] = o[k];
        }
    }
    return ret;
};

/**
 * 继承并创建新对象
 * @param clsContruct
 * @param supClsObj
 * @param override
 * @returns {clsContruct|*}
 */
exports.inherit = function (clsContruct, supClsObj, override) {

    //override = !!override;
    if ('function' == typeof supClsObj) {
        supClsObj = new supClsObj;
    }
    clsObj = new clsContruct;


    for (var attr in supClsObj) {
        if (override || !clsObj[attr]) {
            if (supClsObj.hasOwnProperty(attr)) {
                clsObj[attr] = supClsObj[attr];
            } else {
                clsContruct.prototype[attr] = supClsObj[attr];
            }
        }
    }
    return clsObj;
};

/**
 * 对象继承
 * @param obj1
 * @param obj2
 * @returns {*}
 */
exports.extend = function (obj1, obj2) {
    var obj = exports.cloneObj(obj1 || {});
    obj2 = obj2 || {};
    for (var key in obj2) {
        if (obj2.hasOwnProperty(key)) {
            obj[key] = obj2[key];
        }
    }
    return obj;
};


/**
 * mkdir -p a/b/c
 * @param p
 */
exports.mkDirP = function (p) {
    p = p.split('/');
    var pathnow = '';
    p.map(function (pi) {
        pathnow += pi + '/';
        if (!fs.existsSync(pathnow)) {
            fs.mkdirSync(pathnow);
        }
    });
};

exports.error = require('./errorExport.js');
exports.date = require('./date.js');
exports.mimeType = require('./mimeType.js');
exports.watchFile = require('./watcher.js');