var debug = require('debug')('tuner');
var EventEmitter = require('events').EventEmitter;
var exec = require('child_process').exec;
var sys = require('sys');
var fs = require('fs');
var path = require('path');
var xld = require('./xld');
var itunes = require('itunes');
var sips = require('./sips');
var async = require('async');
var config = require('./config');
var MM = require('musicmetadata');

var AUDIO_FILES_REGEXP = /\.flac|wav$/;
var FILE_EXTENSION_REGEXP = /\.[^.]*$/;
var EMBEDDED_ART_FILENAME = '500.art';

/**
 * Expose the 'Tuner' API.
 */
exports = module.exports = Tuner;

function Tuner(options) {
    EventEmitter.call(this);

    options = options || {};
    this.dryRun = options.dryRun || false;
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
    dir = path.resolve(dir);

    debug('processing directory %s', dir);

    var artwork = path.resolve(path.join(dir, EMBEDDED_ART_FILENAME));
    debug('artwork resolved to %s', artwork)
    var files = getFilesToBeProcessed(dir, AUDIO_FILES_REGEXP);
    debug('found %d files to be processed', files.length);
    
    this.emit('start', dir);

    async.waterfall([
        function prepareDirectory(done) {
            self.emit('preparingDirectory', dir);
            self.createArtworkThumbnail(dir, done);
        },
        function processFiles(done) {
            async.eachSeries(files,
                function(f, fileDone) {
                    async.waterfall([
                        function prepareTrack(done) {
                            self.emit('preparingTrack', f);
                            done(null);
                        },
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
            debug('cleaning up...');

            fs.writeFileSync(path.resolve(path.join(dir, '.processed')), '', 'utf-8');
            self.cleanUp(dir, done);
        }
    ], function(err, result) {
        if (err) {
            self.emit('error', err);
        } else {
            self.emit('end');
        }
    });
};

/**
 *
 */
Tuner.prototype.createArtworkThumbnail = function(dir, cb) {
    var coverName = config.get('artwork:name');
    var supportedExtensions = config.get('artwork:supportedFormats');
    
    var artworkFile = null;
    supportedExtensions.forEach(function(extension) {
        var coverFile = path.resolve(path.join(dir, coverName + '.' + extension));
        if (fs.existsSync(coverFile)) {
            artworkFile = coverFile;
            targetArtwork = path.resolve(path.join(dir, EMBEDDED_ART_FILENAME));
        }
    });

    if (artworkFile === null) {
        cb(new Error('No cover file present'));
    } else {
        sips(artworkFile, targetArtwork, function(err) {
            if (err) {
                cb(err);
            } else {
                cb(null);
            }
        });
    }
};

Tuner.prototype.embedArtwork = function(artwork, track, cb) {
    var cmd = 'mp4art --add "' + artwork + '" "' + track + '"';
    debug('embed artwork command %s', cmd);

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
    var file = path.resolve(path.join(dir, EMBEDDED_ART_FILENAME));
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
    debug("cleaning the directory '%s'", dir)
    var processedFile = path.resolve(path.join(dir, '.processed'));

    if (!fs.existsSync(processedFile) {
        this.emit('cleanDirectoryError', { code: 1 });
        return;
    }

    var self = this;
    var files = getFilesToBeProcessed(dir, '\\.(flac|wav|processed|m3u|m3u8)$');
    files.forEach(
        function(f) {
            if (self.dryRun) {
                debug('dry run enabled: skipping file deletion');
            } else {
                fs.unlinkSync(f.absolute);
            }
            self.emit('fileRemoved', f);
        }
    );
};

Tuner.prototype.addToItunes = function(dir, done) {
    debug("adding to iTunes the directory '%s'", dir);

    var self = this;
    var files = getFilesToBeProcessed(dir, '\\.m4a$');
    files.forEach(
        function(f) {
            if (self.dryRun) {
                debug("dry run enabled: skipping the file '%s'", f);
            } else {
                itunes.once('added', function(result) {
                    self.emit('fileAdded', f);
                });
                itunes.add(path.resolve(path.join(dir, f)));
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

Tuner.prototype.convertFile = function(file) {
    var self = this;
    return function(done) {
        xld.convert(file.absolute, {format: xld.formats.alac, output: file.directory}, function(err, result) {
            if (err) {
                done(err);
            } else {
                self.emit('trackConverted', file);
                done(null);
            }
        });
    }
};

Tuner.prototype.embedArtworkToFile = function(artwork, file) {
    debug('embedding artwork to %j', file);
    var self = this;
    return function(done) {
        var filename = path.resolve(path.join(file.directory, file.filename.replace(FILE_EXTENSION_REGEXP, '.m4a')));
        self.emit('beforeEmbeddingArtwork', {filename: filename, artwork: artwork});
        self.embedArtwork(artwork, filename, function(err, result) {
            if (err) return done(err);
            
            self.emit('artworkEmbedded', result.filename);
            done(null, result);
        });
    };
};


// v2
Tuner.prototype.import = function(dir) {
    var files = getFilesToBeProcessed(dir, /\.flac/);
    console.log(files);
    var libraryroot = config.get('library:home');

    files.forEach(function(f) {
        //console.log(path.dirname(f.absolute));
        //console.log(path.basename(f.directory));
        var artisthome = path.resolve(libraryroot, f.directory);
        var isMultidisc = /^disc|cd \d+$/gi.test(path.basename(f.directory));
        console.log(isMultidisc);
        if (isMultidisc) {
            console.log(path.basename(path.dirname(f.directory)));
            artisthome = path.resolve(libraryroot, path.dirname(path.basename(f.directory)));
        }

        console.log(artisthome);

        //var artisthome = path.resolve(libraryroot, target);

        //if (!fs.existsSync())



        //var parser = new MM(fs.createReadStream(f.absolute));
        /*parser.on('metadata', function(metadata) {
            //console.log(metadata);
            var artisthome = path.resolve(libraryroot, metadata.artist[0]);
            if (!fs.existsSync(artisthome)) {
                fs.mkdirSync(artisthome);
                artisthomeExists = true;
            }

            var target = path.resolve(artisthome, f.filename);

            console.log('copying %s into ', f.absolute, target);
            fs.createReadStream(f.absolute).pipe(fs.createWriteStream(target));
            console.log('%s - %s has been imported', metadata.artist, metadata.title);
        });*/
    });
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

    files.forEach(function (f) {
        if (filter.test(f)) {
            result.push(new AudioFile(dir, f));
        } else {
            var stats = fs.statSync(path.resolve(path.join(dir, f)));
            if (stats.isDirectory()) {
                result = result.concat(getFilesToBeProcessed(path.resolve(path.join(dir, f)), regexp));
            }
        }
    });

    return result;
}

function AudioFile(dir, filename) {
    this.absolute = path.resolve(path.join(dir, filename));
    this.directory = path.dirname(this.absolute);
    this.filename = filename;
}
