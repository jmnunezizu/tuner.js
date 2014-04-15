var debug = require('debug')('sips');
var exec = require('child_process').exec;

module.exports = sips;

function sips(artworkFile, targetArtwork, cb) {
    var cmd = 'sips --resampleWidth 500 "' + artworkFile + '" --out "' + targetArtwork + '"';
    debug('sips command %s', cmd);
    var proc = exec(cmd, function(err, stdout, stderr) {
        if (err) {
            cb(err);
        } else {
            cb(null);
        }
    });
}
