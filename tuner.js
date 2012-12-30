#!/usr/bin/env node

var util = require('util');
var exec = require('child_process').exec;
var spawn = require('child_process').spawn;
var fs = require('fs');
var path = require('path');
var program = require('commander');
var flower = require('./flower');
var xld = require('./xld');

// - workflow
var createArtworkThumbnail = function(dir, cb) {
    console.log('Creating the 500x500 thumbnail');
    var artworkFile = path.resolve(dir, path.separator, 'cover.jpg');
    console.log(artworkFile);
    if (fs.existsSync(artworkFile)) {
        var sips = exec('sips --resampleWidth 500 cover.jpg --out cover500.jpg', function(err, stdout, stderr) {
            if (err) {
                cb(err);
            } else {
                cb(null, dir);
            }
        });
    }
};

var embedArtwork = function(artwork, track, cb) {
    console.log('Adding the artwork %s to the track %s', artwork, track);
    var cmd = 'mp4art --add "' + artwork + '" "' + track + '"';
    console.log(cmd)
    var mp4art = exec(cmd, function(err, stdout, stderr) {
        cb(null, 'artwork embeded');
    });
};

// ---

program
    .version('0.0.1');

program
    .command('convert <dir>')
    .description('Processes the files in the specified directory')
    .action(function(dir) {
        var functions = [];
        fs.readdir(dir, function(err, files) {
            files
                .filter(function(f) { return /\.flac$/.test(f); })
                .forEach(function(f) {
                    var filename = path.resolve(dir, path.separator, f);
                    var convertFile = function(done) {
                        xld.convert(filename, {format: 'alac', output: dir}, done);
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
            
            flower.series(functions, function(results) {
                console.log('I am done');
            });
        });
    });

program.parse(process.argv);
