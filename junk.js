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

function testLogger( name, verbose ){
	if( verbose ){
		const {formattedConsoleLog} = require("junk-bucket/logging-bunyan");
		return formattedConsoleLog(name);
	} else {
		return defaultNullLogger;
	}
}

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
const assert = require("assert");
function startMetric( watcher ){
	assert(watcher.observe);
	const start = Date.now();

	const point = {};
	point.done = () => {
		const elapsedTime = Date.now() - start;
		watcher.observe(elapsedTime);
	};
	return point;
}

function promiseMetric( sink, name, tags, promise ){
	promise.then( () => {
		sink.done();
	}, () => {
		sink.done();
	});
	return promise;
}

const metricsSystem = require("prom-client");
class MetricsPlatform {
	constructor(registry) {
		this.registry = registry;
		this.seen = {}
	}

	measure(name, tags){
		if( !this.seen[name]) {
			this.seen[name] = new metricsSystem.Histogram({name, help: "TODO", labels: tags, registers:[this.registry]});
		}
		const watcher = this.seen[name];
		return startMetric(watcher, name, tags);
	}

	promise(name, tags, promise) {
		const sink = this.measure(name,tags);
		return promiseMetric(sink, name, tags, promise);
	}
}

function newMetricsPlatform(){
	const registry = new metricsSystem.Registry();
	return new MetricsPlatform(registry);
}

/***********************************************************************************************************************
 * OpenTracing
 **********************************************************************************************************************/

function traceError(context, err, details = {}){
	const span = context.opentracing.span;
	span.setTag("error",true);
	span.log({'event': 'error', 'error.object': err, 'message': err.message, 'stack': err.stack});
	Object.keys(details).forEach((k) => span.setTag(k,details[k]));
}

function assertContextTracer(ctx) {
	assert( ctx.opentracing );
	assert( ctx.opentracing.tracer );
}

/***********************************************************************************************************************
 * Exports
 **********************************************************************************************************************/
module.exports = {
	assertContextTracer,

	listen,
	defaultNullLogger,
	testLogger,

	startMetric,
	promiseMetric,
	MetricsPlatform,
	newMetricsPlatform,

	traceError
};
