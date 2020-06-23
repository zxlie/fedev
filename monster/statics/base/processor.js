/**
 * 静态文件服务器模块
 * @author zhaoxianlie
 */
var url = require('url'),
    fs = require('fs'),
    path = require('path'),
    cluster = require('cluster');
var zlib = require('zlib');


var wrapJS = require('./commonJS.js').wrapJS;
var less = require('less');

// 本地开发&分支开发过程中的模块映射文件
var modMapFile = path.resolve('../../config/.mod.map.json');
// 本地开发时候，记录css文件的refer，向下传递给css中的图片
var referreMap = {};

var jsModDep = {};
var cache = {}, deponCache = {};

/**
 * 将完整路径转换为命名空间的路径
 * @param url
 * @return {String|XML|void}
 */
function realPathToNs(url) {
    return url.replace(/\/static\/js\//, ':');
}

/**
 * 将带有命名空间的地址修正为真实地址
 * @param url
 * @return {String|XML|void}
 */
function nsToRealPath(url, fileType) {
    fileType = fileType || 'js';
    // 非js、css的静态文件，默认都放到img目录下
    if (['js', 'css', 'swf'].indexOf(fileType) == -1) {
        fileType = 'img';
    }
    return url.replace(':', '/static/' + fileType + '/');
}

/**
 * 从path中提取命名空间
 * @param path
 */
function getNsFromPath(path) {
    var r = /([a-z]+)\/static\/(js|css|swf|img|html)/.exec(path) || /([a-z]+)\:.+/.exec(path);
    return (r && r[1]) ? r[1] : '';
}

/**
 * 获取指定命名空间下的jsMod.json文件路径
 * @param ns
 * @return {String}
 */
function getJsModJsonByNs(ns) {
    return '../../../' + ns + '/static/js/jsMod.json';
}

/**
 * 获取静态文件后缀名
 * @param url
 * @return {*}
 */
function getFileType(url) {
    var pos = url.lastIndexOf('.');
    if (pos > 0) {
        return url.substr(pos + 1);
    }
    return '';
}

function putInList(list, item) {
    if (list.indexOf(item) == -1) {
        list.push(item);
        return true;
    } else {
        return false;
    }
}

/**
 * 加载二进制文件（img、swf等）
 * @param filepath
 * @param res
 * @param onReady
 * @param fileType
 * @param req
 */
function loadBinaryFile(filepath, onReady, fileType, req) {
    filepath = filepath.replace(/^\//, '');
    filepath = monster.config.path.webRoot + filepath.replace(/\.\.\//g, '');
    // 解决中文名字的问题
    filepath = decodeURIComponent(filepath);

    var fileCacheKey = filepath;
    if (cache.hasOwnProperty(fileCacheKey)) {
        onReady(cache[fileCacheKey]);
        return;
    }

    if (!fs.existsSync(filepath)) {
        filepath = nsToRealPath(filepath, fileType);
    }

    fs.exists(filepath, function (exists) {
        if (!exists) {
            onReady(null, filepath);
            return;
        }
        function responseContent(file) {
            if (!monster.config.statics.isDebug) {
                cache[fileCacheKey] = file
            }
            onReady(file);
        }

        fs.readFile(filepath, function (err, file) {
            if (err) {
                onReady(null, filepath);
                return;
            }
            responseContent(file);
        });
    });
}

/**
 * 加载单个静态文件（css、js）
 * @param filepath
 * @param onReady
 * @param fileType
 * @param req
 */
function loadSingleFile(filepath, onReady, fileType, req) {
    // hold住当前静态文件最原始的名字
    var originFileName = filepath;
    // 如果没有fileType传入，则当成js来处理
    fileType = fileType || 'js';

    // 修正文件完整路径
    filepath = filepath.replace(/^\//, '');
    filepath = monster.config.path.webRoot + filepath.replace(/\.\.\//g, '');
    // 解决中文名字的问题
    filepath = decodeURIComponent(filepath);

    if (fileType == 'js' && !/.+\.js$/.test(filepath)) {
        filepath = filepath + '.js';
    } else if (fileType == 'css' && !/.+\.css$/.test(filepath)) {
        filepath = filepath + '.css';
    }

    if (!fs.existsSync(filepath)) {
        filepath = nsToRealPath(filepath, fileType);
    }

    // 如果是获取css文件，但恰好css文件又不存在，这个时候就需要看看目录下是否有对应名称的less文件
    if ('css' == fileType && !fs.existsSync(filepath)) {
        var lessFile = filepath.replace(/\.css$/, '.less');
        if (fs.existsSync(lessFile)) {
            filepath = lessFile;
            fileType = 'less';
        }
    }

    // 还有一种可能性，访问一个不存在的地址，可能把服务弄挂，所以需要纠正过来

    var fileCacheKey = filepath;
    var inHttps = req && req.headers.encrypted && 'css' == fileType;
    if (inHttps) fileCacheKey += '-https';
    if (cache.hasOwnProperty(fileCacheKey)) {
        onReady(cache[fileCacheKey], originFileName);
        return;
    }
    fs.exists(filepath, function (exists) {
        if (!exists) {
            onReady(null, filepath);
            return;
        }

        /**
         * 返回数据
         * @param fileContent
         */
        function responseContent(fileContent) {
            if (!monster.config.statics.isDebug) {
                cache[fileCacheKey] = fileContent
            }
            onReady(fileContent, originFileName);
        }

        // 如果是js文件，直接走commonJs规范返回结果
        if (!fileType || 'js' == fileType) {
            wrapJS(filepath, function (fileContent) {

                // 开发中可能处于调试模式，分支开发的话，需要进行分支模块 → 目录名的映射
                if (monster.config.statics.isDebug) {
                    if (req.headers.referer && fileContent.indexOf('/*common*/') == 0 && fs.existsSync(modMapFile)) {
                        var host = url.parse(req.headers.referer).hostname;
                        var ns = /fml\.define\(\'([\w\-]+)\:/.exec(fileContent);
                        ns = ns ? ns[1] : '';
                        var theApp = monster.config.vhost[host];
                        var originApp = require(modMapFile)[theApp];
                        if (ns === theApp && originApp) {
                            // 将静态文件的路径映射到真正的模块
                            fileContent = fileContent.replace(new RegExp(ns + '\\:', 'g'), originApp + ':');
                        }
                    }
                }

                responseContent(fileContent + ';')
            });
            return;
        }

        // 其他类型的文件，读取并处理，再返回，如css文件
        fs.readFile(filepath, 'utf8', function (err, fileContent) {
            if (err) {
                onReady(null, filepath);
                return;
            }
            if (less && 'less' == fileType) {
                var parser = new (less.Parser)({
                    paths: [filepath.substr(0, filepath.lastIndexOf('/'))]
                });
                var theFile = filepath.replace(monster.config.path.webRoot, '');
                parser.parse(fileContent, function (err, tree) {
                    if (!err) {
                        try {
                            fileContent = tree.toCSS({compress: true});
                        } catch (e) {
                            fileContent = 'File [' + theFile + '] parse error:\n' + JSON.stringify(e, null, 4);
                        }
                    } else {
                        fileContent = 'File [' + theFile + '] parse error:\n' + JSON.stringify(err, null, 4);
                        console.log(fileContent);
                    }
                    responseContent(fileContent);
                });
            } else {
                responseContent(fileContent);
            }
        });
    });
}

/**
 * 按顺序加载js静态文件：多文件合并请求的情况，自动引入并合并到一个文件
 * @param jsBlocks
 * @param onReady
 */
function loadMultiJsFile(jsBlocks, onReady, filetype, req) {
    var loadedList = [], depMods = [];

    // 当前已加载的依赖文件总数
    var loadedDepFileNum = 0;
    // 当前已加载的file-block文件总数
    var loadedBlockFileNum = 0;
    // 已加载的文件缓存
    var loadedFileCache = {};

    if (!jsBlocks) return;
    // 去掉 .js 的后缀，保证require-module的完整性
    var ext = jsBlocks.substr(-3);
    if (ext == '.js') {
        jsBlocks = jsBlocks.substr(0, jsBlocks.length - 3);
    }
    var blocks = jsBlocks.split('+');

    // 将文件依赖添加到depMods中
    blocks.forEach(function (mod) {
        var ns = getNsFromPath(mod) || getNsFromPath(nsToRealPath(mod, filetype));
        if (jsModDep && jsModDep[ns]) {
            var depon = jsModDep[ns][mod] || jsModDep[ns][realPathToNs(mod)] || [];
            depon.forEach(function (dep) {
                if (putInList(loadedList, dep)) {
                    depMods.push(dep);
                }
            });
        }
    });
    deponCache[jsBlocks] = depMods;

    /**
     * 当单个文件加载成功后执行
     * @param data
     * @param js
     */
    function onSingleFileLoaded(data, js) {
        if (data === null) {
            onReady(null, js);
            return;
        }
        if (data) {
            if (js in loadedFileCache) {
                loadedFileCache[js] += data;
            } else {
                loadedFileCache[js] = data;
            }
        }
        // 全部文件都加载完毕了，就把内容拼起来，response到客户端
        if (++loadedBlockFileNum >= blocks.length) {
            var content = '';
            (blocks.concat(depMods || [])).forEach(function (mod) {
                if (mod in loadedFileCache) {
                    content += loadedFileCache[mod];
                }
            });
            delete loadedFileCache;
            onReady(content, js);
        }
    }

    /**
     * 加载当前网络请求的文件
     */
    function loadCurFile() {
        blocks.forEach(function (mod) {
            if (!mod) {
                return;
            }
            if (!putInList(loadedList, mod)) {
                ++loadedBlockFileNum;
                return;
            }
            loadSingleFile(mod, onSingleFileLoaded, filetype, req);
        });
    }

    /**
     * 先加载依赖的文件，再加载当前网络请求的文件本身
     */
    function loadDepThenCurFile() {
        depMods.forEach(function (filePath) {
            loadSingleFile(filePath, onSingleDepFileLoaded, filetype, req);
        });
    }

    /**
     * 当单个依赖的module加载成功后执行，检查依赖的module是否已加载完成，如果加载完成，
     * 则开始加载原始的入口文件：jsBlocks
     */
    function onSingleDepFileLoaded(data, filepath) {
        // 文件不存在
        if (data === null) {
            onSingleFileLoaded(null, filepath);
            return;
        } else {
            // 把文件内容缓存起来
            if (filepath in loadedFileCache) {
                loadedFileCache[filepath] += data;
            } else {
                loadedFileCache[filepath] = data;
            }
        }
        if (++loadedDepFileNum >= depMods.length) {
            loadCurFile();
        }
    }

    // 优先加载js module deps，再加载文件本身
    if (depMods.length) {
        loadDepThenCurFile();
    } else {
        // 如果没有依赖的文件，就直接加载当前文件
        loadCurFile();
    }
}

/**
 * 按顺序加载css静态文件：多文件合并请求的情况，自动引入并合并到一个文件
 * @param cssBlocks
 * @param onReady
 */
function loadMultiCssFile(cssBlocks, onReady, filetype, req) {
    var loadedList = [];

    // 当前已加载的file-block文件总数
    var loadedBlockFileNum = 0;
    // 已加载的文件缓存
    var loadedFileCache = {};

    if (!cssBlocks) return;
    var blocks = cssBlocks.split('+');

    /**
     * 当单个文件加载成功后执行
     * @param data
     * @param css
     */
    function onSingleFileLoaded(data, css) {
        if (data === null) {
            onReady(null, css);
            return;
        }

        if (data) {
            if (css in loadedFileCache) {
                loadedFileCache[css] += data;
            } else {
                loadedFileCache[css] = data;
            }
        }
        // 全部文件都加载完毕了，就把内容拼起来，response到客户端
        if (++loadedBlockFileNum >= blocks.length) {
            var content = '';
            blocks.forEach(function (mod) {
                if (mod in loadedFileCache) {
                    content += loadedFileCache[mod];
                }
            });
            delete loadedFileCache;
            onReady(content, css);
        }
    }

    /**
     * 加载当前网络请求的文件
     */
    function loadCurFile() {
        blocks.forEach(function (mod) {
            if (!putInList(loadedList, mod)) {
                ++loadedBlockFileNum;
                return;
            }
            loadSingleFile(mod, onSingleFileLoaded, filetype, req);
        });
    }

    loadCurFile();
}

/**
 * 输出Http请求的内容
 * @param data
 * @param file
 * @param headers
 * @param req
 * @param res
 * @private
 */
function endResponse(data, file, headers, req, res) {
    if (data == null) {
        if (res.connection) {
            monster.logger.statics(404, req, 'File not found');
            res.writeHead(404, {'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*'});
            res.write('File [' + file.replace(monster.config.path.webRoot, '') + '] is not found!');
            res.end();
        }
    } else {
        monster.logger.statics(200, req, 'File loaded');

        var _end = function (data, hds) {
            res.writeHead(200, hds);
            res.write(data);
            res.end();
        };

        // 如果没有开启gzip，则直接输出
        if (!monster.config.statics.gzip) {
            _end(data, headers);
            return;
        }
        try {
            // 先看浏览器支持哪一种压缩方式
            var acceptEncoding = req.headers['accept-encoding'];
            // See http://www.w3.org/Protocols/rfc2616/rfc2616-sec14.html#sec14.3

            if (acceptEncoding.match(/\bgzip\b/)) {
                zlib.gzip(new Buffer(data), function (err, zipped) {
                    if (!err) {
                        headers['content-encoding'] = 'gzip';
                        data = zipped;
                    }
                    _end(data, headers);
                });

            } else if (acceptEncoding.match(/\bdeflate\b/)) {
                zlib.deflate(new Buffer(data), function (err, deflated) {
                    if (!err) {
                        headers['content-encoding'] = 'deflate';
                        data = deflated;
                    }
                    _end(data, headers);
                });
            } else {
                _end(data, headers);
            }
        } catch (err) {
            _end(data, headers);
        }
    }
}

/**
 * 可能是本地开发，需要加工一下请求文件的路径
 * @param statfs
 * @param filetype
 * @param req
 * @returns {*}
 * @private
 */
function validateFilePath(statfs, filetype, req) {
    // 开发中可能处于调试模式，分支开发的话，需要进行分支模块 → 目录名的映射
    if (monster.config.statics.isDebug && req.headers.referer && fs.existsSync(modMapFile)) {
        var host = url.parse(req.headers.referer).hostname;
        var theApp = monster.config.vhost[host];
        // 记录css的referer，向下传递给其中的img
        if (filetype == 'css') {
            referreMap['http://' + req.headers.host + req.url] = req.headers.referer;
        } else if (filetype != 'js') {
            // 如果请求的文件既不是css，也不是js，那就必然是静态文件了
            if (!theApp) {
                host = url.parse(referreMap[req.headers.referer]).hostname;
                theApp = monster.config.vhost[host];
            }
        }
        var originApp = require(modMapFile)[theApp];
        var ns = getNsFromPath(statfs) || getNsFromPath(nsToRealPath(statfs, filetype));
        if (ns == originApp && theApp) {
            // 将静态文件的路径映射到真正的模块
            statfs = statfs.replace(new RegExp(ns + '\\:', 'g'), theApp + ':')
                .replace(new RegExp('^(?:\\+)?\/(' + ns + ')(\/.*)'), function () {
                    return '/' + theApp + arguments[2]
                }).replace(new RegExp('\\/' + ns + '\\/static\\/', 'g'), function () {
                    return '/' + theApp + '/static/';
                });
        }
    }
    return statfs;
}

/**
 * 获取处理器
 * @param req
 * @returns {{uri: *, fileType: (*|string), func: *, response: endResponse}}
 */
exports.getProcessor = function (req) {

    var uri = url.parse(req.url).pathname;
    uri = uri.replace(/\/+/g, '/');

    var filetype = getFileType(uri) || 'js';
    var multiLoad = false;
    if ('~' == uri[1]) {
        uri = uri.substr(2);
        multiLoad = true;
    }

    if ('js' == filetype) {
        // 分析文件依赖
        var ns = getNsFromPath(uri);
        // 把当前模块的依赖情况记下来
        if (ns && !jsModDep[ns]) {
            var jsMod = getJsModJsonByNs(ns);
            if (fs.existsSync(jsMod)) {
                jsModDep[ns] = require(jsMod);
            }
        }
    }

    // 根据实际情况，加工请求的文件路径
    uri = validateFilePath(uri, filetype, req);

    // 静态文件加载方式
    var funcName = null;
    if (multiLoad) {
        // 批量加载
        funcName = filetype == 'css' ? loadMultiCssFile : loadMultiJsFile;
    } else if (['css', 'less', 'js'].indexOf(filetype) > -1) {
        // 单个css和js静态文件
        funcName = loadSingleFile;
    } else {
        // 当成二进制文件直接加载
        funcName = loadBinaryFile;
    }

    return {
        uri: uri,
        fileType: filetype,
        func: funcName,
        response: endResponse
    };
};