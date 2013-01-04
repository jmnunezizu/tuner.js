var util = require('util');
var exec = require('child_process').exec;
var spawn = require('child_process').spawn;
var fs = require('fs');
var path = require('path');
var clc = require('cli-color')
var flower = require('./flower');
var xld = require('./xld');

var info = function(msg, args) { console.log(clc.green('==>  ') + msg, args); };
var ok = function(msg, args) { console.log(clc.blue('==>  ') + msg, args); };

/**
 * Expose the 'Tuner' API.
 */
exports = module.exports = Tuner;

exports.version = '0.0.1';

function Tuner(options) {
    var options = options || {};
    this.verbose = options.verbose || false;
};

Tuner.prototype.processDirectory = function(dir) {
    var self = this;
    var functions = [];

    console.log(clc.green('==> ') + "Processing the directory: %s", dir);
    
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
                console.log('Processing the file %s', f);
                var filename = path.resolve(dir, path.separator, f);
                var convertFile = function(done) {
                    console.log(clc.blue('==> ') + 'Converting to m4a');
                    xld.convert(filename, {format: xld.formats.alac, output: dir, verbose: self.verbose}, done);
                };

                var embedArtworkToFile = function(done) {
                    console.log(' > Embedding artwork');
                    var artwork = path.resolve(dir, path.separator, 'cover500.jpg');
                    self.embedArtwork(artwork, filename.replace('.flac', '.m4a'), done);
                };

                var series = function(done) {
                    flower.series([convertFile, embedArtworkToFile], done);
                };

                functions.push(series);
            }
        );

        functions.push(
            function(done) {
                console.log('Cleaning up...');
                self.cleanUp(dir, done);
            }
        );
        
        // add the done callback
        flower.series(functions, function(results) {
            console.log(clc.green('==> ') + 'Finished');
        });
    });
};

Tuner.prototype.createArtworkThumbnail = function(dir, cb) {
    console.log(clc.blue('==> ') + 'Creating the 500x500 thumbnail');
    var artworkFile = path.resolve(dir, path.separator, 'cover.jpg');
    var targetArtwork = path.resolve(dir, path.separator, 'cover500.jpg');
    if (this.verbose) {
        console.log(artworkFile);
        console.log(targetArtwork);
    }
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

Tuner.prototype.embedArtwork = function(artwork, track, cb) {
    var cmd = 'mp4art --add "' + artwork + '" "' + track + '"';
    if (this.verbose) {
        console.log(cmd);
    }
    var mp4art = exec(cmd, function(err, stdout, stderr) {
        cb(null, 'artwork embeded');
    });
};

Tuner.prototype.cleanUp = function(dir, done) {
    var file = path.resolve(dir, path.separator, 'cover500.jpg');
    fs.unlink(file, done);
};

Tuner.prototype.cleanDirectory = function(dir, done) {
    fs.readdir(dir, 
        function(err, files) {
            if (err) { handleDirectoryError(err, dir); }
            files
                .filter(function(f) { return path.extname(f) === '.flac'; })
                .forEach(
                    function(f) {
                        info("Removing the file '%s'", f);
                        fs.unlinkSync(path.resolve(dir, path.separator, f));
                        ok('Successfully removed the file');
                    }
            );
        }
    );
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
