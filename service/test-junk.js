/**
 * Contains resources related to testing.  These should eventually be moved into junk-bucket
 */
const bunyan = require("bunyan");
const bunyanFormat = require("bunyan-format");


/**
 *
 * @param name
 * @param debug
 * @returns {Logger}
 */
function createTestLogger( name, debug = false ){
	const level = debug ? "trace" : "error";
	// Taken from: https://github.com/trentm/node-bunyan/issues/436
	const logger = bunyan.createLogger({
		name: name,
		streams: [
			{stream: bunyanFormat({outputMode: 'short'}), level: level}
		]
	});
	return logger;
}

module.exports = {
	createTestLogger
};