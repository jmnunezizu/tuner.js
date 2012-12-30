var util = require('util');
var exec = require('child_process').exec;
var spawn = require('child_process').spawn;
var fs = require('fs');
var path = require('path');
var flower = require('./flower');
var xld = require('./xld');

/**
 * Expose the 'Tuner' API.
 */
exports = module.exports = Tuner;

exports.version = '0.0.1';

function Tuner(options) {
    console.log(options);
    var options = options || {};
    this.verbose = options.verbose || false;
};

Tuner.prototype.processDirectory = function(dir) {
    var self = this;
    var functions = [];
    
    // create the 500x500 artwork
    functions.push(
        function(done) {
            self.createArtworkThumbnail(dir, done);
        }
    );

    // process all files
    fs.readdir(dir, function(err, files) {
        if (err) {
            handleDirectoryError(err, dir);
        }
        files
            .filter(function(f) { return /\.flac$/.test(f); })
            .forEach(function(f) {
                var filename = path.resolve(dir, path.separator, f);
                var convertFile = function(done) {
                    xld.convert(filename, {format: xld.formats.alac, output: dir, verbose: self.verbose}, done);
                };

                var embedArtworkToFile = function(done) {
                    var artwork = path.resolve(dir, path.separator, 'cover500.jpg');
                    embedArtwork(artwork, filename.replace('.flac', '.m4a'), done);
                };

                var series = function(done) {
                    flower.series([convertFile, embedArtworkToFile], done);
                };

                functions.push(series);
            }
        );
        
        // add the done callback
        flower.series(functions, function(results) {
            console.log('I am done');
        });
    });
};

Tuner.prototype.createArtworkThumbnail = function(dir, cb) {
    console.log('Creating the 500x500 thumbnail');
    var artworkFile = path.resolve(dir, path.separator, 'cover.jpg');
    var targetArtwork = path.resolve(dir, path.separator, 'cover500.jpg');
    console.log(artworkFile);
    console.log(targetArtwork);
    if (fs.existsSync(artworkFile)) {
        var sips = exec('sips --resampleWidth 500 "' + artworkFile + '" --out "' + targetArtwork + '"', function(err, stdout, stderr) {
            if (err) {
                cb(err);
            } else {
                cb(null, dir);
            }
        });
    }
};

Tuner.prototype.handleDirectoryError = function(err, dir) {
    console.error();
    switch (err.code) {
        case 'ENOENT':
            console.error("  error: the directory '%s' does not exist", dir);
            break;
    }
    console.error();
    process.exit(1);
};

function embedArtwork(artwork, track, cb) {
    console.log('Adding the artwork %s to the track %s', artwork, track);
    var cmd = 'mp4art --add "' + artwork + '" "' + track + '"';
    console.log(cmd)
    var mp4art = exec(cmd, function(err, stdout, stderr) {
        cb(null, 'artwork embeded');
    });
};
