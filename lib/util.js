var util = module.exports = exports;

util.lpad = function (str, padString, length) {
  while (str.length < length) {
    str = padString + str;
  }
  return str;
};
 
util.rpad = function (str, padString, length) {
  while (str.length < length) {
    str = str + padString;
  }
  return str;
};
