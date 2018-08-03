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

module.exports = {
	nullLogger,
	defaultNullLogger
}