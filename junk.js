/***********************************************************************************************************************
 * Utilities without a proper home at this time.
 *
 * Some of these are likely to find a home in junk-bucket.
 **********************************************************************************************************************/
const {nope} = require("junk-bucket");

/***********************************************************************************************************************
 * Utilities
 **********************************************************************************************************************/
//TODO MEE: Should be in junk-bucket 1.3.0
const defaultNullLogger = Object.freeze({
	info: nope,
	error: nope,
	debug: nope,
	warn: nope,
	trace: nope,
	child: function() { return Object.freeze(Object.assign({}, defaultNullLogger)); }
});

/**********************************************************
 * sockets
 **********************************************************/
//TODO MEE: Should be in junk-bucket 1.3.0
const {addressOnListen} = require("junk-bucket/sockets");
async function listen(context, server, port, bindToAddress){
	const result = addressOnListen(server, port, bindToAddress);
	result.socket.on("close", function(){
		context.logger.trace("Server socket closed");
	});
	context.onCleanup(async () => {
		context.logger.trace("Cleaning up server",{address});
		//TODO: This should be merged with addressOnListen, making this state management easier
		// const promiseClosed = promiseEvent(result.socket, "close");
		result.stop();
		// await promiseClosed;
	});
	const address = await result.address;
	context.logger.trace("Server bound to",{address});
	return address.host + ":" + address.port;
}

/**********************************************************
 * Metrics
 **********************************************************/
function startMetric( sink, name, tags ){
	const start = Date.now();

	const point = {};
	point.done = () => {
		const elapsedTime = Date.now() - start;
		sink(name, elapsedTime, tags);
	};
	return point;
}

function promiseMetric( sink, name, tags, promise ){
	const point = startMetric(sink,name,tags);
	promise.then( () => {
		point.done();
	}, () => {
		point.done();
	});
	return promise;
}

function logMetricSink( logger ){
	return function (name, elapsedTime, tags) {
		logger.info("Performance", {name,elapsedTime,tags});
	}
}

class MetricsPlatform {
	constructor(sink) {
		this.sink = sink;
	}

	measure(name, tags){
		return startMetric(this.sink, name, tags);
	}

	promise(name, tags, promise) {
		return promiseMetric(this.sink, name, tags, promise);
	}
}

function newLoggingMetricsPlatform(logger){
	return new MetricsPlatform(logMetricSink(logger));
}

/***********************************************************************************************************************
 * Exports
 **********************************************************************************************************************/
module.exports = {
	listen,
	defaultNullLogger,

	startMetric,
	promiseMetric,
	logMetricSink,
	MetricsPlatform,
	newLoggingMetricsPlatform
};
