var EventEmitter = require('events').EventEmitter;
var exec = require('child_process').exec;
var sys = require('sys');
var fs = require('fs');
var path = require('path');
var flower = require('./flower');
var Xld = require('./xld');
var logger = require('./logger');
var ITunes = require('itunes');
var async = require('async');

/**
 * Expose the 'Tuner' API.
 */
exports = module.exports = Tuner;

exports.version = '0.0.1';

var EMBEDDED_ART_FILENAME = '500.art';

function Tuner(options) {
    EventEmitter.call(this);

    options = options || {};
    this.debug = options.debug || false;
    this.dryRun = options.dryRun || false;
    this.itunes = new ITunes({debug: options.debug});
}

/**
 * Inherit from EventEmitter.
 */
sys.inherits(Tuner, EventEmitter);

/**
 * Public API.
 */

Tuner.prototype.processDirectory = function(dir) {
    var self = this;
    var start = new Date();

    var artwork = path.resolve(dir, path.separator, EMBEDDED_ART_FILENAME);
    var files = getFilesToBeProcessed(dir, '\\.flac$');
    if (self.debug) {
        logger.debug('About to process the files: \n[\n');
        files.forEach(function(f) {
            console.log('\t%j\n', f);
        });
        console.log(']');
    }

    async.waterfall([
        function prepareDirectory(done) {
            self.emit('preparingDirectory', dir);
            self.createArtworkThumbnail(dir, done);
        },
        function processFiles(done) {
            async.each(files,
                function(f, fileDone) {
                    async.waterfall([
                        self.prepareTrack(f),
                        self.convertFile(f),
                        self.embedArtworkToFile(artwork, f)
                    ], function(err, result) {
                        if (err) return fileDone(err);
                        
                        self.emit('trackProcessed', f);
                        fileDone(null);
                    });
                }, function(err) {
                    if (err) return done(err);
                    done(null);
                }
            );
        },
        function cleanUp(done) {
            if (self.debug) {
                logger.debug('Cleaning up...');
            }
            fs.writeFileSync('.processed', '', 'utf-8');
            self.cleanUp(dir, done);
        }
    ], function(err, result) {
        var finish = new Date();
        self.emit('processingComplete', 
            {
                startDate: start,
                endDate: finish,
                totalTime: finish.getTime() - start.getTime(),
                totalFiles: files.length
            }
        );
    });
};

/**
 *
 */
Tuner.prototype.createArtworkThumbnail = function(dir, cb) {
    var coverName = 'cover'
    var supportedExtensions = ['jpg', 'jpeg', 'png'];
    
    var artworkFile = null;
    supportedExtensions.forEach(function(extension) {
        var coverFile = path.resolve(dir, path.separator, coverName + '.' + extension);
        if (fs.existsSync(coverFile)) {
            artworkFile = coverFile;
            targetArtwork = path.resolve(dir, path.separator, EMBEDDED_ART_FILENAME);
        }
    });

    if (artworkFile === null) {
        cb(new Error('No cover file present'));
    } else {
        var sips = exec('sips --resampleWidth 500 "' + artworkFile + '" --out "' + targetArtwork + '"', function(err, stdout, stderr) {
            if (err) {
                cb(err);
            } else {
                cb(null);
            }
        });
    }

    // TODO: if the file does not exist, the chain ends because the cb is never called.
};

Tuner.prototype.embedArtwork = function(artwork, track, cb) {
    var cmd = 'mp4art --add "' + artwork + '" "' + track + '"';
    if (this.debug) {
        console.log(cmd);
    }
    var mp4art = exec(cmd, function(err, stdout, stderr) {
        if (err) {
            cb(err);
        } else {
            cb(null, {
                artwork: artwork,
                filename: track
            });
        }
    });
};

Tuner.prototype.cleanUp = function(dir, done) {
    var file = path.resolve(dir, path.separator, EMBEDDED_ART_FILENAME);
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
    var files = getFilesToBeProcessed(dir, '\\.(flac|processed|m3u|m3u8)$');
    files.forEach(
        function(f) {
            if (self.dryRun) {
                console.log('Skipping file deletion');
            } else {
                fs.unlinkSync(f.absolute);
            }
            self.emit('fileRemoved', f);
        }
    );
};

Tuner.prototype.addToItunes = function(dir, done) {
    if (this.debug) {
        logger.debug("Adding to iTunes the directory '%s'", dir);
    }

    var self = this;
    var files = getFilesToBeProcessed(dir, '\\.m4a$');
    files.forEach(
        function(f) {
            if (self.dryRun) {
                console.log("Skipping the file '%s'", f);
            } else {
                self.itunes.once('added', function(result) {
                    self.emit('fileAdded', f);
                });
                self.itunes.add(path.resolve(dir, path.separator, f));
            }
        }
    );
};

Tuner.prototype.handleDirectoryError = function(err, dir) {
    console.error();
    if (err.code === 'ENOENT') {
        console.error("  error: the directory '%s' does not exist", dir);
    } else {
        console.error('  error: %s', err.message);
    }
    console.error();
    process.exit(1);
};

Tuner.prototype.prepareTrack = function(file) {
    var self = this;
    return function(done) {
        self.emit('preparingTrack', file);
        done(null);
    };
};

Tuner.prototype.convertFile = function(file) {
    var self = this;
    return function(done) {
        var xld = new Xld({debug: self.debug});
        xld.on('trackConverted', function(result) {
            self.emit('trackConverted', file);
            done(null, result);
        });
        xld.on('error', done);
        xld.convert(file.absolute, {format: Xld.formats.alac, output: file.directory});
    }
};

Tuner.prototype.embedArtworkToFile = function(artwork, file) {
    var self = this;
    return function(file, done) {
        var filename = path.resolve(file.directory, path.separator, file.filename.replace('.flac', '.m4a'));
        self.emit('beforeEmbeddingArtwork', {filename: filename, artwork: artwork});
        self.embedArtwork(artwork, filename, function(err, result) {
            if (err) return done(err);
            
            self.emit('artworkEmbedded', result.filename);
            done(null, result);
        });
    };
};


/**
 * Private API.
 */

/**
 * Walks the directory {@code dir} in search for files that match the regexp
 * {@code regexp}. The matching files are added to the result; the rest are 
 * discarded.
 *
 * Subdirectories are walked too!
 *
 * @param {String} dir The directory that has to be walked.
 * @param {String} regexp The regular expression used to filter the directory.
 * @return {Array} An array containing all the files found in the directory.
 */
function getFilesToBeProcessed(dir, regexp) {
    var result = [];
    var files = fs.readdirSync(dir);
    var filter = new RegExp(regexp);

    files.forEach(function(f) {
        if (filter.test(f)) {
            result.push({
                absolute: path.resolve(dir, path.separator, f),
                directory: path.dirname(path.resolve(dir, path.separator, f)),
                filename: f
            });
        } else {
            var stats = fs.statSync(path.resolve(dir, path.separator, f));
            if (stats.isDirectory()) {
                result = result.concat(getFilesToBeProcessed(f, regexp));
            }
        }
    });

    return result;
}
