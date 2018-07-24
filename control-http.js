/*
 * Irragation L7 Proxy System
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
const Future = require("junk-bucket/future");
const {make_async} = require("junk-bucket/express");
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

		let service = make_async( express() )
		service.use( morgan( 'short' ) )
		service.use( bodyParser.json() )

		service.post( '/v1/target/:name', ( req, resp ) => {
			let body = req.body
			let port = body.port

			if( !port ) {
				resp.statusCode = 422
				return resp.json( {errors: { port: "may not be falsy"} } )
			}

			this.delta.register_target( req.params.name, req.body.port )
			resp.statusCode = 201
			resp.json( {} )
			resp.end()
		})

		service.get( '/v1/ingress', ( req, resp ) => {
			let ingress_points = this.delta.list_ingress()
			resp.json({ ingress: ingress_points })
		})

		service.a_post( '/v1/ingress', async ( req, resp ) => {
			// Validate message
			let port = req.body.port || 0
			let wire_proxy = req.body.wire_proxy || "hand"
			let wait = req.body.wait || true
			let name = req.body.name || "default"
			const scheme = req.body.scheme || "http";
			const certificateName = req.body.certificateName;

			if( port == 0 && !wait ){
				resp.statusCode = 422
				return resp.json( { errors: ["Must wait on unspecified ports"] } )
			}
			if( !["http", "https"].includes(scheme) ){
				resp.statusCode = 422;
				return resp.json( { errors: {scheme: ["must be either http or https"]}} );
			}
			if( scheme == "https" && !certificateName ) {
				resp.statusCode = 422;
				return resp.json( { errors: {certificateName: ["Must be defined"]}} );
			}
			console.log("Validated request; looks reasonable")

			// Perform opertaion
			let ingress;
			if( scheme == "https") {
				console.log("Certificate name ", certificateName);
				ingress = this.delta.secureIngress( name, port, wire_proxy, certificateName )
			} else {
				ingress = this.delta.ingress( name, port, wire_proxy )
			}
			let completion = wait ? ingress.listening : Promise.resolve( port )
			const boundPort = await completion;

			console.log( "Bound port: ", boundPort )
			resp.statusCode = 201
			//let scheme = req.get( "scheme" )
			resp.json( { _self: scheme + "://" + req.get("host") + "/v1/ingress/" + name } )
		})

		service.get( '/v1/ingress/:name', ( req, resp ) => {
			let name = req.params.name
			let ingress = this.delta.find_ingress( name )
			if( !ingress ){
				resp.statusCode = 404;
				return resp.end();
			}

			ingress.listening.then( (address) => {
				resp.statusCode = 200
				resp.json({ address: address })
			});
		} )

		service.a_post( '/v1/ingress/:name', ( req, resp ) => {
			let ingress_name = req.params.name
			let targets = req.body.add_targets

			console.log( "delta-d: Requested to use ", targets, " with ", ingress_name )

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
				console.log( "delta-d: Registering ", target, " with ", ingress_name )
				ingress.target( target )
			})

			resp.statusCode = 200
			resp.json( { status: "ok" })
		})

		service.get( "/v1/status", ( req, resp ) => {
			resp.json( { ok: true } )
		})

		service.a_get( "/v1/certificate", async ( req, resp ) => {
			const names = await this.delta.certificateManager.names();
			resp.json( { ok: true, names } )
		})

		service.a_put( "/v1/certificate/:name", async (req, resp) => {
			const name = req.params.name;

			const cert = req.body.cert;
			const key = req.body.key;

			await this.delta.certificateManager.store( name, cert, key )
			resp.json( {ok: true } )
		});

		this.http_service = service

		const bind = new Future();
		let listener = service.listen( port, () => {
			let url = "http://localhost:" + listener.address().port
			console.log( "URL", url );
			bind.accept( url );
		})
		this.http_socket = listener;

		this.start_promise = bind.promised;
		return this.start_promise
	}

	stop() {
		if (this.http_socket) {
			console.info("Cleaning up HTTP socket");
			this.http_socket.close()
			this.http_socket = undefined
		} else {
			console.warn("Not bound, may leak");
		}
		this.http_service = undefined
		this.start_promise = undefined
	}
}

exports.ExpressControlInterface = ExpressControlInterface

