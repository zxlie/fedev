/**
 * 完成less文件到css文件的编译
 * @author xianliezhao
 */

var fs = require('fs'),
    path = require('path'),
    child = require('child_process');

var less = require('../node_modules/less');

/**
 * 记录日志
 * @param logTxt
 * @param code
 */
function printLog(logTxt, code) {
    if (logTxt) console.log(logTxt);
    if (code >= 0) process.exit(code);
}

/**
 * 生成css文件：less to css file!
 * @param filepath
 */
function genCss(filepath) {
    // 如果文件命名是*.less，则新生成一个*.css
    var cssFile = path.resolve(filepath.replace(/\.less$/, '.css'));

    /**
     * 错误处理
     * @param err
     */
    function errTxt(err) {
        if (!err.filename || err.filename == 'input') {
            var friendlyPath = filepath;
            var index = friendlyPath.indexOf("/output/");
            if (index >= 0) {
                friendlyPath = friendlyPath.substring(index + 7);
            }
            err.filename = friendlyPath;
        }
        var logTxt = '\nLess parse error : \n' + JSON.stringify(err, null, 4);

        fs.writeFile(cssFile, logTxt, function (err) {
            printLog(logTxt, 2);
        });
    }

    fs.readFile(filepath, 'utf8', function (err, content) {
        var parser = new (less.Parser)({
            paths: [filepath.substr(0, filepath.lastIndexOf('/'))]
        });
        parser.parse(content, function (err, lessTree) {
            if (err) {
                return errTxt(err);
            }
            try {
                content = lessTree.toCSS({compress: true, yuicompress: true});
            } catch (err) {
                return errTxt(err);
            }
            fs.writeFile(cssFile, content, function (err) {
                if (err) {
                    console.log(err);
                    return printLog('Write error :' + cssFile, 3);
                }
            });
        });
    });
}


/**
 * 对某个less目录下的文件进行css转换
 * @param folder
 */
function parseLessFolder(folder) {
    var files = fs.readdirSync(folder);
    files.map(function (file) {
        if ('.' == file[0]) {
            return;
        }
        var filepath = folder + '/' + file;
        var stat = fs.statSync(filepath);

        // 对*.less和*.css文件进行转换，含YUI压缩
        if (stat.isFile() && /.*\.(less|css)$/.test(file)) {
            // 转换
            genCss(filepath);
        } else if (stat.isDirectory()) {
            parseLessFolder(filepath);
        }
    });
}

var start = new Date();

// 读取参数，可能有单文件(夹)压缩的需求
var args = process.argv.splice(2);
if (args[0] && fs.existsSync(args[0])) {
    // 指定转换某less文件，如： node mkCss.js less/hello.less
    if (fs.statSync(args[0]).isFile()) {
        genCss(path.resolve(args[0]));
    }
    // 指定转换某文件夹，如：node mkCss.js pro/static/less
    else {
        parseLessFolder(path.resolve(args[0]));
        console.log("css文件编译完成！耗时" + (new Date() - start) + 'ms');
    }
} else {
    // 必须指定需要转换的less文件或文件夹
    console.log("必须指定需要转换的less文件或文件夹");
}