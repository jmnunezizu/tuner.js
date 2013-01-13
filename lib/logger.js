var clc = require('cli-color')

module.exports = new Logger();

function Logger() {
};

Logger.prototype.message = function(colour, msg, args) {
    console.log.apply(this, [colour('==>  ') + msg, args || '']);
};

Logger.prototype.info = function(msg, args) {
    this.message(clc.blue, msg, args);
};

Logger.prototype.ok = function(msg, args) {
    this.message(clc.green, msg, args);
};

Logger.prototype.warn = function(msg, args) {
    this.message(clc.yellow, msg, args);
};

Logger.prototype.error = function(msg, args) {
    console.error('error: ' + msg, args || '');
};

Logger.prototype.debug = function(msg, args) {
    console.log('[debug] ' + msg, args || '');
}
