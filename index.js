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

function promise_get_request( url ) {
	return defer( ( resolve, reject ) => {
		request( url, (err, resp, body) => {
			if( err ){ return reject( err ) }
			resolve( { headers: resp, body } )
		})
	})
}


function express_promise_listen_url( app, port ){
	return defer( ( resolve, reject ) => {
		let listener = app.listen( port, () => {
			let url = "http://localhost:" + listener.address().port
			resolve( url )
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
}

class DeltaTarget {
	constructor( port ) {
		if( !port ) { throw new Error("port may not be falsy"); }
		this.port = port
	}
}

class Delta {
	constructor() {
		this.intake = []
		this.targets = {}
	}

	/**
	 * Boots up the default ingress listener and attaches a handler for hearing control messages
	 */
	start() {
		this.control = express()
		this.control.use( morgan( 'short' ) )
		this.control.use( bodyParser.json() )
		this.control.post( '/v1/target/:name', ( req, resp ) => {
			this.targets[ req.params.name ] = new DeltaTarget( req.body.port )
			resp.statusCode = 201
			resp.end()
		})

		let promise = express_promise_listen_url( this.control, 0 )
		promise.then( (port) => { console.log("Delta running on port " + port) } ).done()
		return promise
	}

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

