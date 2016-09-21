var debug = require('debug')('tuner');
var debugMp4art = require('debug')('mp4art');
var EventEmitter = require('events').EventEmitter;
var exec = require('child_process').exec;
var util = require('util');
var fs = require('fs');
var path = require('path');
var xld = require('./xld');
var itunes = require('itunes');
var sips = require('./sips');
var async = require('async');
var config = require('./config');
var utils = require('./utils');

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
util.inherits(Tuner, EventEmitter);

/**
 * Public API.
 */

/**
 * Command: Convert
 */
function ConvertMetadata(sourceDir) {
  this.sourceDir = path.resolve(sourceDir);
  this.files = getFilesToBeProcessed(sourceDir, AUDIO_FILES_REGEXP);

  this._resolveArtwork();
}

ConvertMetadata.prototype._resolveArtwork = function () {
  var self = this;
  var coverName = config.get('artwork:name');
  var supportedExtensions = config.get('artwork:supportedFormats');
  
  var artworkFile = null;
  supportedExtensions.forEach(function (extension) {
    var coverFile = resolveFilename(self.sourceDir, coverName + '.' + extension);
    if (fs.existsSync(coverFile)) {
      self.artwork = {
        source: coverFile,
        target: path.resolve(path.join(self.sourceDir, EMBEDDED_ART_FILENAME))
      };
    }
  });
};

Tuner.prototype.processDirectory = function (dir) {
  var self = this;

  var metadata = new ConvertMetadata(dir);
  debug('convert metadata %s', JSON.stringify(metadata, null, 4));
  
  this.emit('start', metadata.sourceDir);

  // task definition
  var prepareDirectoryTask = function (done) {
    debug(':: convert:prepareDirectory');
    self.emit('preparingDirectory', metadata.sourceDir);
    self.createArtworkThumbnail(metadata.artwork, done);
  };

  var processFilesTask = function (done) {
    debug(':: convert:prepareFiles');
    async.eachSeries(metadata.files, function (f, fileDone) {
      async.waterfall([
        function prepareTrack (done) {
          self.emit('preparingTrack', f);
          done(null);
        },
        self.convertFile(f),
        self.embedArtworkToFile(metadata.artwork.target, f)
      ], function (err, result) {
        if (err) return fileDone(err);
                        
        self.emit('trackProcessed', f);
        fileDone(null);
      });
    }, function (err) {
      if (err) return done(err);
      done(null);
    });
  };

  var cleanUpTask = function (done) {
    debug(':: convert:cleanUp');
    fs.writeFileSync(path.resolve(path.join(metadata.sourceDir, '.processed')), '', 'utf-8');
    self.cleanUp(metadata.artwork, done);
  };

  async.waterfall([
    prepareDirectoryTask,
    processFilesTask,
    cleanUpTask
  ], function (err, result) {
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
Tuner.prototype.createArtworkThumbnail = function (artwork, cb) {
  if (artwork.source === null) {
    return cb(new Error('No cover file present'));
  }

  debug('converting artwork %s to %s', artwork.source, artwork.target);
  sips(artwork.source, artwork.target, function (err) {
    if (err) {
      cb(err);
    } else {
      cb(null);
    }
  });
};

Tuner.prototype.embedArtwork = function (artwork, track, cb) {
  var cmd = 'mp4art --add ' + utils.escapeshell(artwork) + ' ' + utils.escapeshell(track);
  debugMp4art('embed artwork command %s', cmd);

  var mp4art = exec(cmd, function (err, stdout, stderr) {
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

Tuner.prototype.cleanUp = function (artwork, done) {
  fs.unlink(artwork.target, done);
};

/**
 * Command: Clean
 */

function CleanMetadata(sourceDir) {
  this.sourceDir = path.resolve(sourceDir);
  this.files = getFilesToBeProcessed(sourceDir, /\.(flac|wav|processed|m3u|m3u8)$/);
  this.processedLockFile = path.join(this.sourceDir, '.processed');
}

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
Tuner.prototype.cleanDirectory = function (dir, done) {
  debug("cleaning the directory '%s'", dir)
  
  var metadata = new CleanMetadata(dir);
  debug('clean metadata %s', JSON.stringify(metadata, null, 4));

  if (!fs.existsSync(metadata.processedLockFile)) {
    this.emit('cleanDirectoryError', { code: 1 });
    return;
  }

  var self = this;
  metadata.files.forEach(function (f) {
    if (self.dryRun) {
      debug('dry run enabled: skipping file deletion');
    } else {
      fs.unlinkSync(f.source);
    }
    self.emit('fileRemoved', f);
  });
};

/**
 * Command: Add (to iTunes)
 */

function AddToItunesMetadata(sourceDir) {
  this.sourceDir = path.resolve(sourceDir);
  this.files = getFilesToBeProcessed(sourceDir, /\.m4a$/);
}

Tuner.prototype.addToItunes = function (dir, done) {
  dir = path.resolve(dir);

  var metadata = new AddToItunesMetadata(dir);
  debug('addToItunes metadata %s', JSON.stringify(metadata, null, 4));

  var self = this;
  metadata.files.forEach(function (f) {
    debug('adding %j to itunes', f);
    if (self.dryRun) {
      debug("dry run enabled: skipping the file '%s'", f);
    } else {
      itunes.once('added', function(result) {
          self.emit('fileAdded', f);
      });
      itunes.add(f.source);
    }
  });
};

Tuner.prototype.handleDirectoryError = function (err, dir) {
  console.error();
  if (err.code === 'ENOENT') {
    console.error("  error: the directory '%s' does not exist", dir);
  } else {
    console.error('  error: %s', err.message);
  }
  console.error();
  process.exit(1);
};

Tuner.prototype.convertFile = function (file) {
  var self = this;
  return function (done) {
    xld.convert(file.source, {format: xld.formats.alac, output: file.directory}, function (err, result) {
      if (err) {
        done(err);
      } else {
        self.emit('trackConverted', file);
        done(null);
      }
    });
  };
};

Tuner.prototype.embedArtworkToFile = function (artwork, file) {
  debug('embedding artwork to %j', file.target);
  var self = this;
  return function (done) {
    self.emit('beforeEmbeddingArtwork', { filename: file.target, artwork: artwork });
    self.embedArtwork(artwork, file.target, function (err, result) {
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
 * @param {RegExp} regexp The regular expression used to filter the directory.
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

function resolveFilename(dir, file) {
  return path.resolve(path.join(dir, file));
}

function AudioFile(dir, filename) {
    dir = path.resolve(dir);
    this.source = path.join(dir, filename);
    this.target = path.join(dir, filename.replace(FILE_EXTENSION_REGEXP, '.m4a'));
    this.directory = path.dirname(this.source);
    this.filename = filename;
}
