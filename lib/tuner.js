var EventEmitter = require('events').EventEmitter;
var exec = require('child_process').exec;
var fs = require('fs');
var path = require('path');
var flower = require('./flower');
var Xld = require('./xld');

/**
 * Expose the 'Tuner' API.
 */
exports = module.exports = Tuner;

exports.version = '0.0.1';

function Tuner(options) {
    var options = options || {};
    this.verbose = options.verbose || false;
    this.dryRun = options.dryRun || false;
};

/**
 * Inherit from 'EventEmitter.prototype'.
 */
Tuner.prototype.__proto__ = EventEmitter.prototype;

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
        if (err) { handleDirectoryError(err, dir); }
        
        files
            .filter(function(f) { return /\.flac$/.test(f); })
            .forEach(function(f) {
                var filename = path.resolve(dir, path.separator, f);
                var convertFile = function(done) {
                    var xld = new Xld();
                    xld.on('trackConverted', done);
                    xld.convert(filename, {format: Xld.formats.alac, output: dir, verbose: self.verbose});
                };

                var embedArtworkToFile = function(done) {
                    console.log(' > Embedding artwork');
                    var artwork = path.resolve(dir, path.separator, 'cover500.jpg');
                    self.embedArtwork(artwork, filename.replace('.flac', '.m4a'), done);
                };

                var series = function(done) {
                    flower.series([convertFile, embedArtworkToFile], function(err, result) {
                        self.emit('trackProcessed', f);
                        done();
                    });
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
            self.emit('processingComplete');
        });
    });
};

Tuner.prototype.createArtworkThumbnail = function(dir, cb) {
    console.log('Creating the 500x500 thumbnail');
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
    // TODO: if the file does not exist, the chain ends because the cb is never called.
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
    var self = this;
    fs.readdir(dir, 
        function(err, files) {
            if (err) { handleDirectoryError(err, dir); }
            files
                .filter(function(f) { return path.extname(f) === '.flac'; })
                .forEach(
                    function(f) {
                        if (self.dryRun) {
                            console.log('Skipping file deletion');
                        } else {
                            fs.unlinkSync(path.resolve(dir, path.separator, f));
                        }
                        self.emit('fileRemoved', f);
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
