var EventEmitter = require('events').EventEmitter;
var exec = require('child_process').exec;
var fs = require('fs');
var path = require('path');
var flower = require('./flower');
var Xld = require('./xld');
var logger = require('./logger');
var ITunes = require('itunes');

/**
 * Expose the 'Tuner' API.
 */
exports = module.exports = Tuner;

exports.version = '0.0.1';

function Tuner(options) {
    var options = options || {};
    this.verbose = options.verbose || false;
    this.debug = options.debug || false;
    this.dryRun = options.dryRun || false;
    this.itunes = new ITunes({debug: options.debug});
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

    files = getFilesToBeProcessed(dir);
    if (this.debug) {
        logger.debug('About to process the files: \n[\n\t%s\n]', files.join('\n\t'));
    }
    files.forEach(
        function(f) {
            var convertFile = function(done) {
                var xld = new Xld();
                xld.on('trackConverted', done);
                xld.convert(f, {format: Xld.formats.alac, output: path.dirname(f), verbose: self.verbose});
            };

            var embedArtworkToFile = function(done) {
                console.log(' > Embedding artwork');
                var artwork = path.resolve(dir, path.separator, 'cover500.jpg');
                self.embedArtwork(artwork, f.replace('.flac', '.m4a'), done);
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
            fs.writeFileSync('.processed', '', 'utf-8');
            self.cleanUp(dir, done);
        }
    );
    
    // add the done callback
    flower.series(functions, function(results) {
        self.emit('processingComplete');
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

/**
 * It removes the following files types from the specified directory:
 * <ul>
 * <li> .flac
 * <li> .m3u
 * <li> .processed
 *
 * In order to be able to execute this command, a file named ".processed"
 * must exist. The aforementioned file is created after the process command
 * has been executed. If the file does not exist, the event 
 * 'cleanDirectoryError' is fired and the execution terminatted.
 *
 * @param {String} dir The directory that must be cleaned.
 * @param {Function} done The callback.
 */
Tuner.prototype.cleanDirectory = function(dir, done) {
    if (this.debug) {
        logger.debug("Processing the directory '%s'", dir);
    }

    if (!fs.existsSync('.processed')) {
        this.emit('cleanDirectoryError', {code: 1});
        return;
    }

    var self = this;
    fs.readdir(dir, 
        function(err, files) {
            if (err) { handleDirectoryError(err, dir); }
            files
                .filter(function(f) { return /\.(flac|processed|m3u)$/.test(f); })
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

Tuner.prototype.addToItunes = function(dir, done) {
    if (this.debug) {
        logger.debug("Adding to iTunes the directory '%s'", dir);
    }

    var self = this;

    fs.readdir(dir,
        function(err, files) {
            if (err) { handleDirectoryError(err, dir); }
            files
                .filter(function(f) { return /\.m4a$/.test(f); })
                .forEach(
                    function(f) {
                        if (self.dryRun) {
                            console.log("Skipping the file '%s'", f);
                        } else {
                            self.itunes.once('added', function(result) {
                                self.emit('fileAdded', f);
                            });
                            self.itunes.add(path.resolve(dir, path.separator, f));
                        }
                    })
        })
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

// Private API

/**
 * Traverses the directory {@code dir} in search for files of type "flac".
 *
 * @param {String} dir The directory that must be traversed.
 * @return {Array} An array containing all the files found in the directory.
 */
function getFilesToBeProcessed(dir) {
    var result = [];
    var files = fs.readdirSync(dir);

    files.forEach(function(f) {
        if (/\.flac$/.test(f)) {
            result.push(path.resolve(dir, path.separator, f));
        } else {
            var stats = fs.statSync(path.resolve(dir, path.separator, f));
            if (stats.isDirectory()) {
                result = result.concat(getFilesToBeProcessed(f));
            }
        }
    })

    return result;
};
