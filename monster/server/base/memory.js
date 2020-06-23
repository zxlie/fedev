this.data = {};
exports.get = function (key, callBack) {
    callBack && callBack(null, this.data[key] || {});
};

exports.set = function (key, value, callBack) {
    if (value) {
        this.data[key] = value;
    }
    callBack && callBack(null);
};

exports.remove = function (key, callBack) {
    if (this.data[key]) {
        delete this.data[key];
    }
    callBack && callBack(null)
};

exports.reset = function (key, callBack) {
    callBack && callBack(null);
};
