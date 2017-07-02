/*
 * Delta L7 Proxy System
 *
 * Express HTTP Control Interface
 */

//External depedencies
let bodyParser = require('body-parser');
let express = require( 'express' )
let morgan = require( 'morgan' )
let q = require( 'q' )

// Internal dependencies
let defer = require( './defer' )
let express_extensions = require( './express-extensions' )

/*
 * Control Plane
 */
class ExpressControlInterface {
	constructor( delta ) {
		this.delta = delta
	}

	is_running(){ return this.http_service != undefined }

	start( ) {
		if( this.is_running() ) { return this.start_promise; }

		let service = express()
		service.use( morgan( 'short' ) )
		service.use( bodyParser.json() )
		service.post( '/v1/target/:name', ( req, resp ) => {
			this.delta.register_target( req.params.name, req.body.port )
			resp.statusCode = 201
			resp.end()
		})
		this.http_service = service

		this.start_promise = express_extensions.promise_listening_url( service, 0 )
		return this.start_promise
	}

	stop() {
		this.http_service.close()
		this.http_service = undefined
		this.start_promise = undefined
	}
}

exports.ExpressControlInterface = ExpressControlInterface
