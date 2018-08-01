/*
 * Irragation L7 Proxy System
 *
 * Express HTTP Control Interface
 */

//External depedencies
let bodyParser = require('body-parser');
let express = require( 'express' )
let morgan = require( 'morgan' )
let url = require( 'url' )

// Internal dependencies
const Future = require("junk-bucket/future");
const {make_async} = require("junk-bucket/express");
let express_extensions = require( './express-extensions' )

const jwt = require("jsonwebtoken");

/*
 * Control Plane
 */
class ExpressControlInterface {
	constructor( delta ) {
		this.delta = delta
		this.authorizeRequests = undefined;
	}

	is_running(){ return this.http_service != undefined }

	start( port, address = "localhost" ) {
		port = port || 0
		if( this.is_running() ) { return this.start_promise; }

		let service = make_async( express() )
		service.use( morgan( 'short' ) )
		service.use( (req,resp, next ) => {
			if( this.authorizeRequests ){
				this.authorizeRequests(req,resp,next);
			}else {
				next();
			}
		});
		service.use( bodyParser.json() )

		service.a_get( '/v1/ingress', async ( req, resp ) => {
			let ingress_points = await this.delta.list_ingress();
			resp.json({ ingress: ingress_points })
		})

		service.a_post( '/v1/ingress', async ( req, resp ) => {
			// Validate message
			let port = req.body.port || 0
			let wire_proxy = req.body.wire_proxy || "hand"
			let wait = req.body.wait || true
			let name = req.body.name || "default"
			const scheme = req.body.scheme || "http";
			const certificateName = req.body.certificateName;

			if( port == 0 && !wait ){
				resp.statusCode = 422
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
			console.log("Validated request; looks reasonable")

			// Perform opertaion
			let ingress;
			if( scheme == "https") {
				console.log("Certificate name ", certificateName);
				ingress = this.delta.secureIngress( name, port, wire_proxy, certificateName )
			} else {
				ingress = this.delta.ingress( name, port, wire_proxy )
			}
			let completion = wait ? ingress.listening : Promise.resolve( port )
			const boundPort = await completion;

			console.log( "Bound port: ", boundPort )
			resp.statusCode = 201
			//let scheme = req.get( "scheme" )
			resp.json( { _self: scheme + "://" + req.get("host") + "/v1/ingress/" + name } )
		})

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
		} )

		//TODO: Deprecated in 0.3 series
		service.a_post( '/v1/ingress/:name', ( req, resp ) => {
			let ingress_name = req.params.name
			let targets = req.body.add_targets

			console.log( "delta-d: Requested to use ", targets, " with ", ingress_name )

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
				console.log( "delta-d: Registering ", target, " with ", ingress_name )
				ingress.target( target )
			})

