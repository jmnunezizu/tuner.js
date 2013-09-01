var moment = require('moment');
var colour = require('cli-color');
var util = require('util');

var symbols = {
  ok: '✓',
  err: '✖',
  dot: '․'
};

exports = module.exports = Detailed;

exports.useColours = true;

function Detailed(tuner) {
	var self = this;
	var stats = this.stats = { files: 0, converted: 0, errors: 0 };

	tuner.on('start', function() {
		stats.start = new Date();
	});

	tuner.on('preparingTrack', function(track) {
        util.print(' > ', track.filename);
        stats.files++;
    });

    tuner.on('trackProcessed', function(file) {
    	console.log(' ' + colour.green(symbols.ok));
        stats.converted++;
    });

	tuner.on('end', function() {
		stats.end = new Date();
		stats.duration = new Date() - stats.start;
		self.summary();
	});
}

Detailed.prototype.summary = function() {
	var stats = this.stats;
	var fmt;

	console.log();
	
	console.log(colour.green('Total Files: ') + '%s', stats.files);
	console.log(colour.green('Total Time: ') + '%s', moment(stats.duration).format('HH:mm:ss'));
	console.log(colour.green('Finished on: ') + '%s', moment(stats.end).format('dddd DD MMMM YYYY HH:mm:ss'));

	console.log();
};
