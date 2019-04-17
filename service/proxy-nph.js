
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
		const proxy = this.nhp.createProxyServer( {
			xfwd: true
		} );
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

module.exports = {
	NHPFactory
};
