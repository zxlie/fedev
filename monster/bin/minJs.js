#!/usr/bin/env node

// js静态文件跟目录
var jsDir = '';
var curApp = '';
var path = require('path'),
    fs = require('fs'),
    uglify = require('uglify-js');

var commonJS = require('../statics/base/commonJS.js');

var nodepencies = ['fml'];
var modDepMap = {};

// js module映射文件，会生成到每个模块的js目录下，如：pro/static/js/jsMod.json
var mapFileName = 'jsMod.json';


// ==================================start===================================
// 下面这些代码用来生成js module的映射关系
global.moding;
global.fml = {
    'define': function (modName, depencies, callback) {
        var args = Array.prototype.slice.call(arguments, 0);
        if (args.length < 3) {
            callback = args.pop();
            if (typeof callback != 'function') {
                if (args.length === 1) {
                    depencies = callback;
                    modName = args[0];
                } else {
                    if (Array.isArray(callback)) {
                        depencies = callback;
                        modName = global.moding;
                    } else {
                        modName = callback || global.moding;
                        depencies = [];
                    }
                }
                callback = function () {
                };
            } else {
                if (args.length === 1) {
                    if (Array.isArray(args[0])) {
                        modName = global.moding;
                        depencies = args[0];
                    } else {
                        modName = args[0];
                        depencies = [];
                    }
                } else {
                    depencies = [];
                    modName = global.moding;
                }
            }
        }
        if (global.moding != modName) {
            if (/^[\w]+\:[\w\/\-]+$/.test(modName) || /^[\w]+\/static\/js\/$/.test(modName)) {
                global.moding = modName;
            } else {
                console.log('Error:' + modName + ' should be ' + global.moding)
            }
        }
        pushDep(global.moding, depencies);
    },
    'use': function (modName) {
        pushDep(global.moding, modName);
    }
};

function getDepencies(filepath) {
    var modname = filepath.substr(jsDir.length + 1).replace('.js', '');
    if (nodepencies.indexOf(modname) > -1) return;
    // 这里得到的modname类似：diamond/offer，但真正的moduleName应该是：pro:diamond/offer
    // 或者：pro/static/js/diamond/offer ，所以需要在global.fml.define中进行再次判断
    global.moding = curApp + ':' + modname;

    try {
        // 尝试去require这个模块，看看路径是否正确，如果正确，则生成dep
        // 会进入到某模块的define活着use方法中，不会执行其callback
        require(filepath);
    } catch (e) {
        var reg = /^(ReferenceError|TypeError)\:/i;
        if (!reg.test(e)) {
            console.log('Warning: [ %s ]: %s ', modname, e);
        }
    }
}

/**
 * 生成模块的js依赖文件
 */
function genModConfig() {
    for (var mod in modDepMap) {
        modDepMap[mod] = allDepOn(modDepMap[mod]);
    }
    var map = JSON.stringify(modDepMap, null, 4);
    fs.writeFileSync(jsDir + '/' + mapFileName, map);
}

function allDepOn(deps) {
    if (!deps || deps.length == 0) return null;
    if ('string' == typeof deps) deps = [deps];
    deps.map(function (dep) {
        if (modDepMap[dep]) {
            var deepD = allDepOn(modDepMap[dep]);
            if (deepD) {
                deepD.map(function (dp) {
                    if (deps.indexOf(dp) == -1) deps.push(dp);
                });
            }
        }

    });
    return deps;
}

function pushDep(modName, depencies) {
    if (!modName) return
    if (!modDepMap[modName]) modDepMap[modName] = [];
    modDepMap[modName] = modDepMap[modName].concat(depencies);
}
// ==================================end===================================


/**
 * 用uglifyjs压缩js代码（对源文件进行压缩）
 * @param filepath
 */
function minify(filepath) {
    var wrapJS = commonJS.getAll(path.resolve(filepath));
    if (wrapJS && wrapJS.modname && wrapJS.depend) {
        if (wrapJS.depend.length) {
            pushDep(wrapJS.modname, wrapJS.depend);
        }
    } else {
        getDepencies(filepath);
    }
    try {
        fs.writeFile(filepath, uglify(wrapJS.content));
    } catch (err) {
        // 压缩失败以后投log，并且在原内容头部加上一个标识
        console.log(filepath, err);
        var errFlag = '/*! file parse error,uglifyjs deal failed! */\n';
        fs.writeFile(filepath, errFlag + wrapJS.content);
    }
}

/**
 * js压缩
 * @param folder
 */
function minjs(folder) {
    // 如果该模块压根儿就没有js文件，那就不需要进行压缩了
    if (!fs.existsSync(folder)) {
        return;
    }
    var files = fs.readdirSync(folder);
    files.map(function (file) {
        if ('.' == file[0]) {
            return;
        }
        var filepath = folder + '/' + file;
        var stat = fs.statSync(filepath);
        if (stat.isFile() && /.*\.js$/.test(file)) {
            minify(filepath);
        } else if (stat.isDirectory()) {
            minjs(filepath);
        }
    });
}

var start = new Date();

// 读取参数，可能有单文件(夹)压缩的需求
var args = process.argv.splice(2);
if (args[0] && fs.existsSync(args[0])) {
    jsDir = args[0];
    curApp = args[1];
    // 指定压缩某js文件，如： node minJs.js js/page/hello.js
    if (fs.statSync(args[0]).isFile()) {
        minify(jsDir);
    }
    // 指定压缩某文件夹，如：node minJs.js pro/static/js
    else {
        minjs(jsDir);
        // 更新模块依赖
        genModConfig();
        console.log("js文件压缩完成！耗时" + (new Date() - start) + 'ms');
    }
} else {
    // 必须指定需要压缩的js文件或文件夹
    console.log("必须指定需要压缩的js文件或文件夹");
}
