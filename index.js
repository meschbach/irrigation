/*
 * Delta L7 HTTP Proxy
 */
const http = require( 'http' );
const https = require( 'https' );

// Internal dependencies
const {parallel} = require("junk-bucket/future");

const DeltaClient = require( './client' );
const promise_post_json_request = require( './promise-requests' ).post_json;
const promise_get_request = require("./promise-requests").get_request;
const {ExpressControlInterface} = require( './control-http' );
const { MemoryCertificateManager } = require( './certificate-manager' );

const {DeltaIngress} = require("./service/ingress");

const {addressOnListen} = require("junk-bucket/sockets");
const {FORMAT_HTTP_HEADERS} = require("opentracing");

async function http_promise_listen_url( service, port, logger, protocol = "http" ){
	assert(service);
	const bindHost = '0.0.0.0';
	try {
		const listener = addressOnListen(service, port, bindHost);
		const rawAddress = await listener.address;
		let host = rawAddress.host;
		if( host == bindHost ){
			const ifaces = require("os").networkInterfaces();
			const names = Object.keys(ifaces);
			const randomIface = ifaces[names[0]];
			const address = randomIface[0].address;
			logger.trace("Binding host is all, replying with loopback");
			host = address;
		}
		const url = protocol + "://" + host + ":" + rawAddress.port;
		logger.info("Listening on ", url);
		return url;
	}catch(e){
		throw new Error("Failed to bind to " + bindHost + ":" + port + " because " + e.message );
	}
}

const assert = require("assert");
const {HandRolledProxierProducer} = require("./service/proxy-hand-rolled");
const {NHPFactory} = require("./service/proxy-nph");
const {traceRoot} = require("junk-bucket/opentracing");
const {traceError} = require("./junk");

/*
 * Top level proxy system state manager
 */
class Delta {
	constructor( logger, context ) {
		assert(logger);
		assert(context);
		assert(context.cleanup);

		this.logger = logger;
		this.context = context;

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

		const controlLogger = this.logger.child({component: "http-api", port, iface});
		let controller = new ExpressControlInterface( this, controlLogger , this.context.tracer );
		this.controlInterface = controller;
		return controller.start( port, iface )
	}

	stop(){
		this.logger.info( "Shutting down");

		this.controlInterface.stop();
		Object.values(this.ingress_controllers).forEach((controller) => {
			controller.end();
		});
		this.context.cleanup();
	}

	/*
	 * Establish a service to handle incoming requests
	 */
	ingress( name, port, wire_proxy_name ) {
		const traceName = "ingress:"+name;
		let server = new http.Server( ( request, response ) => {
			const requestContext = this.context.subcontext(name);
			traceRoot(requestContext,traceName);
			requestContext.opentracing.tracer.inject(requestContext.opentracing.span,FORMAT_HTTP_HEADERS, request.headers);
			response.on("close", () => {
				requestContext.opentracing.span.log({event: "response.close"});
				requestContext.cleanup()
			});
			response.on("finish", () => {
				requestContext.opentracing.span.log({event: "response.finish"});
			});
			try {
				ingress.requested(request, response, requestContext)
			} catch(e) {
				traceError(requestContext, err);

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
		let whenListening = http_promise_listen_url( server, port, this.logger.child({promise: "ingress-url"}) );

		let wire_factory = this.wire_proxy_factories[ wire_proxy_name || "hand" ];
		if( !wire_factory ){ throw new Error( "No such wire proxy registered: " + wire_proxy_name ); }

		let wire_proxy = wire_factory.produce( {} );
		const ingress = new DeltaIngress( this.logger.child({ingress: name, port: port}), whenListening, this, wire_proxy, server );
		this.ingress_controllers[ name ] = ingress;
		return ingress
	}

	async secureIngress( name, port, wire_proxy_name, certificateName ) {
		const traceName = "secure-ingress:"+name;

		if( !certificateName ) { throw new Error("TLS requires a certificate"); }
		const socketOptions = await this.certificateManager.retrieve(certificateName);
		if( !socketOptions ){
			throw new Error("Certificate context is missing for " + certificateName);
		}
		const options = {
			key: socketOptions.key,
			cert: socketOptions.cert,
			SNICallback: (servername, cb) => {
				const ctx = server.sni[servername];
				this.logger.debug("TLS SNI request", {name,port,servername,cert: (ctx||{}).cert});
				cb(null,ctx);
			}
		};

		const server = new https.createServer( options, ( request, response ) => {
			const requestContext = this.context.subcontext(name);
			traceRoot(requestContext,traceName);
			requestContext.opentracing.tracer.inject(requestContext.opentracing.span,FORMAT_HTTP_HEADERS, request.headers);
			response.on("close", () => {
				requestContext.opentracing.span.log({event: "response.close"});
				requestContext.cleanup()
			});
			response.on("finish", () => {
				requestContext.opentracing.span.log({event: "response.finish"});
			});

			try {
				ingress.requested(request, response, requestContext);
			} catch(e) {
				traceError(requestContext, err);

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

module.exports = {
	Delta,
	DeltaClient,
	promise_get_request,
	promise_post_json_request
};
