module.exports = function(grunt) {

    // Project configuration.
    grunt.initConfig({
        lint: {
            all: ['grunt.js', 'lib/**/*.js', 'test/**/*.js']
        },

        lintConfig: {
            indentation: {
                value: 4
            },
            line_endings: {
                enabled: true
            },
            max_line_length: {
                value: 120
            }
        },

        jshint: {
            options: {
                browser: true
            }
        },

        "mocha-server": {
            unit: ['lib/**/*.js']
        },

        watch: {

        }

    });

    //grunt.loadTasks('tasks');
    // Default task.
    grunt.registerTask('default', 'lint');

};
