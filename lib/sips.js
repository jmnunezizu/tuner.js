var debug = require('debug')('sips');
var exec = require('child_process').exec;
var utils = require('./utils');

module.exports = sips;

function sips(artworkFile, targetArtwork, cb) {
  var cmd = 'sips --resampleWidth 500 ' + utils.escapeshell(artworkFile) + ' --out ' + utils.escapeshell(targetArtwork);
  debug('sips command %s', cmd);
  var proc = exec(cmd, function(err, stdout, stderr) {
    if (err) {
      cb(err);
    } else {
      cb(null);
    }
  });
}
