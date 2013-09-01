var nconf = require('nconf');

nconf
	.file(__dirname + '/../config/config.json');

module.exports = nconf;
