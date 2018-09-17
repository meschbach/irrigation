/*
 * Delta L7 HTTP Proxy
 */
let bodyParser = require('body-parser');
let express = require( 'express' )
let http = require( 'http' )
const https = require( 'https' );
let morgan = require( 'morgan' )
let request = require( 'request' )
let url = require( 'url' )

// Internal dependencies
const Future = require("junk-bucket/future");
const {parallel} = require("junk-bucket/future");

let DeltaClient = require( './client' )
let promise_post_json_request = require( './promise-requests' ).post_json
let {ExpressControlInterface} = require( './control-http' )
const { MemoryCertificateManager } = require( './certificate-manager' );

const {DeltaIngress} = require("./service/ingress");

function promise_get_request( url ) {
	const future = new Future();
	request( url, (err, resp, body) => {
		if( err ){ return future.reject( err ) }
		future.accept( { headers: resp, body } )
	});
	return future.promised;
}

const {addressOnListen} = require("junk-bucket/sockets");
async function http_promise_listen_url( service, port, logger, protocol = "http" ){
	assert(service);
	const bindHost = '0.0.0.0';
	try {
		const listener = addressOnListen(service, port, bindHost);
		const rawAddress = await listener.address;
		const host = rawAddress.host;
		const url = protocol + "://" + host + ":" + rawAddress.port;
		logger.info("Listening on ", url);
		return url;
	}catch(e){
		throw new Error("Failed to bind to " + bindHost + ":" + port + " because " + e.message );
	}
}

/*
 * Produces intsnaces of the hand rolled proxier
 */
class HandRolledProxierProducer {
	constructor( logger ){ this.logger = logger }

	produce( details ) {
		return  new HandRolledProxier( this.logger.child({proxy: "hand-rolled"}) )
	}
}

/*
 * Attempt to write a proxier myself.
 */
class HandRolledProxier {
	constructor( logger ){  this.logger = logger; }

