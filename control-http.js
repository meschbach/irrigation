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
let url = require( 'url' )

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

	start( port ) {
		port = port || 0
		if( this.is_running() ) { return this.start_promise; }

		let service = express()
		service.p_post = function promised_post( uri, handler ){
			this.post( uri, ( req, resp ) => {
				let promised = handler( req, resp )
				q( promised ).done( () => {
					if( !resp.finished ) {
						console.error( "Failed to finish response" )
					}
				}, ( err ) => {
					if( !resp.finished ){
						console.error( "Error while servicing request", err )
						resp.statusCode = 500
						resp.end()
					}
				})
			})
		}

		service.use( morgan( 'short' ) )
		service.use( bodyParser.json() )
		service.post( '/v1/target/:name', ( req, resp ) => {
			this.delta.register_target( req.params.name, req.body.port )
			resp.statusCode = 201
			resp.end()
		})

		service.get( '/v1/ingress', ( req, resp ) => {
			let ingress_points = this.delta.list_ingress()
			resp.json({ ingress: ingress_points })
		})

		service.p_post( '/v1/ingress', ( req, resp ) => {
			// Validate message
			let port = req.body.port || 0
			let wire_proxy = req.body.wire_proxy || "hand"
			let wait = req.body.wait || true
			let name = req.body.name || "default"

			if( port == 0 && !wait ){
				resp.statusCode = 422
				return resp.json( { errors: ["Must wait on unspecified ports"] } )
			}
			console.log("Validated request")

			// Perform opertaion
			let ingress = this.delta.ingress( name, port, wire_proxy )
			let completion = wait ? ingress.listening : q( port )
			return completion.then( ( boundPort ) => {
				console.log( "Bound port: ", boundPort )
				resp.statusCode = 201
				//TODO Fix
				let scheme = "http"
				//let scheme = req.get( "scheme" )
				resp.json( { _self: scheme + "://" + req.get("host") + "/v1/ingress/" + name } )
			})
		})

		service.get( '/v1/ingress/:name', ( req, resp ) => {
			let name = req.params.name
			let ingress = this.delta.find_ingress( name )
			if( !ingress ){
				resp.statusCode = 404;
				return resp.end();
			}

			let address = ingress.listening.inspect().value
			resp.statusCode = 200
			resp.json({ address: address })
		} )

		service.p_post( '/v1/ingress/:name', ( req, resp ) => {
			let ingress_name = req.params.name
			let targets = req.body.add_targets
			if( !targets ) {
				resp.statusCode = 422;
				return resp.json( { errors: { targets: ["missing"] } } );
			}

			let ingress = this.delta.find_ingress( ingress_name )
			if( !ingress ){
				resp.statusCode = 404;
				return resp.end()
			}

			targets.forEach( ( target ) => {
				ingress.target( target )
			})

			resp.statusCode = 200
			resp.end()
		})

		service.get( "/v1/status", ( req, resp ) => {
			resp.json( { ok: true } )
		})

		this.http_service = service

		this.start_promise = express_extensions.promise_listening_url( service, port )
		return this.start_promise
	}

	stop() {
		this.http_service.close()
		this.http_service = undefined
		this.start_promise = undefined
	}
}

exports.ExpressControlInterface = ExpressControlInterface

