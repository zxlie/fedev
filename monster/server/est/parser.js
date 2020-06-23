var fs = require('fs');
var path = require('path');
var extFnPath = __dirname + '/extFn.js';
var estPath = path.resolve(__dirname + '/est.js');

const DATA_NAME = '$_DATA';
const DELIMITER_LEFT = '<%';    // 左定界符
const DELIMITER_RIGHT = '%>';    // 右定界符
const REG_DATA = new RegExp('\\b' + DATA_NAME + '\.', 'g');

/**
 * HTML词法解析器
 * @author xianliezhao
 */
var Parser = function (opts) {
    this.options = {};
    this._fileContent = '';
    this._curAnalyContent = '';
    this._posCurrent = 0;
    this._posStart = 0;
    this._posEnd = 0;
    this._commentMark = 0;
    this._bufferLength = 0;
    this._dependency = [];
    this._init(opts);
};

/**
 * 初始化Parser
 * @param opts
 * @config tplname
 * @config tplPre
 * @config compress
 */
Parser.prototype._init = function (opts) {
    this.options = opts || {};
    this._rootEst = opts.rootEst;
    this._dependency.push(this.options.tplname);
    this._fileContent = fs.readFileSync(this.options.tplname);
    this._bufferLength = this._fileContent.length;

    this._output = "/*--" + this.options.tplname + "--*/ \n" +
        "exports.html = function($_ROOT) { \n" +
        "return function (" + DATA_NAME + ") { \n" +
        "var $_EST = require('" + estPath + "'); \n" +
        "var _extFn = require('" + extFnPath + "'); \n" +
        "function requireFn(tpl) { return $_EST.render({" +
        '"moduleName":"' + this.options.tplPre + '",' +
        '"tplName":tpl,' +
        '"requireFn":true,' +
        '"rootEst":$_ROOT' +
        "}); }  \n" +
        "var __htm ='';\n";
};

/**
 * 填充编译后的内容
 * @param str 当前解析到的内容
 * @param flag 是否直接拼接到output上去
 * @private
 */
Parser.prototype._fillOutput = function (str, flag) {
    if (this._commentMark > 0) return;
    if (flag) {
        this._output += str;
    } else {
        this._output += "__htm += '" + this._stripBlank(str) + "';\n";
    }
};

/**
 * 过滤空格
 * @param str 待处理的字符串
 * @returns {*}
 */
Parser.prototype._stripBlank = function (str) {
    if (this.options.compress) {
        str = str.replace(/\s+/mg, ' ');
    }
    return str;
};

/**
 * here doc
 * @param str
 * @returns {*}
 */