	proxy( target, request, response ){
			let agent = new http.Agent({ keepAlive: false })
			const url = new URL(target.url);
			const host = url.hostname;
			const port = url.port;
			this.logger.info( "Requesting ", {target, host, port, method: request.method, resource: request.url} )
			let req = http.request({
				host: host,
				method: request.method,
				port: port,
				path: request.url,
				timeout: 30,
				headers: request.headers,
				agent: agent
			}, ( targetResp ) => {
				this.logger.debug( "Response received" )
				response.statusCode = targetResp.statusCode
				targetResp.pipe( response )
			})
			req.on( 'error', ( problem ) => {
				this.logger.error( "Error: ", problem )
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
	constructor( logger, nhp ){
		this.logger = logger;
		if( !nhp ){ throw new Error( "node-http-proxy must be defined." ); }
		this.nhp = nhp
	}

	produce( details ){
		const proxy = this.nhp.createProxyServer( {} );
		proxy.on("error", (e) => {
			this.logger.warn("Encountered error while proxying: ", e);
		});
		return new NHPWireProxy( this.logger, proxy )
	}
}

class NHPWireProxy {
	constructor( logger, proxy ){
		this.logger = logger;
		this.wire = proxy
	}

	proxy( target, request, response ){
		this.logger.debug("Proxying ", target);
		this.wire.web( request, response, { target: target.url }, (e) =>{
			this.logger.warn("Encountered error while proxying", e);
			if( !response.headersSent ){
				response.statusCode = 502;
			}
			if( !response.finished ){
				response.end();
			}
		});
	}

	upgrade( target, request, socket, head ){
		this.logger.debug("Upgrading ", target);
		this.wire.ws(request, socket, head, {target: target.url }, (e) => {
			this.logger.warn("Encountered error while proxying", e);
			socket.end();
		});
	}
}

const assert = require("assert");
/*
 * Top level proxy system state manager
 */
class Delta {
	constructor( logger ) {
		this.logger = logger;

		this.ingress_controllers = {}
		this.targets = {}

		this.wire_proxy_factories = {}
		this.wire_proxy_factories[ 'hand' ] = new HandRolledProxierProducer( this.logger )
		try {
			let httpProxy = require( 'http-proxy' )
			this.wire_proxy_factories[ 'node-http-proxy' ] = new NHPFactory( this.logger, httpProxy )
		} catch( e ) {
			logger.info( "Not registering http-proxy wire factory because not found" )
		}

		this.certificateManager = new MemoryCertificateManager();
		this.targetPools = {};
	}

	/**
	 * Boots up the default ingress listener and attaches a handler for hearing control messages
	 */
	start( port, iface ) {
		this.logger.info( "Starting new HTTP service", {port,iface} );

		let controller = new ExpressControlInterface( this, this.logger.child({component: "http-api", port, iface}))
		this.controlInterface = controller;
		return controller.start( port, iface )
	}

	stop(){
		this.logger.info( "Shutting down");

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
			try {
				ingress.requested(request, response)
			} catch(e) {
				this.logger.error("Failed to dispatch request", e);
				response.statusCode = 543;
				response.statusMessage = "Internal proxy error";
				response.end("An internal proxy error occurred so the request may not be completed.");
			}
		});
		server.on("upgrade", (request, socket, head) => {
			try {
				this.logger.debug("Upgrade");
				ingress.upgrade(request, socket, head);
			} catch(e) {
				this.logger.error("Failed to upgrade socket", e);
				socket.end();
			}
		});
		let whenListening = http_promise_listen_url( server, port, this.logger.child({promise: "ingress-url"}) )

		let wire_factory = this.wire_proxy_factories[ wire_proxy_name || "hand" ]
		if( !wire_factory ){ throw new Error( "No such wire proxy registered: " + wire_proxy_name ); }

		let wire_proxy = wire_factory.produce( {} )
		const ingress = new DeltaIngress( this.logger.child({ingress: name, port: port}), whenListening, this, wire_proxy, server )
		this.ingress_controllers[ name ] = ingress
		return ingress
	}

	async secureIngress( name, port, wire_proxy_name, certificateName ) {
		if( !certificateName ) { throw new Error("TLS requires a certificate"); }
		const socketOptions = await this.certificateManager.retrieve(certificateName);
		const options = {
			key: socketOptions.key,
			cert: socketOptions.cert,
			SNICallback: (servername, cb) => {
				const ctx = server.sni[servername];
				cb(null,ctx);
			}
		};

		const server = new https.createServer( options, ( request, response ) => {
			try {
				ingress.requested(request, response)
			} catch(e) {
				this.logger.error("Failed to dispatch request", e);
				response.statusCode = 543;
				response.statusMessage = "Internal proxy error";
				response.end("An internal proxy error occurred so the request may not be completed.");
			}
		});
		server.on("upgrade", (request, socket, head) => {
			try {
				ingress.upgrade(request, socket, head);
			} catch(e) {
				this.logger.error("Failed to upgrade socket", e);
				socket.end();
			}
		});
		server.on("tlsClientError", (e) => {
			this.logger.error("Connection issue: ", e);
		});
		server.sni = {};
		const whenListening = http_promise_listen_url( server, port, this.logger.child({promise: "ingress-url"}), "https" )

		const wire_factory = this.wire_proxy_factories[ wire_proxy_name || "hand" ]
		if( !wire_factory ){ throw new Error( "No such wire proxy registered: " + wire_proxy_name ); }

		const wire_proxy = wire_factory.produce( {} );
		const ingress = new DeltaIngress( this.logger.child({ingress: name, port: port}), whenListening, this, wire_proxy, server );
		ingress.secure = true;
		this.ingress_controllers[ name ] = ingress;
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

	async list_ingress() {
		const description = await parallel(Object.keys( this.ingress_controllers ).map( async ( name ) => {
			let ingress = this.ingress_controllers[ name ];
			let addressURL = await ingress.listening;
			let address = { name: name, address: addressURL, resolved: addressURL != undefined, rules: this.ingress.rules };
			return address
		} ))
		return description;
	}

	deleteIngress( name ){
		this.logger.info("Deleting ingress controller ", name);
		const ingress = this.ingress_controllers[ name ];
		if( !ingress ){ return false; }

		ingress.end();
		delete this.ingress_controllers[name];
		return true;
	}
}

exports.Delta = Delta
exports.DeltaClient = DeltaClient
exports.promise_get_request = promise_get_request
exports.promise_post_json_request = promise_post_json_request

