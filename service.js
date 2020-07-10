/*
 * Delta L7 HTTP Proxy
 *
 * Service Container
 */

const delta = require( "./index" );

const {Context} = require("junk-bucket/context");

//TODO: To be moved to junk-bucket
const { service  } = require("junk-bucket/service");
const {MetricsPlatform, logMetricSink} = require("./junk");

let args = require( 'yargs' )
	.option( 'ttl', { description: 'Terminate the serivce after a set period of seconds.' } )
	.option( 'control-http-port', { default: 9000, alias: "port" } )
	.option( 'control-http-ip', { description: 'IP address to listen to', alias: "ip", default: "127.0.0.1" })
	.argv

if( args.ttl ) {
	setTimeout( () => {
		rootLogger.info( "TTL expired after " + args.ttl + " seconds." );
		process.exit( 1 );
	}, args.ttl * 1000 )
}

const {initTracerFromEnv} = require('jaeger-client');
const {tracingInit} = require("junk-bucket/opentracing");

async function setupTracer(context){
	const config = {
		serviceName: process.env.JAEGER_SERVICE_NAME || context.name
	};
	const options = {
		logger: context.logger
	};

	const tracer = initTracerFromEnv(config, options);
	tracingInit(tracer,context);
	return tracer;
}

const name = "Irrigation";
service( name, {
	launch: async (logger) => {
		const context = new Context(name, logger);
		await setupTracer(context);
		if( process.env.NODE_ENV === "production" ){
			process.on("uncaughtException", (e) => {
				logger.error("Uncaught exception.  The application will recover, however it should be restarted.", e);
			});
		}

		const core = new delta.Delta( logger, context );
		const url = await core.start(  args["control-http-port"], args["control-http-ip"] );
		logger.info("Delta started at ", url);
		return core;
	}
});
