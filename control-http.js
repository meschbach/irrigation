/*
 * Irragation L7 Proxy System
 *
 * Express HTTP Control Interface
 */

const assert = require("assert");
const tls = require("tls");

//External depedencies
let bodyParser = require('body-parser');
let express = require( 'express' );
let morgan = require( 'morgan' );
const expressOpenTracing = require("express-opentracing").default;

// Internal dependencies
const Future = require("junk-bucket/future");
const {make_async} = require("junk-bucket/express");

const jwt = require("jsonwebtoken");

const {RoundRobinScheduler} = require("./service/round-robin");
const {compileRules} = require("./service/rules");

/*
 * Control Plane
 */
class ExpressControlInterface {
	constructor( delta, logger, tracer ) {
		this.logger = logger;

		this.delta = delta;
		this.tracer = tracer;
		this.authorizeRequests = undefined;
	}

	is_running(){ return this.http_service != undefined }

	start( port, address = "localhost" ) {
		port = port || 0;
		if( this.is_running() ) { return this.start_promise; }

		let service = make_async( express() );
		service.use( expressOpenTracing({tracer: this.tracer}) );
		service.use( morgan( 'short', {
			stream: {write: (msg) => {
				this.logger.info(msg.trim());
			} }
		} ) );
		service.use( (req,resp, next ) => {
			if( this.authorizeRequests ){
				this.authorizeRequests(req,resp,next);
			}else {
				next();
			}
		});
		service.use( bodyParser.json() );

		service.a_get( '/v1/ingress', async ( req, resp ) => {
			let ingress_points = await this.delta.list_ingress();
			resp.json({ ingress: ingress_points })
		})

		service.a_post( '/v1/ingress', async ( req, resp ) => {
			// Validate message
			const body = req.body;
			let port = body.port || 0;
			let wire_proxy = body.wire_proxy || "hand";
			let wait = body.wait || true;
			let name = body.name || "default";
			const scheme = body.scheme || "http";
			const certificateName = body.certificateName;

			if( port == 0 && !wait ){
				resp.statusCode = 422;
				return resp.json( { errors: ["Must wait on unspecified ports"] } )
			}
			if( !["http", "https"].includes(scheme) ){
				resp.statusCode = 422;
				return resp.json( { errors: {scheme: ["must be either http or https"]}} );
			}
			if( scheme == "https" && !certificateName ) {
				resp.statusCode = 422;
				return resp.json( { errors: {certificateName: ["Must be defined"]}} );
			}

			if( this.delta.ingress_controllers[name] ){
				resp.statusCode = 409;
				return resp.json( { errors: ["Ingress by that name already exists"] } );
			}
			this.logger.info("Validated request; looks reasonable",{wait});

			// Perform operation
			try {
				let ingress;
				this.logger.info("Creating ingress with target scheme ", {scheme, body: req.body});
				if (scheme == "https") {
					this.logger.info("Certificate name ", certificateName);
					ingress = await this.delta.secureIngress(name, port, wire_proxy, certificateName)
				} else {
					ingress = await this.delta.ingress(name, port, wire_proxy)
				}
				let completion = wait ? ingress.listening : Promise.resolve(port);
				const boundPort = await completion;

				resp.statusCode = 201;
				//let scheme = req.get( "scheme" )
				resp.json({_self: "http://" + req.get("host") + "/v1/ingress/" + name})
			}catch(problem){
				this.logger.error("Failed to bind to port", problem);
				resp.statusCode = 409;
				resp.json({ok:false, problem: problem.message});
			}
		});

		service.get( '/v1/ingress/:name', ( req, resp ) => {
			let name = req.params.name
			let ingress = this.delta.find_ingress( name )
			if( !ingress ){
				resp.statusCode = 404;
				return resp.end();
			}

			ingress.listening.then( (address) => {
				resp.statusCode = 200
				resp.json({ address: address, rules: ingress.rules })
			});
		} );

		service.delete( '/v1/ingress/:name', ( req, resp ) => {
			let name = req.params.name;
			let result = this.delta.deleteIngress(name);
			if( !result ){
				resp.statusCode = 404;
				resp.end();
			} else {
				resp.statusCode = 204;
				resp.end();
			}
		} );

		//TODO: Deprecated in 0.3 series
		service.a_post( '/v1/ingress/:name', ( req, resp ) => {
			let ingress_name = req.params.name
			let targets = req.body.add_targets

			this.logger.info( "delta-d: Requested to use ", targets, " with ", ingress_name )

			if( !targets ) {
				resp.statusCode = 422;
				return resp.json( { errors: { targets: ["missing"] } } );
			}

			let ingress = this.delta.find_ingress( ingress_name )
			if( !ingress ){
				resp.statusCode = 404;
				return resp.end()
			}

			targets.forEach( ( target ) => {
				this.logger.info( "delta-d: Registering ", target, " with ", ingress_name )
				ingress.target( target )
			})

			resp.statusCode = 200
			resp.json( { status: "ok" })
		})

		service.a_post( '/v1/ingress/:name/default-pool', ( req, resp ) => {
			let ingress_name = req.params.name
			let defaultPool = req.body.defaultPool

			this.logger.info( "delta-d: Requested to use pool ", defaultPool, " with ", ingress_name )

			if( !defaultPool ) {
				resp.statusCode = 422;
				return resp.json( { errors: { targets: ["missing"] } } );
			}

			let ingress = this.delta.find_ingress( ingress_name );
			if( !ingress ){
				resp.statusCode = 404;
				return resp.end()
			}

			ingress.useDefaultPool( defaultPool );

			resp.statusCode = 200;
			resp.json( { status: "ok" })
		});

		/*********************************************
		 * Certificate contexts
		 *********************************************/
		service.a_put( '/v1/ingress/:name/sni/:sni', async ( req, resp ) => {
			const ingressName = req.params.name;
			const serverName = req.params.sni;
			const certificateName = req.body.certificateName;

			const asymmetricKey = await this.delta.certificateManager.retrieve(certificateName);
			if( !asymmetricKey ){
				resp.status(422);
				return resp.json({
					errors: {certificateName: ["No such certificate " + certificateName] }
				});
			}

			const cert = asymmetricKey.cert;
			const key = asymmetricKey.key;
			assert(cert);
			assert(key);
			const tlsContext = tls.createSecureContext({
				cert, key, ca: cert
			});

			const ingress = this.delta.find_ingress(ingressName);
			if( !ingress.secure ){
				resp.status(422);
				return resp.json({
					errors: {socket: ["not a TLS socket"]}
				})
			}

			//ingress.serverSocket.addContext( serverName, tlsContext );
			ingress.serverSocket.sni[ serverName ] = tlsContext;
			resp.status(200);
			resp.json({ok: true});
		})

		/*********************************************
		 * Rules API
		 *********************************************/
		service.a_put( '/v1/ingress/:name/routing', ( req, resp ) => {
			const ingress_name = req.params.name;

			let ingress = this.delta.find_ingress( ingress_name )
			if( !ingress ){
				resp.statusCode = 404;
				return resp.end()
			}

			// Verify rules exist
			const rules = req.body.rules;
			if( !rules || !Number.isInteger(rules.length) ){
				resp.statusCode = 422;
				resp.json({ok:false, errors: {rules: ["missing array"]}});
			}

			const targetPoolRules = compileRules(rules);
			ingress.rules = rules;
			ingress.targetPoolRules = targetPoolRules;
			resp.json({ok: true});
		} );


		service.get( "/v1/status", ( req, resp ) => {
			resp.json( { ok: true } )
		});

		service.a_get( "/v1/certificate", async ( req, resp ) => {
			const names = await this.delta.certificateManager.names();
			resp.json( { ok: true, names } )
		});

		service.a_put( "/v1/certificate/:name", async (req, resp) => {
			const name = req.params.name;

			const cert = req.body.cert;
			const key = req.body.key;
			const ca = req.body.authority;

			if( !cert ){
				resp.status(422);
				return resp.json({
					errors: {
						cert: ["required"]
					}
				});
			}
			if( !key ){
				resp.status(422);
				return resp.json({
					errors: {
						key: ["required"]
					}
				});
			}
			try {
				const tlsContext = tls.createSecureContext({
					cert, key, ca: ca
				});

				await this.delta.certificateManager.store( name, cert, key, ca );
				resp.json( {ok: true } )
			}catch(e){
				this.logger.warn("Unable to creates security context because of error", e);
				resp.status(400);
				return resp.json({
					errors: {
						cert: ["Unable to load security context because " + e.message ]
					}
				});
			}
		});

		/*********************************************
		 * Target Pool API
		 *********************************************/
		service.a_get( '/v1/target-pool', ( req, resp ) => {
			const name = req.params.name;

			const pools = this.delta.targetPools;
			const names = Object.keys(pools);

			resp.json({ ok: true, names: names })
		});

		service.a_put( '/v1/target-pool/:name', ( req, resp ) => {
			const name = req.params.name;
			if( name.length === 0 ){
				return resp.sendStatus(422, "Name must be a string");
			}

			const pools = this.delta.targetPools;
			const pool = pools[name];
			if( pool ) {
				return resp.sendStatus(409, "Already exists");
			}

			pools[name] = { targets: {}, loadBalancer: new RoundRobinScheduler() };
			resp.json({ ok: true })
		});

		service.a_get( '/v1/target-pool/:name', ( req, resp ) => {
			const name = req.params.name;

			const pools = this.delta.targetPools;
			const pool = pools[name];
			if( !pool ) {
				return resp.sendStatus(404);
			}
			const entity = {
				ok: true,
				targetPool: pool
			};

			resp.json( entity )
		});

		service.a_put( '/v1/target-pool/:pool/target/:name', ( req, resp ) => {
			const poolName = req.params.pool;
			const targetName = req.params.name;

			const url = req.body.url;
			try {
				const parsedURL = new URL(url);
				if( !parsedURL.host ) {
					return resp.sendStatus(422, "URL host is falsy");
				}
			}catch(e){
				return resp.sendStatus(422, "URL isn't parsable: " + e.message);
			}

			const pools = this.delta.targetPools;
			const pool = pools[poolName];
			if( !pool ) {
				this.logger.info("No such pool");
				resp.statusCode = 404;
				resp.statusMessage = "No such pool '" + poolName + "'";
				return resp.end();
			}

			if( pool[targetName] ){
				return resp.sendStatus(409);
			}
			pool.targets[targetName] = {
				url: url,
				inService: true
			};
			pool.loadBalancer.addTarget(targetName);

			resp.json({ ok: true, targetPool: pool })
		});

		service.a_get( '/v1/target-pool/:pool/target/:name', ( req, resp ) => {
			const poolName = req.params.pool;
			const targetName = req.params.name;

			const pools = this.delta.targetPools;
			const pool = pools[poolName];
			if( !pool ) {
				this.logger.info("No Such pool", poolName, pools);
				return resp.sendStatus(404);
			}

			if( !pool.targets[targetName] ){
				this.logger.info("No such target pool", poolName, targetName, pool);
				return resp.sendStatus(404);
			}
			resp.json({ ok: true, target: pool.targets[targetName] })
		});

		service.a_delete( '/v1/target-pool/:pool/target/:name', ( req, resp ) => {
			const poolName = req.params.pool;
			const targetName = req.params.name;

			const pools = this.delta.targetPools;
			const pool = pools[poolName];
			if( !pool ) {
				this.logger.info("No Such pool", poolName, pools);
				return resp.sendStatus(404);
			}

			const targets = pool.targets;
			delete targets[targetName];
			pool.loadBalancer.removeTarget(targetName);
			resp.json({ ok: true, target: pool.targets[targetName] })
		});

		/*********************************************
		 * Security controls
		 *********************************************/
		service.a_get("/v1/security", (req, resp) => {
			resp.json({party: !this.authorizeRequests });
		});

		service.a_put("/v1/jwt", (req, resp) => {
			this.logger.info("Installing JWT key");
			const base64Key = req.body.symmetricSecret;
			if( !base64Key ){
				return resp.status(422).end();
			}
			const key = Buffer.from(base64Key, 'base64');

			this.authorizeRequests = (req, resp, next) => {
				const auth = req.header("Authorization");
				if( !auth ){
					resp.status(403);
					return resp.end();
				}

				const parts = auth.split(" ");
				if( parts.length != 2 || parts[0] != "Bearer" ){
					resp.status(403);
					return resp.end();
				}

				const token = parts[1];
				jwt.verify(token, key, (err, decoded) => {
					if( err ){
						resp.status(403);
						return resp.end();
					} else {
						req.user = decoded;
						next();
					}
				});
			};

			resp.status(202);
			resp.end();
		});

		/*********************************************
		 * Listen for clients
		 *********************************************/
		this.http_service = service;

		const bind = new Future();
		try {
			let listener = service.listen( port, address, () => {
				const addr = listener.address();
				let url = "http://" + addr.address + ":" + addr.port;
				this.logger.info( "URL", url);
				bind.accept( url );
			})
			this.http_socket = listener;
		} catch(e){
			bind.reject( e );
		}

		this.start_promise = bind.promised;
		return this.start_promise
	}

	stop() {
		if (this.http_socket) {
			this.logger.debug("Cleaning up HTTP socket");
			this.http_socket.close()
			this.http_socket = undefined
		} else {
			this.logger.warn("Not bound, may leak");
		}
		this.http_service = undefined
		this.start_promise = undefined
	}
}

exports.ExpressControlInterface = ExpressControlInterface

