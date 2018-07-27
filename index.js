/*
 * Delta L7 HTTP Proxy
 */
let bodyParser = require('body-parser');
let express = require( 'express' )
let http = require( 'http' )
const https = require( 'https' );
let morgan = require( 'morgan' )
let q = require( 'q' )
let request = require( 'request' )
let url = require( 'url' )

// Internal dependencies
const Future = require("junk-bucket/future");

let DeltaClient = require( './client' )
let promise_post_json_request = require( './promise-requests' ).post_json
let ExpressControlInterface = require( './control-http' ).ExpressControlInterface
const { MemoryCertificateManager } = require( './certificate-manager' );

function promise_get_request( url ) {
	const future = new Future();
	request( url, (err, resp, body) => {
		if( err ){ return future.reject( err ) }
		future.accept( { headers: resp, body } )
	});
	return future.promised;
}

function http_promise_listen_url( service, port ){
	const future = new Future();
	console.log( "Awaiting listener" )
	let listener = service.listen( port, () => {
		let host = "localhost"
		//let host = listener.address().address
		let url = "http://" + host + ":" + listener.address().port
		console.log("Listneing on ", url)
		future.accept( url )
	})
	return future.promised;
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
			const url = new URL(target.url);
			const host = url.hostname;
			const port = url.port;
			console.log( "Requesting ", target, host, port, request.method, request.url )
			let req = http.request({
				host: host,
				method: request.method,
				port: port,
				path: request.url,
				timeout: 30,
				headers: request.headers,
				agent: agent
			}, ( targetResp ) => {
				console.log( "Response received" )
				response.statusCode = targetResp.statusCode
				targetResp.pipe( response )
			})
			req.on( 'error', ( problem ) => {
				console.log( "Error: ", problem )
				response.statusCode = 503;
				response.end();
			})
			request.pipe( req )
	}

	upgrade(){
		throw new Error("Upgrades not supported");
	}
}

/*
 * Responsible for delegating a proxy request the correct proxy handler
 */
class DeltaIngress {
	/*
	 * @param mesh locates the best target to utilize
	 */
	constructor( listening, mesh, wire_proxy, serverSocket ){
		if( !listening ){ throw new Error("listening required") }
		if( !mesh ){ throw new Error("mesh required") }
		this.listening = listening
		this.targets = []
		this.mesh = mesh
		this.wire_proxy = wire_proxy
		this.serverSocket = serverSocket;

		this.targetPoolRules = [];
	}

	useDefaultPool( named ){
		this.defaultPool = named;
	}

	end(){
		this.serverSocket.close();
	}

	/**
	 * @deprecated
	 * @param name
	 */
	target( name ) {
		console.log( "Registering target ", name );
		this.targets.push( name )
	}

	requested( request, response ){
		//TODO: This structure can be improved for performance
		const targetPoolName = this.targetPoolRules.reduce( (pool, f) => {
			return f(pool, request)
		}, this.defaultPool);

		console.log("Resolve target pool too: ", targetPoolName);
		const targetPool = this.mesh.targetPools[targetPoolName] || {};
		console.log("Pool: ", this.mesh.targetPools);
		const targets = Object.values(targetPool.targets || {});
		if( targets.length == 0 ){
			console.log( "No targets found." )
			response.statusCode = 503
			response.end()
		} else {
			const target = targets[0];
			console.log( "Dispatching to ", targets, target )
			this.wire_proxy.proxy( target, request, response )
		}
	}

	upgrade( request, socket, head ){
		//TODO: This structure can be improved for performance
		const targetPool = this.mesh.targetPools[this.defaultPool] || {};
		const targets = Object.values(targetPool.targets || {});
		if( targets.length == 0 ){
			console.log( "No targets found." )
			response.statusCode = 503
			response.end()
		} else {
			const target = targets[0];
			console.log( "Dispatching to ", targets, target )
			this.wire_proxy.upgrade( target, request, socket, head )
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
		console.log("Proxying ", target);
		this.wire.web( request, response, { target: target.url } )
	}

	upgrade( target, request, socket, head ){
		console.log("Upgrading ", target);
		this.wire.ws(request, socket, head, {target: target.url });
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

		this.certificateManager = new MemoryCertificateManager();
		this.targetPools = {};
	}

	/**
	 * Boots up the default ingress listener and attaches a handler for hearing control messages
	 */
	start( port ) {
		let controller = new ExpressControlInterface( this )
		this.controlInterface = controller;
		return controller.start( port )
	}

	stop(){
		this.controlInterface.stop();
		Object.values(this.ingress_controllers).forEach((controller) => {
			controller.end();
		});
	}

	/*
	 * Establish a service to handle incoming requests
	 */
	ingress( name, port, wire_proxy_name ) {
		let server = new http.Server( ( request, response ) => {
			console.log("Accepted request")
			ingress.requested( request, response )
		})
		server.on("upgrade", function(request, socket, head){
			console.log("Upgrade");
			ingress.upgrade(request, socket, head);
		});
		let whenListening = http_promise_listen_url( server, 0 )

		let wire_factory = this.wire_proxy_factories[ wire_proxy_name || "hand" ]
		if( !wire_factory ){ throw new Error( "No such wire proxy registered: " + wire_proxy_name ); }

		let wire_proxy = wire_factory.produce( {} )
		const ingress = new DeltaIngress( whenListening, this, wire_proxy, server )
		this.ingress_controllers[ name ] = ingress
		return ingress
	}

	async secureIngress( name, port, wire_proxy_name, certificateName ) {
		if( !certificateName ) { throw new Error("TLS requires a certificate"); }
		const socketOptions = await this.certificateManager.retrieve(certificateName)
		socketOptions.key = Buffer.from( socketOptions.key )
		socketOptions.cert = Buffer.from( socketOptions.cert )

		let server = new https.Server( socketOptions, ( request, response ) => {
			ingress.requested( request, response )
		})
		server.on("upgrade", function(request, socket, head){
			ingress.upgrade(request, socket, head);
		});
		let whenListening = http_promise_listen_url( server, port )

		let wire_factory = this.wire_proxy_factories[ wire_proxy_name || "hand" ]
		if( !wire_factory ){ throw new Error( "No such wire proxy registered: " + wire_proxy_name ); }

		let wire_proxy = wire_factory.produce( {} )
		const ingress = new DeltaIngress( whenListening, this, wire_proxy, server )
		this.ingress_controllers[ name ] = ingress
		return ingress
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

exports.Delta = Delta
exports.DeltaClient = DeltaClient
exports.promise_get_request = promise_get_request
exports.promise_post_json_request = promise_post_json_request

