/*
 * Delta L7 HTTP Proxy
 *
 * Service Container
 */

let args = require( 'yargs' )
	.option( 'port', { default: 9000 } )
	.options( 'ttl', { description: 'Terminate the serivce after a set period of seconds.' } )
	.argv

if( args.ttl ) {
	setTimeout( () => {
		console.error( "TTL expired after " + args.ttl + " seconds." );
		process.exit( 1 );
	}, args.ttl * 1000 )
}


let delta = require( "./index" )
let service = new delta.Delta()

service.start( args.port ).then( ( url ) => {
	console.log( "Delta started: ", url )
})

