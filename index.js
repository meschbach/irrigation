/*
 * Delta L7 HTTP Proxy
 */
let bodyParser = require('body-parser');
let express = require( 'express' )
let http = require( 'http' )
let morgan = require( 'morgan' )
let q = require( 'q' )
let request = require( 'request' )

// Internal dependencies
let defer = require( './defer' )
let DeltaClient = require( './client' )
let promise_post_json_request = require( './promise-requests' ).post_json
let ExpressControlInterface = require( './control-http' ).ExpressControlInterface

function promise_get_request( url ) {
	return defer( ( resolve, reject ) => {
		request( url, (err, resp, body) => {
			if( err ){ return reject( err ) }
			resolve( { headers: resp, body } )
		})
	})
}

function http_promise_listen_url( service, port ){
	return defer( ( resolve, reject ) => {
		let listener = service.listen( port, () => {
			let url = "http://localhost:" + listener.address().port
			resolve( url )
		})
	})
}

/*
 * Attempt to write a proxier myself.
 */
class HandRolledProxier {
	constructor(){
	}

	proxy( target, request, response ){
			let agent = new http.Agent({ keepAlive: false })
			console.log( "Requesting ", target, request.method, request.url )
			let req = http.request({
				host: 'localhost',
				method: request.method,
				port: target.port,
				path: request.url,
				timeout: 0.1,
				agent: agent
			}, ( targetResp ) => {
				console.log( "Response received" )
				response.statusCode = targetResp.statusCode
				targetResp.pipe( response )
			})
			req.on( 'error', ( problem ) => {
				console.log( "Error: ", problem )
			})
			req.end()
	}
}

/*
 * Responsible for delegating a proxy request the correct proxy handler
 */
class DeltaIngress {
	constructor( listening, mesh ){
		if( !listening ){ throw new Error("listening required") }
		if( !mesh ){ throw new Error("mesh required") }
		this.listening = listening
		this.targets = []
		this.mesh = mesh
	}

	target( name ) {
		this.targets.push( name )
	}

	requested( request, response ){
		if( this.targets.length == 0 ){
			response.statusCode = 503
			response.end()
		} else {
			console.log( "Finding targets", this.targets, request.url )
			let target = this.mesh.find_target( this.targets )
			let proxier = new HandRolledProxier()
			proxier.proxy( target, request, response )
		}
	}
}

/*
 * A target which may be communciated with
 */
class DeltaTarget {
	constructor( port ) {
		if( !port ) { throw new Error("port may not be falsy"); }
		this.port = port
	}
}

/*
 * Top level proxy system state manager
 */
class Delta {
	constructor() {
		this.intake = []
		this.targets = {}
	}

	/**
	 * Boots up the default ingress listener and attaches a handler for hearing control messages
	 */
	start() {
		let controller = new ExpressControlInterface( this )
		return controller.start()
	}

	/*
	 * Establish a service to handle incoming requests
	 */
	ingress( port ) {
		let server = new http.Server( ( request, response ) => {
			console.log("Accepted request")
			ingress.requested( request, response )
		})
		let whenListening = http_promise_listen_url( server, 0 )
		var ingress = new DeltaIngress( whenListening, this )
		this.intake.push( ingress )
		return ingress
	}

	register_target( name, port ){
			this.targets[ name ] = new DeltaTarget( port )
	}

	/*
 	 * TODO: Really a service mesh
 	 */
	find_target( target ){
		return this.targets[target];
	}
}

exports.defer = defer
exports.Delta = Delta
exports.DeltaClient = DeltaClient
exports.promise_get_request = promise_get_request
exports.promise_post_json_request = promise_post_json_request

