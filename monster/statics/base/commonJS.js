#!/usr/bin/env node
var fs = require('fs')
    , path = require('path');

// 这里的webRoot其实就是获取环境根路径
// 通过这个webRoot，就能很轻松的获取到任何模块的js路径，比如；${webRoot}/pro/static/js/hello.js
var webRoot = path.resolve('../../'),
    specialTag = '/*common*/';

function stripComment(js) {
    var commentStart = js.indexOf('/*')
    if (-1 == commentStart) return js
    var commentEnd = js.indexOf('*/', commentStart + 1)
    js = js.slice(0, commentStart) + js.slice(commentEnd + 2)
    return stripComment(js)
}

function fillDefine(modname, depends, js) {
    var jsDepend = depends.length ? "'" + depends.join("','") + "'" : ''
    js = js.slice(specialTag.length)
    js = specialTag + "\nfml.define('" + modname + "',[" + jsDepend + "], function(require,exports){\n" + js + "})"
    return js
}

function wrapJS(filepath, cbk, option) {
    if (!filepath) return;
    option = option || {};
    filepath = path.resolve(filepath);
    function onReturn(js, modname, depend) {
        var ret = js;
        if (option.getDepend) {
            ret = depends;
        }
        if (option.getAll) {
            ret = {
                modname:modname,
                depend:depends,
                content:js
            };
        }

        if (cbk) {
            return cbk(ret);
        }
        return ret;
    }

    var js = fs.readFileSync(filepath, 'utf8');
    var depends = getDepend(js);
    if (false === depends) {
        return onReturn(js);
    }
    var modname = filepath.slice(webRoot.length + 1).replace(/\.js$/, '');
    // 如果符合命名空间规范，则抽取一层，即：pro/static/js/page/hello → page:page/hello
    modname = modname.replace(/\w+(\/static\/js\/).*/,function($0,$1){
        return $0.replace($1,':');
    });
    js = fillDefine(modname, depends, js);

    return onReturn(js, modname, depends);
}

function wrapJSC(modname, js) {
    var depends = getDepend(js);
    if (false === depends) {
        return false;
    }
    return fillDefine(modname, depends, js);
}

function getDepend(js) {
    if (!js || js.indexOf(specialTag) != 0) return false;
    if (js.indexOf('fml.define') != -1) return false;

    js = stripComment(js);

    var depends = [];

    global.window = global.document = global.global = {};

    function emptyFn() {
    }

    function require(modName) {
        if (modName && depends.indexOf(modName) == -1) depends.push(modName);
        return {};
    }

    function require2(modName) {
        if (modName && depends.indexOf(modName) == -1) depends.push(modName);
        return emptyFn;
    }

    var jsLine = js.split('\n');
    
    // 正则匹配这种情况：require (
    var reg = /\brequire\b(?=\s*\()/;
    jsLine.forEach(function (line) {
        if (!reg.test(line))  return;
        line = line.replace(/,/g, ';');
        try {
            var evaFn = new Function('require', line);
            evaFn(require);
        } catch (err) {
            try {
                evaFn(require2);
            } catch (err2) {
                console.log(err, err2, line);
            }
        }
    })
    return depends;
}

exports.getTag = function () {
    return specialTag;
}
exports.wrapJS = wrapJS;
exports.wrapJSC = wrapJSC;
exports.getDepend = function (filepath, cbk) {
    return wrapJS(filepath, cbk, {getDepend:true});
}
exports.getAll = function (filepath, cbk) {
    return wrapJS(filepath, cbk, {getAll:true});
}

var args = process.argv.slice(1);
if (args.length > 1 && args[0] == __filename) {
    console.time('a');
    wrapJS(args[1], function (js) {
        console.timeEnd('a');
        console.log(js);
    })
}

