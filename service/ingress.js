const assert = require("assert");
/*
 * Responsible for delegating a proxy request the correct proxy handler
 */
class DeltaIngress {
	/*
	 * @param mesh locates the best target to utilize
	 */
	constructor( logger, listening, mesh, wire_proxy, serverSocket ){
		this.logger = logger;

		if( !listening ){ throw new Error("listening required") }
		if( !mesh ){ throw new Error("mesh required") }
		this.listening = listening
		this.targets = []
		this.mesh = mesh
		this.wire_proxy = wire_proxy
		this.serverSocket = serverSocket;

		this.rules = []; // Uncompiled version of the rules
		this.targetPoolRules = []; //Compiled version of the rules
	}

	useDefaultPool( named ){
		this.defaultPool = named;
	}

	end(){
		this.serverSocket.close();
	}

	//TODO: Requested and upgrade shouldn't duplicate code
	requested( request, response ){
		//TODO: This structure can be improved for performance
		const targetPoolName = this.targetPoolRules.reduce( (pool, f) => {
			return f(pool, request)
		}, this.defaultPool);

		// this.logger.debug("Resolve target pool too: ", targetPoolName);
		const targetPool = this.mesh.targetPools[targetPoolName] || {};
		// this.logger.debug("Pool: ", this.mesh.targetPools);
		const targets = targetPool.targets || {};

		if( targets.length == 0 ){
			this.logger.warn( "No targets found.", {targetPoolName} );
			response.statusCode = 503;
			response.end()
		} else {
			const targetName = targetPool.loadBalancer.next();
			this.logger.debug( "Dispatching to name", targetName);
			const target = targets[targetName];
			assert(target);
			// this.logger.debug( "Dispatching to ", targets, target );
			this.wire_proxy.proxy( target, request, response )
		}
	}

	upgrade( request, socket, head ){
		//TODO: This structure can be improved for performance
		const targetPool = this.mesh.targetPools[this.defaultPool] || {};
		const targets = Object.values(targetPool.targets || {});
		if( targets.length == 0 ){
			this.logger.warn( "No targets found in pool",  {targetPool: this.defaultPool })
			response.statusCode = 503
			response.end()
		} else {
			const target = targets[0];
			this.logger.debug( "Dispatching to ", {targets, target} )
			this.wire_proxy.upgrade( target, request, socket, head )
		}
	}
}

module.exports = {
	DeltaIngress
};
