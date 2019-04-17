const http = require( 'http' );

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
		let agent = new http.Agent({ keepAlive: false });
		const url = new URL(target.url);
		const host = url.hostname;
		const port = url.port;
		this.logger.info( "Requesting ", {target, host, port, method: request.method, resource: request.url} );
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
		});
		req.on( 'error', ( problem ) => {
			this.logger.error( "Error: ", problem )
			response.statusCode = 503;
			response.end();
		});
		request.pipe( req )
	}

	upgrade(){
		throw new Error("Upgrades not supported");
	}
}

module.exports = {
	HandRolledProxierProducer
};
