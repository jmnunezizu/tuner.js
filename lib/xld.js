/*
xld [-c cuesheet] [--ddpms DDPMSfile] [-e] [-f format] [-o outpath] [-t track] [--raw] file
    -c: Cue sheet you want to split file with
    -e: Exclude pre-gap from decoded file
    -f: Specify format of decoded file
          wav        : Microsoft WAV (default)
          aif        : Apple AIFF
          raw_big    : Raw PCM (big endian)
          raw_little : Raw PCM (little endian)
          mp3        : LAME MP3
          aac        : MPEG-4 AAC
          flac       : FLAC
          alac       : Apple Lossless
          vorbis     : Ogg Vorbis
          wavpack    : WavPack
    -o: Specify path of decoded file
        (directory or filename; directory only for cue sheet mode)
    -t: List of tracks you want to decode; ex. -t 1,3,4
    --raw: Force read input file as Raw PCM
           following 4 options are required
      --samplerate: Samplerate of Raw PCM file; default=44100
      --bit       : Bit depth of Raw PCM file; default=16
      --channels  : Number of channels of Raw PCM file; default=2
      --endian    : Endian of Raw PCM file (little or big); default=little
    --correct-30samples: Correct "30 samples moved offset" problem
    --ddpms: DDPMS file (assumes that the associated file is Raw PCM)
    --stdout: write output to stdout (-o option is ignored)
    --profile <name>: Choose a profile saved as <name> in GUI
    --logchecker <path>: Check sanity of a logfile in <path>
*/

var debug = require('debug')('xld');
var exec = require('child_process').exec;
var path = require('path');
var EventEmitter = require('events').EventEmitter;
var util = require('util');

/*
 * Private API
 */

function isFormatSupported(format) {
    return FORMATS.hasOwnProperty(format);
}

/**
 *
 */
function Xld() {
    EventEmitter.call(this);
}

/**
 * Inherit from EventEmitter.
 */
util.inherits(Xld, EventEmitter);

Xld.prototype.Xld = Xld;

/**
 *
 */
Xld.prototype.convert = function(filename, options, cb) {
    var self = this;
    var xldOptions = [];
    if (options.format && !isFormatSupported(options.format)) {
        throw new Error('The format %s is not supported', options.format);
    }

    //xldOptions.push('--stdout');
    xldOptions.push('-f ' + (options.format || 'wav'));
    xldOptions.push('-o "' + (options.output || __dirname) + '"');

    var cmd = 'xld ' + xldOptions.join(' ') + ' "' + filename + '"';
    debug('xld command %s', cmd);
    
    var proc = exec(cmd, function(err, stdout, stderr) {
        if (err !== null) {
            cb(err);
        } else {
            if (/done/.test(stderr)) {
                cb(null, { filename: filename });
            } else {
                var error = new Error('Error converting the file');
                error.filename = filename;
                error.output = stderr;
                error.cmd = cmd;
                
                cb(error);
            }
        }
    });
};

/**
 * Expose the 'XLD' API.
 */
module.exports = exports = new Xld();

var FORMATS = exports.formats = {
    wav: 'wav',
    aif: 'aif',
    raw_big: 'raw_big',
    raw_little: 'raw_little',
    mp3: 'mp3',
    aac: 'aac',
    flac: 'flac',
    alac: 'alac',
    vorbis: 'vorbis',
    wavpack: 'wavpack'
};
