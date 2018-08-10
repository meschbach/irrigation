const {nope} = require("junk-bucket");

function nullLogger(){
	return {
		info: nope,
		error: nope,
		debug: nope,
		child: () => {
			return nullLogger();
		}
	}
}

const defaultNullLogger = nullLogger();

const bunyan = require("bunyan");
const bunyanFormat = require("bunyan-format");

function formattedLogger( appName ){
	const formattedLogger = bunyanFormat({outputMode: 'short'});
	const rootLogger = bunyan.createLogger({name: appName, stream: formattedLogger, level: 'debug'});
	return rootLogger
}

module.exports = {
	nullLogger,
	defaultNullLogger,
	formattedLogger,
	formattedConsoleLog: formattedLogger
}
