/**
 * 给静态文件加戳
 * @author xianliezhao
 */
var fs = require('fs');
var crypto = require('crypto');
var path = require('path');
// 只对图片、swf等资源加戳
var reg = /\w+\/static\/(?:js|css|swf|img)\/[\w\/\.\-]+?\.(?:swf|f4v|png|jpg|gif|jpeg|ico|cur)(\?[\w\.\-]*)?/igm;
var moduleName = '';
var cache = {};

/**
 * 扫描某个目录，进行加戳处理
 * @param dir 需要扫描的文件夹
 * @param filetypes 需要处理的文件类型列表，如：[css,less]
 * @private
 */
function _scanDir(dir, filetypes) {
    var reg = new RegExp('\\.' + filetypes.join('|') + '$');
    fs.readdir(dir, function (err, files) {
        if (!err && files) {
            files.forEach(function (file) {
                if (file == '.svn') return;
                var realpath = dir + '/' + file;
                fs.stat(realpath, function (e, stats) {
                    if (!e) {
                        if (stats.isFile()) {
                            reg.test(file) && _addStamp(realpath);
                        } else if (stats.isDirectory()) {
                            _scanDir(realpath, filetypes);
                        }
                    }
                });
            });
        }
    });
}

/**
 * 分析某个静态文件，找到所引用的其他静态文件，给其加戳
 * @param file
 * @private
 */
var _addStamp = function (file) {

    fs.readFile(file, function (err, content) {
        if (err) {
            return;
        }
        content = content.toString('utf-8');
        var result = content.replace(reg, _sha1It);
        if (content != result) {
            var ws = fs.createWriteStream(file);
            ws.on('close', function () {
                delete content;
                delete result;
            });
            ws.write(result);
        }
    });
};

/**
 * 获取某种类型文件的绝对路径
 * @param type
 * @returns {*}
 * @private
 */
var _getPath = function (type) {
    var rootPath = _getRootPath();
    var paths = {
        js: rootPath + moduleName + '/static/js',
        css: rootPath + moduleName + '/static/css',
        tpl: rootPath + moduleName + '/views'
    };
    return paths[type];
};

/**
 * 获取环境的根目录
 * @returns {*|String}
 * @private
 */
var _getRootPath = function () {
    return path.resolve(__dirname + '/../../') + '/';
};

/**
 * 根据所引用的文件，替换或增加戳
 * @param filepath 引用的文件
 * @param query 包含的query
 */
var _sha1It = function (filepath, query) {
    // 获取被引用的静态文件的真实路径
    var file = _getRootPath() + filepath.replace(query, '');

    // 如果文件不存在，那就用这个默认的时间戳了
    var md5 = +new Date();
    if (fs.existsSync(file)) {
        // 文件存在的情况下，就用文件内容生成md5
        if (!cache[file]) {
            var content = fs.readFileSync(file);
            md5 = crypto.createHash('md5').update(content).digest("hex");
            delete content;
            cache[file] = md5;
        } else {
            md5 = cache[file];
        }
    }

    //获取字符串的后八位
    var stamp = String(md5).substr(-10);
    var result;

    // 加v参数模式
    if (query) {
        if (/v=\w*/i.test(query)) {
            result = filepath.replace(/v=\w*/i, 'v=' + stamp);
        } else {
            result = filepath + '&v=' + stamp;
        }
    } else {
        result = filepath + '?v=' + stamp;
    }
    return result;
};

/**
 * 扫描所有的目录
 * @param modName
 */
var run = function (modName) {
    moduleName = modName;
    _scanDir(_getPath('css'), ['css', 'less']);
    _scanDir(_getPath('js'), ['js']);
    _scanDir(_getPath('tpl'), ['html']);
};

var start = new Date();

// 读取参数，可能有单文件(夹)压缩的需求
var args = process.argv.splice(2);
if (args[0]) {
    run(args[0]);
    console.log('静态文件加戳处理完成！耗时' + (new Date() - start) + 'ms');
} else {
    // 必须指定需要压缩的js文件或文件夹
    console.log("必须指定需要处理的文件夹");
}