exports.parallel = function() {
    
};

function WorkflowStep(name, handler) {
    this.name = name;
    this.handler = handler;
};

module.exports.WorkflowStep = WorkflowStep;

exports.series = function(steps, done) {
    var results = [];
    function next() {
        var step = steps.shift();
        if (step) {
            step(function(err, result) {
                if (err) {
                    //console.log('flower callback error');
                    //console.log(err);
                    done(err);
                } else {
                    //console.log('flower else result')
                    //console.log(result);
                    results.push(result);
                    process.nextTick(next);
                }
            });
        } else {
            done(null, results);
        }
    }

    next();
};
