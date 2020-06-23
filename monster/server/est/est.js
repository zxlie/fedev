/**
 * EST模板引擎
 * @author xianliezhao
 */
var fs = require('fs');
var path = require('path');
var crypto = require('crypto');
var tplParser = require('./parser.js');
var _cache = {};
var tplCompiledMap = {};
var FILE_SUFFIX = '.est';

/**
 * EST Engine的全局配置
 * @type {{}}
 */
var EOptions = {
    // webRoot          模块的根目录
    // viewFolder       模板做做的目录名
    // compiledFolder   编译文件的目录
    // debug            是否监测模板内容的变化
    // compressTpl      是否压缩模板
};

/**
 * 设置模板引擎的一些编译参数
 * @param options
 */
var _initOptions = function (options) {
    EOptions.webRoot = options.webRoot;
    EOptions.viewFolder = options.viewFolder;
    EOptions.compiledFolder = options.compiledFolder || '';

    var absPath = path.resolve(EOptions.compiledFolder);
    if (!fs.existsSync(absPath)) {
        monster.base.mkDirP(absPath);
    }
    if (options.hasOwnProperty('debug')) {
        EOptions.debug = options.debug;
    }
    if (options.hasOwnProperty('compress')) {
        EOptions.compressTpl = options.compress;
    }
};

/**
 * Est模板解析引擎
 * @constructor
 */
var Est = function (options) {
    this.options = options;

    // 模板所在的根目录
    this.options.tplDir = EOptions.webRoot + this.options.moduleName + '/' + EOptions.viewFolder;
    // 模板的绝对路劲
    this.options.tplAbsPath = path.resolve(this.options.tplDir + options.tplName);
    // 模板编译后的文件的绝对路劲
    this.options.tplCompiledAbsPath = '';
    // 是否有解析错误
    this._hasParseError = false;
    // 最顶层的Est：被controller直接调用的那个，属于根模板的，而非child tpl
    this._rootEst = options.rootEst || this;
};

/**
 * 获取编译后的文件名
 * @returns {string}
 */
Est.prototype._getCompiledName = function (tplPath) {
    var prefix = EOptions.compiledFolder + (this.options.moduleName || '');
    if (!tplPath) {
        tplPath = this.options.tplAbsPath;
    }
    if (!this.options.tplCompiledAbsPath) {
        this.options.tplCompiledAbsPath = prefix + crypto.createHash('md5').update(tplPath).digest("hex") + FILE_SUFFIX;
    }
    return path.resolve(this.options.tplCompiledAbsPath);
};

/**
 * 获取某编译过的文件中的_getHtml方法
 * @returns fn
 * @private
 */
Est.prototype._getHtmlFn = function () {
    var file = this._getCompiledName();
    var _getHtml = require(file).html;
    if (typeof _getHtml !== 'function') {
        delete require.cache[require.resolve(file)];
        _getHtml = require(file).html;
    }
    return _getHtml(this._rootEst);
};

/**
 * 填充模板
 * @returns {boolean}
 */
Est.prototype._fillTplWithData = function () {
    var self = this;
    if (true === self.options.requireFn) {
        return self._getHtmlFn();
    }
    var html = false;
    _cache[self.options.tplAbsPath] = true;

    try {
        html = self._getHtmlFn()(self.options.pageData);

        if (this.options.end && !self._rootEst._hasParseError) {
            return self._rootEst.options.resolve(html);
        } else {
            return html;
        }
    } catch (err) {
        if (self._rootEst._hasParseError) {
            return;
        }
        // 标记当前模板编译错误
        self._rootEst._hasParseError = true;
        self._rootEst.options.reject({
            err: err,
            fileMap: tplCompiledMap
        });
    }
    return html;
};

/**
 * 模板编译
 */
Est.prototype._parseTpl = function () {
    var result = tplParser.parseTpl({
        tplDir: this.options.tplDir,
        tplname: this.options.tplAbsPath,
        tplPre: this.options.moduleName,
        compress: EOptions.compressTpl,
        rootEst: this._rootEst
    });
    var file = this._getCompiledName();
    fs.writeFileSync(file, result.data);

    // 开发模式下，需要监控文件的变化，以便于清理相关的缓存
    if (EOptions.debug) {
        var self = this;
        // 开发模式下，监控当前文件是否发生变化，如果发生变化，则清理require.cache
        result.dependency.length && result.dependency.forEach(function (item) {
            monster.base.watchFile(item, function (cur, prev) {
                delete require.cache[require.resolve(self._getCompiledName(item))];
            });
        });
    }

    return this._fillTplWithData();
};

/**
 * 向模板渲染数据
 * @returns {*}
 */
Est.prototype.renderFile = function () {
    var self = this;
    // 如果模板解析有错误，就退出得了
    if (self._rootEst._hasParseError) {
        return null;
    }

    var compiledFile = this._getCompiledName();
    var absPath = this.options.tplAbsPath;
    // 将tpl和编译后的文件路径缓存起来
    tplCompiledMap[path.resolve(compiledFile)] = absPath;

    // 在编译文件存在的情况下
    if (!EOptions.debug && fs.existsSync(compiledFile)) {
        // 编译文件已在缓存中，则直接渲染即可
        if (_cache[absPath]) {
            return self._fillTplWithData();
        }

        // 否则继续比较源文件和编译文件的最后修改时间，如果源文件的修改时间都还比便以文件老，也可以直接渲染
        var tplMtime = fs.statSync(absPath).mtime;
        var compileMtime = fs.statSync(compiledFile).mtime;
        if (tplMtime < compileMtime) {
            return self._fillTplWithData();
        }
    }

    // 其他所有情况，都重新编译文件，然后再渲染
    return this._parseTpl();
};


/**
 * 模板编译并渲染
 * @param options 配置参数
 * @config moduleName 当前模板所在模块名
 * @config tplName 模板名
 * @config pageData 页面渲染所需数据
 * @config requireFn 如果只是想获取到模板编译后的Function，则为true
 * @config rootEst 处于顶层的Est
 * @returns 模板渲染后的数据
 */
var render = function (options) {
    "use strict";

    if (!!options.rootEst) {
        // 编译子模板，直接返回编译后的内容
        return new Est({
            moduleName: options.moduleName,
            tplName: options.tplName,
            pageData: options.pageData,
            requireFn: !!options.requireFn,
            rootEst: options.rootEst
        }).renderFile();

    } else {
        // 编译根模板，返回一个promise对象
        return new Promise(function (resolve, reject) {
            return new Est({
                end: true,
                moduleName: options.moduleName,
                tplName: options.tplName,
                pageData: options.pageData,
                resolve: resolve,
                reject: reject,
                requireFn: !!options.requireFn
            }).renderFile();

        });
    }

};

exports.init = _initOptions;
exports.render = render;