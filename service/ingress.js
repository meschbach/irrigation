const assert = require("assert");
const {runRules} = require("./rules");

/*
 * Responsible for delegating a proxy request the correct proxy handler
 */
class DeltaIngress {
	/*
	 * @param mesh locates the best target to utilize
	 */
	constructor( logger, listening, mesh, wire_proxy, serverSocket ){
		assert(logger);
		assert( listening );
		assert( mesh );
		assert( serverSocket );

		this.logger = logger;

		this.listening = listening;
		this.targets = [];
		this.mesh = mesh;
		this.wire_proxy = wire_proxy;
		this.serverSocket = serverSocket;

		this.rules = []; // Uncompiled version of the rules
		this.targetPoolRules = []; //Compiled version of the rules
		this.defaultPool = "default";
	}

	useDefaultPool( named ){
		this.defaultPool = named;
	}

	end(){
		this.serverSocket.close();
	}

	//TODO: Requested and upgrade shouldn't duplicate code
	requested( request, response, requestContext ){
		//TODO: This structure can be improved for performance
		const targetPoolName = runRules( this.targetPoolRules, this.defaultPool, request );
		requestContext.opentracing.span.log({
			event:"routing rules evaluated",
			defaultPool: this.defaultPool,
			ruleCount: this.targetPoolRules.length,
			host: request.headers.host,
			url: request.uri
		});
		requestContext.opentracing.span.setTag("targetPool.name", targetPoolName);
		this.logger.debug("Target pool name: ", targetPoolName);

		const targetPool = this.mesh.targetPools[targetPoolName] || {};
		const targets = targetPool.targets || {};

		if( targets.length == 0 ){
			requestContext.opentracing.span.log({event:"No targets in pool", targetPoolName, targetPool});
			this.logger.warn( "No targets found.", {targetPoolName} );
			response.statusCode = 503;
			response.setHeader("Content-Type","text/plain");
			response.end("No targets found.");
		} else {
			const lb = targetPool.loadBalancer;
			if( !lb || lb.isEmpty) {
				requestContext.opentracing.span.log({event:"Missing load balancer data structure"});
				response.statusCode = 503;
				response.end("No targets in the pool " + targetPoolName);
				return;
			}

			const targetName = targetPool.loadBalancer.next();
			const target = targets[targetName];
			requestContext.opentracing.span.log({event:"Dispatching to target", targetName});
			this.wire_proxy.proxy( target, request, response, requestContext )
		}
	}

	upgrade( request, socket, head ){
		//TODO Instrument
		//TODO: This structure can be improved for performance
		const targetPool = this.mesh.targetPools[this.defaultPool] || {};
		const targets = Object.values(targetPool.targets || {});
		if( targets.length == 0 ){
			const method = request.method;
			const uri = request.url;
			const host = request.headers["host"];
			this.logger.warn( "No targets found in pool",  {targetPool: this.defaultPool, method, uri, host });
			socket.end();
		} else {
			const target = targets[0];
			this.logger.debug( "Dispatching to ", {targets, target} );
			this.wire_proxy.upgrade( target, request, socket, head )
		}
	}
}

module.exports = {
	DeltaIngress
};
