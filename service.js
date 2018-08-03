/*
 * Delta L7 HTTP Proxy
 *
 * Service Container
 */

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

const bunyan = require("bunyan");
const bunyanFormat = require("bunyan-format");
const formattedLogger = bunyanFormat({outputMode: 'short'});
const rootLogger = bunyan.createLogger({name: "irrigation", stream: formattedLogger, level: 'debug'});

let delta = require( "./index" )
let service = new delta.Delta( rootLogger );

service.start( args.port, args["control-listen-ip"] ).then( ( url ) => {
	rootLogger.info( "Delta started: ", url )
})

