/*
 * Delta L7 HTTP Proxy
 *
 * Service Container
 */

let args = require( 'yargs' )
	.option( 'port', { default: 9000 } )
	.argv

let delta = require( "./index" )
let service = new delta.Delta()

service.start( args.port ).then( ( url ) => {
	console.log( "Delta started: ", url )
})

