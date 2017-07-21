/*
 * Delta L7 HTTP Proxy
 */
let bodyParser = require('body-parser');
let express = require( 'express' )
let http = require( 'http' )
let morgan = require( 'morgan' )
let q = require( 'q' )
let request = require( 'request' )
let url = require( 'url' )

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
		console.log( "Awaiting listener" )
		let listener = service.listen( port, () => {
			let host = "localhost"
			//let host = listener.address().address
			let url = "http://" + host + ":" + listener.address().port
			console.log("Listneing on ", url)
			resolve( url )
		})
	})
}

/*
 * Produces intsnaces of the hand rolled proxier
 */
class HandRolledProxierProducer {
	constructor(){ }

	produce( details ) {
		return  new HandRolledProxier()
	}
}

/*
 * Attempt to write a proxier myself.
 */
class HandRolledProxier {
	constructor(){ }

	proxy( target, request, response ){
			let agent = new http.Agent({ keepAlive: false })
			console.log( "Requesting ", target, request.method, request.url )
			let req = http.request({
				host: 'localhost',
				method: request.method,
				port: target.port,
				path: request.url,
				timeout: 0.1,
				headers: request.headers,
				agent: agent
			}, ( targetResp ) => {
				console.log( "Response received" )
				response.statusCode = targetResp.statusCode
				targetResp.pipe( response )
			})
			req.on( 'error', ( problem ) => {
				console.log( "Error: ", problem )
			})
			request.pipe( req )
	}
}

/*
 * Responsible for delegating a proxy request the correct proxy handler
 */
class DeltaIngress {
	/*
	 * @param mesh locates the best target to utilize
	 */
	constructor( listening, mesh, wire_proxy ){
		if( !listening ){ throw new Error("listening required") }
		if( !mesh ){ throw new Error("mesh required") }
		this.listening = listening
		this.targets = []
		this.mesh = mesh
		this.wire_proxy = wire_proxy
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
			this.wire_proxy.proxy( target, request, response )
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
 * Node HTTP Proxy
 */
class NHPFactory {
	constructor( nhp ){
		if( !nhp ){ throw new Error( "node-http-proxy must be defined." ); }
		this.nhp = nhp
	}

	produce( details ){
		let proxy = this.nhp.createProxyServer( {} )
		return new NHPWireProxy( proxy )
	}
}

class NHPWireProxy {
	constructor( proxy ){
		this.wire = proxy
	}

	proxy( target, request, response ){
		this.wire.web( request, response, { target: "http://localhost:" + target.port } )
	}
}

/*
 * Top level proxy system state manager
 */
class Delta {
	constructor() {
		this.ingress_controllers = {}
		this.targets = {}

		this.wire_proxy_factories = {}
		this.wire_proxy_factories[ 'hand' ] = new HandRolledProxierProducer()
		try {
			let httpProxy = require( 'http-proxy' )
			this.wire_proxy_factories[ 'node-http-proxy' ] = new NHPFactory( httpProxy )
		} catch( e ) {
			console.log( "Not registering http-proxy wire factory because not found" )
		}
	}

	/**
	 * Boots up the default ingress listener and attaches a handler for hearing control messages
	 */
	start( port ) {
		let controller = new ExpressControlInterface( this )
		return controller.start( port )
	}

	/*
	 * Establish a service to handle incoming requests
	 */
	ingress( name, port, wire_proxy_name ) {
		let server = new http.Server( ( request, response ) => {
			console.log("Accepted request")
			ingress.requested( request, response )
		})
		let whenListening = http_promise_listen_url( server, 0 )

		let wire_factory = this.wire_proxy_factories[ wire_proxy_name || "hand" ]
		if( !wire_factory ){ throw new Error( "No such wire proxy registered: " + wire_proxy_name ); }

		let wire_proxy = wire_factory.produce( {} )
		var ingress = new DeltaIngress( whenListening, this, wire_proxy )
		this.ingress_controllers[ name ] = ingress
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

	find_ingress( name ){
		return this.ingress_controllers[ name ]
	}

	list_ingress() {
		return Object.keys( this.ingress_controllers ).map( ( name ) => {
			let ingress = this.ingress_controllers[ name ]
			let addressURL = ingress.listening.inspect().value
			let address = { name: name, address: addressURL, resolved: addressURL != undefined }
			return address
		} )
	}
}

exports.defer = defer
exports.Delta = Delta
exports.DeltaClient = DeltaClient
exports.promise_get_request = promise_get_request
exports.promise_post_json_request = promise_post_json_request

