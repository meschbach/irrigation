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
	requested( request, response ){
		const monitor = this.mesh.metrics.measure("request");
		//TODO: This structure can be improved for performance
		const targetPoolName = runRules( this.targetPoolRules, this.defaultPool, request );
		this.logger.debug("Target pool name: ", targetPoolName);

		const targetPool = this.mesh.targetPools[targetPoolName] || {};
		this.logger.debug("Pool: ", targetPool);
		const targets = targetPool.targets || {};

		if( targets.length == 0 ){
			this.logger.warn( "No targets found.", {targetPoolName} );
			response.statusCode = 503;
			response.setHeader("Content-Type","text/plain");
			response.end("No targets found.");
			monitor.done();
		} else {
			const lb = targetPool.loadBalancer;
			if( !lb || lb.isEmpty) {
				response.statusCode = 503;
				response.end("No targets in the pool " + targetPoolName);
				monitor.done();
				return;
			}

			const targetName = targetPool.loadBalancer.next();
			const target = targets[targetName];
			assert(target);
			monitor.done();
			this.wire_proxy.proxy( target, request, response )
		}
	}

	upgrade( request, socket, head ){
		const monitor = this.mesh.metrics.measure("upgrade");
		//TODO: This structure can be improved for performance
		const targetPool = this.mesh.targetPools[this.defaultPool] || {};
		const targets = Object.values(targetPool.targets || {});
		if( targets.length == 0 ){
			const method = request.method;
			const uri = request.url;
			const host = request.headers["host"];
			this.logger.warn( "No targets found in pool",  {targetPool: this.defaultPool, method, uri, host });
			monitor.done();
			socket.end();
		} else {
			const target = targets[0];
			this.logger.debug( "Dispatching to ", {targets, target} );
			monitor.done();
			this.wire_proxy.upgrade( target, request, socket, head )
		}
	}
}

module.exports = {
	DeltaIngress
};
