var clc = require('cli-color')

function message(colour, msg, args) {
    console.log.apply(this, [colour('==>  ') + msg, args || '']);
};

module.exports.info = function(msg, args) {
    message(clc.blue, msg, args);
};

module.exports.ok = function(msg, args) {
    message(clc.green, msg, args);
};

module.exports.warn = function(msg, args) {
    message(clc.yellow, msg, args);
};

module.exports.error = function(msg, args) {
    console.error(clc.red('==>  ') + msg, args);
};
