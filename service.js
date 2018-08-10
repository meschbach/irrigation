/*
 * Delta L7 HTTP Proxy
 *
 * Service Container
 */

const delta = require( "./index" );
//TODO: To be moved to junk-bucket
const { service  } = require("./util-service");

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

service( "irrigation", {
	launch: async (logger) => {
		const core = new delta.Delta( logger );
		const url = await core.start(  args["control-http-port"], args["control-http-ip"] );
		logger.info("Delta started at ", url);
		return core;
	}
});
