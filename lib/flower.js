exports.parallel = function() {
    
};

exports.series = function(callbacks, done) {
    var results = [];
    function next() {
        var callback = callbacks.shift();
        if (callback) {
            callback(function(err, result) {
                results.push(result);
                process.nextTick(next);
            });
        } else {
            done(results);
        }
    }

    next();
};