			resp.statusCode = 200
			resp.json( { status: "ok" })
		})

		service.a_post( '/v1/ingress/:name/default-pool', ( req, resp ) => {
			let ingress_name = req.params.name
			let defaultPool = req.body.defaultPool

			console.log( "delta-d: Requested to use pool ", defaultPool, " with ", ingress_name )

			if( !defaultPool ) {
				resp.statusCode = 422;
				return resp.json( { errors: { targets: ["missing"] } } );
			}

			let ingress = this.delta.find_ingress( ingress_name )
			if( !ingress ){
				resp.statusCode = 404;
				return resp.end()
			}

			ingress.useDefaultPool( defaultPool );

			resp.statusCode = 200
			resp.json( { status: "ok" })
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
			if( !rules || !rules.length ){
				resp.statusCode = 422;
				resp.json({ok:false, errors: {rules: ["missing array"]}});
			}

			const targetPoolRules = rules.map( (rule) => {
				switch(rule.type) {
					case "path.prefix":
						return ( defaultTarget, req ) => {
							const path = req.url;
							return path.startsWith(rule.is) ? rule.target : defaultTarget;
						}
					case "header.host":
						return ( defaultTarget, req ) => {
							return req.headers["host"] == req.host ? rule.target : defaultTarget;
						}
					case "host.path-prefix":
						return (defaultTarget, req ) => {
							const host = req.headers["host"];
							const path = req.url;
							return ( host == rule.host && path.startsWith(rule.prefix) ) ? rule.target : defaultTarget;
						}
					default:
						//TODO: This should behandled in validation
						throw new Error("unsupported rule " + rule.type);
				}
			});
			ingress.rules = rules;
			ingress.targetPoolRules = targetPoolRules;
			resp.json({ok: true});
		} );


		service.get( "/v1/status", ( req, resp ) => {
			resp.json( { ok: true } )
		})

		service.a_get( "/v1/certificate", async ( req, resp ) => {
			const names = await this.delta.certificateManager.names();
			resp.json( { ok: true, names } )
		})

		service.a_put( "/v1/certificate/:name", async (req, resp) => {
			const name = req.params.name;

			const cert = req.body.cert;
			const key = req.body.key;

			await this.delta.certificateManager.store( name, cert, key )
			resp.json( {ok: true } )
		});

		/*********************************************
		 * Target Pool API
		 *********************************************/
		service.a_put( '/v1/target-pool/:name', ( req, resp ) => {
			const name = req.params.name;

			const pools = this.delta.targetPools;
			const pool = pools[name];
			if( pool ) {
				return resp.sendStatus(409, "Already exists");
			}

			console.log("Creating target pool: ", name);
			pools[name] = { targets: [] };
			resp.json({ ok: true })
		});

		service.a_get( '/v1/target-pool/:name', ( req, resp ) => {
			const name = req.params.name;

			const pools = this.delta.targetPools;
			const pool = pools[name];
			if( !pool ) {
				return resp.sendStatus(404);
			}

			resp.json({ ok: true, targetPool: pool })
		});

		service.a_put( '/v1/target-pool/:pool/target/:name', ( req, resp ) => {
			const poolName = req.params.pool;
			const targetName = req.params.name;

			const url = req.body.url;
			if( !url ){
				return resp.sendStatus(422);
			}

			const pools = this.delta.targetPools;
			const pool = pools[poolName];
			if( !pool ) {
				console.log("No such pool");
				return resp.sendStatus(404);
			}

			if( pool[targetName] ){
				return resp.sendStatus(409);
			}
			pool.targets[targetName] = {
				url: url,
				inService: true
			}
			console.log("Registering ", targetName, " in ", poolName, " to URL ", url);

			resp.json({ ok: true, targetPool: pool })
		});

		service.a_get( '/v1/target-pool/:pool/target/:name', ( req, resp ) => {
			const poolName = req.params.pool;
			const targetName = req.params.name;

			const pools = this.delta.targetPools;
			const pool = pools[poolName];
			if( !pool ) {
				console.log("No Such pool", poolName, pools);
				return resp.sendStatus(404);
			}

			if( !pool.targets[targetName] ){
				console.log("No such target pool", poolName, targetName, pool);
				return resp.sendStatus(404);
			}
			resp.json({ ok: true, target: pool.targets[targetName] })
		});

		/*********************************************
		 * Security controls
		 *********************************************/
		service.a_get("/v1/security", (req, resp) => {
			resp.json({party: !this.authorizeRequests });
		});

		service.a_put("/v1/jwt", (req, resp) => {
			console.log("Installing JWT key");
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
		this.http_service = service

		const bind = new Future();
		let listener = service.listen( port, address, () => {
			const addr = listener.address();
			let url = "http://" + addr.address + ":" + addr.port
			console.log( "URL", url );
			bind.accept( url );
		})
		this.http_socket = listener;

		this.start_promise = bind.promised;
		return this.start_promise
	}

	stop() {
		if (this.http_socket) {
			console.info("Cleaning up HTTP socket");
			this.http_socket.close()
			this.http_socket = undefined
		} else {
			console.warn("Not bound, may leak");
		}
		this.http_service = undefined
		this.start_promise = undefined
	}
}

exports.ExpressControlInterface = ExpressControlInterface

