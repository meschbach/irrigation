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

	start( ) {
		if( this.is_running() ) { return this.start_promise; }

		let service = express()
		service.p_post = function promised_post( uri, handler ){
			this.post( uri, ( req, resp ) => {
				let promised = handler( req, resp )
				q( promised ).finally( () => {
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
		service.p_post( '/v1/ingress', ( req, resp ) => {
			// Validate message
			let port = req.body.port || 0
			let wire_proxy = req.body.wire_proxy || "hand"
			let wait = req.body.wait || true

			if( port == 0 && !wait ){
				resp.statusCode = 422
				return resp.json( { errors: ["Must wait on unspecified ports"] } )
			}
			console.log("Validated request")

			// Perform opertaion
			let ingress = this.delta.ingress( port, wire_proxy )
			let completion = wait ? ingress.listening : q( port )
			return completion.then( ( boundPort ) => {
				console.log( "Bound port: ", boundPort )
				resp.statusCode = 201
				//TODO Fix
				let scheme = "http"
				//let scheme = req.get( "scheme" )
				let address_url = url.parse( boundPort )
				let resource_name = address_url.host
				console.log("Resource name: ", resource_name )
				resp.json( { _self: scheme + "://" + req.get("host") + "/v1/ingress/" + resource_name } )
			})
		})

		service.get( '/v1/ingress/:address', ( req, resp ) => {
			let address = req.params.address
			resp.statusCode = 200
			resp.json({ address: address })
		})

		service.p_post( '/v1/ingress/:address', ( req, resp ) => {
			let address = req.params.address
				console.log( "Finding : ", address )
			return this.delta.find_ingress( address ).then( (ingress) => {
				if( !ingress ){
					resp.statusCode = 404;
					return resp.end()
				}

				console.log( "Steps")
				req.body.add_targets.forEach( ( target ) => {
					ingress.target( target )
				})

				resp.statusCode = 200
				resp.end()
			})
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

