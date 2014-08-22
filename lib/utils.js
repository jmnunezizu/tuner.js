var utils = module.exports = exports;

utils.lpad = function (str, padString, length) {
  while (str.length < length) {
    str = padString + str;
  }
  return str;
};
 
utils.rpad = function (str, padString, length) {
  while (str.length < length) {
    str = str + padString;
  }
  return str;
};

utils.escapeshell = function (cmd) {
  return cmd.replace(/([()"\s&'$`\\])/g, '\\$1');
};
