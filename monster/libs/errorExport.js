/**
 * 用于error info 输出到页面
 *
 * @author xianleizhao
 */
var fs = require('fs');

/**
 * 获取详细的错误信息
 * @param err 错误详细信息
 * @param type 解析类型，tpl标志解析模板
 * @param fileMap 文件映射关系
 */
exports.compile = function (err, type, fileMap) {
    "use strict";

    var detail = {};
    var stack = [];

    /**
     * 输出并处理错误
     * @param errorSeg
     * @param resolve
     */
    function deal(errorSeg, resolve) {
        var msg = errorSeg.slice(0, detail.column - 1) + '--->>>'
            + errorSeg.slice(detail.column - 1) + '\n';
        msg += stack[1] + '\n';
        msg += stack[0];
        detail.msg = msg;

        // 错误的具体位置，在源文件中精准定位
        if (type == 'tpl' && fileMap && fileMap[detail.file] && fs.existsSync(fileMap[detail.file])) {
            var newMsg = msg.replace(/_data\./g, 'this.').replace(/__htm\s\+\=/g, '');
            var arr = /(.*)--->>>([\w\.]+)/.exec(newMsg);
            var errMsgKey = arr ? arr[1].replace(/_data\./g, 'this.') + arr[2] : '';
            var content = fs.readFileSync(fileMap[detail.file], 'utf-8');
            var charIndex = -1;
            content.replace(errMsgKey, function () {
                charIndex = arguments[arguments.length - 2];
            });
            var orLine = content.substr(0, charIndex).split(/\n/).length;
            if (orLine > 0) {
                // 错误信息在源文件中的行号
                detail.line = orLine;
                // 错误源代码
                detail.originalCode = content.split(/\n/)[orLine - 1];
            }
            resolve(detail);
        } else {
            resolve(detail);
        }
    }


    /**
     * 分析错误
     */
    return new Promise(function (resolve, reject) {

        if (!err) return reject(null);

        stack = err.stack.split('\n');

        var errDetail = null;
        if (type == 'tpl') {
            errDetail = stack[1].match(/exports\.html \(([^\:]+)\:(\d+)\:(\d+)\)/)
            || stack[1].match(/exports\.html \[as html\] \(([^\:]+)\:(\d+)\:(\d+)\)/)
            || stack[1].match(/at [^\(]*\((.*\.est):(\d+):(\d+)/)
            || stack[1].match(/at (.*\.est):(\d+):(\d+)/)
            || err.stack.match(/at [^\(]*\((.*\.est):(\d+):(\d+)/);
        } else {
            errDetail = stack[1].match(/at [^\(]*\((.*\.js):(\d+):(\d+)/);
            // 可能是文件不存在的错误
            if (err.stack.indexOf('no such file or directory') > 0) {
                errDetail = err.stack.match(/at [^\(]*\((.*\/controller\/.*\.js):(\d+):(\d+)/);
            }
        }

        // 如果文件存在，则正常解析
        if (errDetail && fs.existsSync(errDetail[1])) {
            detail = {
                file: errDetail[1],
                line: errDetail[2],
                column: errDetail[3]
            };
            var remaining = '', lineNo = 0, geted = false;

            var rs = fs.createReadStream(detail.file);
            rs.on('data', function (data) {
                remaining += data;
                var index = remaining.indexOf('\n');
                var last = 0;
                while (index > -1) {
                    var line = remaining.substring(last, index);
                    last = index + 1;
                    lineNo++;
                    index = remaining.indexOf('\n', last);

                    if (lineNo == detail.line) {
                        geted = true;
                        deal(line, resolve);
                        break
                    }
                }
                remaining = remaining.substring(last);
            });
            rs.on('end', function () {
                if (!geted)  deal(remaining, resolve);
            });
        } else {
            console.log(stack);
            resolve({
                msg: stack[0]
            });
        }
    });
};

/**
 * 格式化错误信息，并输出
 * @param errorInfo
 */
exports.format = function (errorInfo, mode) {
    var msg = [];
    if (mode == 'log') {
        var splitLn = "\n------\n";
        msg.push("\n------------------------------------------------------------------------\n"
        + errorInfo.date + ' | ' + errorInfo.status + ' | ' + errorInfo.url + ' | ' + errorInfo.file + ' | \n\n'
        + errorInfo.msg);
        msg.push("\n------------------------------------------------------------------------\n");
    } else {
        var nl2br = function (str) {
            return (str || '').replace(/\n/, '<br>') || '无';
        };
        msg.push('<div style="width:80%;margin:20px auto;line-height:40px;">');
        msg.push('<div>页面出错啦：</div>');
        msg.push('<table border="1" style="border-collapse: collapse;border: 1px solid #aaa;' +
        'line-height:30px;font-size:14px;">');
        msg.push('<tr><td style="width:80px">时间</td><td>' + errorInfo.date + '</td></tr>');
        msg.push('<tr><td>URL</td><td>' + errorInfo.url + '</td></tr>');
        if (errorInfo.origin && errorInfo.origin != errorInfo.file) {
            msg.push('<tr><td>源文件</td><td>' + errorInfo.origin + '</td></tr>');
        }
        msg.push('<tr><td>出错文件</td><td>' + errorInfo.file + '</td></tr>');
        msg.push('<tr><td>出错位置</td><td>line: ' + errorInfo.line + '&nbsp;,&nbsp;column:'
        + errorInfo.column + '</td></tr>');
        msg.push('<tr><td>错误信息</td><td>' + (function (msg) {
            return msg.replace(/--->>>/,
                '<span style="color:red;font-family: cursive;">&nbsp;--->>>&nbsp;</span>');
        })(nl2br(errorInfo.msg)) + '</td></tr>');
        msg.push('</table></div>');
    }

    return msg.join('');
};