Parser.prototype._getHereDoc = function (str) {
    var herepos = str.indexOf('<<<');
    if (herepos < 0) {
        return str;
    }
    var hereTag = str.substring(herepos + 3, str.indexOf(':', herepos)) + ':';
    var tmpv = str.split(hereTag);
    tmpv[0] = tmpv[0].substr(0, herepos);
    tmpv[1] = tmpv[1].trim().replace(/"/g, '\\"')
        .replace(/[\r\n]+/g, '\\n')
        .replace(REG_DATA, 'this.');

    str = tmpv.join('');

    return this._getHereDoc(str);
};

/**
 * buffer到string的转换
 * @param start 开始位置
 * @param end 结束位置
 * @returns {string}
 */
Parser.prototype._buffer2String = function (start, end) {
    return this._fileContent.toString('utf8', start, end)
        .replace(/\<script\s+type=(['"])text\/javascript\1\s*>/gm,'<script>')
        .replace(/\\/gm, '\\\\').replace(/'/gm, "\\'")
        .replace(/[\n\r]+/gm, this.options.compress ? '' : '\\n');
};

/**
 * 从buffer中的指定位置开始寻找字符串
 * @param start 起始位置
 * @param target 从目标字符串中查找指定字符串
 * @returns {*}
 */
Parser.prototype._find = function (start, target) {
    var buffer = this._fileContent;
    var str = '', index = -1;
    for (var i = start, j = buffer.length; i < j; i++) {
        str += String.fromCharCode(buffer[i]);
        if (target.indexOf(str) == 0) {
            if (str.length == 1) {
                index = i;
            }
            if (str === target) {
                return index;
            }
        } else {
            str = '';
        }
    }
    return -1;
};

/**
 * 注释
 * @private
 */
Parser.prototype._analyticsComments = function () {
    switch (this._curAnalyContent[1]) {
        case '{':
            this._commentMark++;
            break;
        case '}':
            this._commentMark--;
            if (this._commentMark < 0) {
                this._commentMark = 0;
            }
            break;
    }
};

/**
 * 模板变量输出
 * @private
 */
Parser.prototype._analyticsOutputs = function () {
    // 转义方法
    var _fns = {
        '=': '_extFn.html_encode',  // 对变量做html转义后再输出
        ':': '_extFn.url_encode'    // 对变量做url转义后再输出
    };

    var _extFn = _fns[this._curAnalyContent[1]];
    if (_extFn) {
        var _content = this._curAnalyContent.substr(2);
        this._fillOutput('__htm += ' + _extFn + '(' + _content + ");\n", true);
    } else {
        this._fillOutput('__htm +=' + this._curAnalyContent.substr(1) + ";\n", true);
    }
};

/**
 * include新模板
 * @private
 */
Parser.prototype._analyticsInclude = function () {
    var arg = "{" +
        '"moduleName":"' + this.options.tplPre + '",' +
        '"tplName":"' + this._curAnalyContent.substr(1).trim() + '",' +
        '"pageData":' + DATA_NAME + ',' +
        '"rootEst":$_ROOT' +
        "}";
    this._fillOutput('__htm += $_EST.render(' + arg + ')||"";\n', true);
};

/**
 * HereDoc
 * @private
 */
Parser.prototype._analyticsHereDoc = function () {
    var code = this._getHereDoc(this._curAnalyContent.substr(1)).trim();
    if (code.substr(-1) == ';') code = code.substr(0, code.length - 1);
    this._curAnalyContent = '__htm += ' + this._stripBlank(code) + " || '';\n ";
    this._fillOutput(this._curAnalyContent + ';', true);
};

/**
 * 分析模板标签，比如：extends、block
 * @private
 */
Parser.prototype._analyticsTplTags = function () {
    this._posEnd = this._find(this._posCurrent + 3, DELIMITER_RIGHT);
    var wholeTag = this._fileContent.toString('utf8', this._posCurrent, this._posEnd + 2);
    var content = wholeTag.substring(3, this._posEnd)
        .replace(new RegExp(DELIMITER_RIGHT + '$'), '')
        .replace(/\bthis\./g, DATA_NAME + '.').trim();
    var arr = content.split(/\s+/);

    if (arr.length) {
        arr = arr[0].split('=');
        arr[1] = arr[1].replace(/\'|\"/g, '');
        switch (arr[0]) {
            case 'extends':
                // 模板继承
                var absPath = path.resolve(this.options.tplDir + arr[1]);
                this._dependency.push(absPath);
                var parentTpl = fs.readFileSync(absPath).toString('utf8');
                // 加一个结束标志，控制：只有父模板中定义的block才会生效，子模板中的一切都不会被编译到模板中
                parentTpl += DELIMITER_LEFT + 'return __htm;' + DELIMITER_RIGHT;
                var cnt = this._fileContent.toString('utf8').replace(wholeTag, parentTpl);
                this._fileContent = new Buffer(cnt);
                this._bufferLength = this._fileContent.length;
                this._posEnd = -2;
                break;

            case 'block':
                // block声明
                var blockName = arr[1].trim();
                var blockParentName = blockName + '__parent_';
                var reg = new RegExp('function\\s+' + blockName + '\\s*\\(([\\w\\,]*)\\s*\\)\\s*\\{');
                var rst = reg.exec(this._fileContent.toString('utf8'));
                var html = '';
                if (rst) {
                    // 子模板从父模板前插入
                    if (/\bprepend\b/i.test(rst[1])) {
                        html = blockName + '();' + blockParentName + '();';
                    }
                    // 从后插入
                    else if (/\bappend\b/i.test(rst[1])) {
                        html = blockParentName + '();' + blockName + '();';
                    }
                    // 覆盖父模板
                    else {
                        html = blockName + '();';
                    }
                }
                // 如果整个block标签是有默认内容的，则将其编译成一个function
                if ((new RegExp('\\{\\s*' + DELIMITER_RIGHT + '$')).test(wholeTag)) {
                    if (!rst) {
                        html = blockParentName + '();';
                    }
                    html += 'function ' + blockParentName + '() {\n';
                }
                this._fillOutput(html + '\n', true);
                break;
        }
    }
};

/**
 * 其他内容
 * @private
 */
Parser.prototype._analyticsOther = function () {
    this._fillOutput(this._curAnalyContent + ';', true);
};

/**
 * 词法分析
 * @private
 */
Parser.prototype._analytics = function () {

    if (this._posCurrent > -1 && this._posEnd > -1) {
        this._fillOutput(this._buffer2String(this._posStart, this._posCurrent));
        this._curAnalyContent = this._fileContent.toString('utf8', this._posCurrent + 2, this._posEnd)
            .replace(/\bthis\./g, DATA_NAME + '.')
            .replace(/\$_ENGINE_SELF\./g, '$_EST.');
        switch (this._curAnalyContent[0]) {
            case '*':
                this._analyticsComments();
                break;
            case '=':
                this._analyticsOutputs();
                break;
            case '#':
                this._analyticsInclude();
                break;
            case '!':
                this._analyticsHereDoc();
                break;
            case '@':
                this._analyticsTplTags();
                break;
            default:
                this._analyticsOther();
        }
    }
    this._posCurrent = this._posStart = this._posEnd + 2;
    this._posEnd = 0;
};


/**
 * 在模板中use js module
 * @param jsContent      fml.use模块
 */
Parser.prototype._userModule = function (jsContent) {
    // 变量初始化
    this._rootEst.__jsDepCache = this._rootEst.__jsDepCache || {};
    this._rootEst._JSmods = this._rootEst._JSmods || [];
    var self = this;

    var jss = [];
    var blockKey = monster.base.md5(jsContent);
    if (this._rootEst.__jsDepCache.hasOwnProperty(blockKey)) {
        jss = this._rootEst.__jsDepCache[blockKey];
        if (false !== jss) jss.map(getAlljss);
        return;
    }
    var d_reg = /\'/g;
    var jsl_reg = /(?:\.use *?\()([^\(\)]+)/g,
        jsl_regs = /(?:\.use *?\()([^\(\)]+)(?:, *function)/;
    var jsl = jsContent.match(jsl_reg);
    jsl && jsl.map(function (l) {
        if (l.indexOf('function') > 0) {
            l = (l.match(jsl_regs))[1];
        } else {
            l = l.substr(5);
        }
        if (l) {
            l = JSON.parse(l.replace(d_reg, '"'));
        }
        if ('string' == typeof l) {
            push(jss, l);
        } else {
            l.map(function (i) {
                push(jss, i);
            })
        }
    });

    if (jss.length) jss.map(getAlljss);
    this._rootEst.__jsDepCache[blockKey] = jss.length ? jss : false;

    function push(arr, newItem) {
        if (arr && arr.indexOf(newItem) == -1) arr.push(newItem);
    }

    function getAlljss(jsmod) {
        push(self._rootEst._JSmods, jsmod);
    }
};

/**
 * 在整个模板解析完成后，再次从整个模板内容中寻找js module的引用，并放到 $_ROOT._JSmods数组中
 * @private
 */
Parser.prototype._jsModule = function () {
    this._posCurrent = 0;
    while (true) {
        this._posCurrent = this._find(this._posCurrent, '<script>');
        if (this._posCurrent > -1) {
            this._posEnd = this._find(this._posCurrent + 7, '</script>');
            if (this._posEnd > -1) {
                var jsContent = this._fileContent.toString('utf8', this._posCurrent + 7, this._posEnd);
                this._userModule(jsContent);
                this._posCurrent = this._posEnd + 8;
            } else {
                break;
            }
        } else {
            break;
        }
    }
};

/**
 * 模板编译
 */
Parser.prototype.compile = function () {

    if (!this._fileContent) return;

    while (true) {
        this._posCurrent = this._find(this._posCurrent, DELIMITER_LEFT);
        if (this._posCurrent > -1) {
            this._posEnd = this._find(this._posCurrent + 2, DELIMITER_RIGHT);
            this._analytics();
        } else {
            this._fillOutput(this._buffer2String(this._posStart, this._bufferLength));
            break;
        }
    }

    this._output += "return __htm;\n}}";
    this._jsModule();
    // 如果有内容，直接将其编译到模板中
    if(this._rootEst._JSmods && this._rootEst._JSmods.length) {
        this._output = this._output.replace(/\$_ROOT._JSmods/gm,
            JSON.stringify(this._rootEst._JSmods));
    }
    return {
        data: this._output,
        dependency : this._dependency
    };
};

/**
 * 解析模板
 * @param options
 * @returns {*}
 */
exports.parseTpl = function (options) {
    var parser = new Parser(options);
    return parser.compile()
};