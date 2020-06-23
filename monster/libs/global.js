/**
 * 全局注入
 * @author xianliezhao
 */

if(!global.monster) {
    global.monster = {
        config: require('../config/config.json'),
        base: require('./base.js'),
        logger: require('./logger.js')
    };
}
