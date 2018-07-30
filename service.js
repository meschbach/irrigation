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
		console.error( "TTL expired after " + args.ttl + " seconds." );
		process.exit( 1 );
	}, args.ttl * 1000 )
}


let delta = require( "./index" )
let service = new delta.Delta()

service.start( args.port, args["control-listen-ip"] ).then( ( url ) => {
	console.log( "Delta started: ", url )
})

