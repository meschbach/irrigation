/*
 * Irragation L7 Proxy System
 *
 * Client Interface
 */

// Internal dependencies
let promise_requests = require( './promise-requests' );
const rp = require("request-promise-native");

const assert = require("assert");

//Junk bucket
const {defaultNullLogger} = require("junk-bucket/logging");

class DeltaClient {
	constructor( controlURL, logger = defaultNullLogger ) {
		this.url = controlURL;
		this.authHeader = undefined;
		this.logger = logger;
	}

	async _post_json( uri, body ) {
		const req = {
			method: "POST",
			url: this.url + uri,
			json: body
		};
		if( this.authHeader ){
			req["Authorization"] = this.authHeader;
		}
		return await rp(req);
	}

	useBearerToken( token ){
		this.authHeader = "Bearer " + token;
	}

	async describeIngress( name ) {
		return new DeltaIngressResource(this.url + "/v1/ingress/"+name, this.logger.child({ingress: name}));
	}

	async listIngressNames(){
		const response = await this.ingress_all();
		return response.ingress.map( i => i.name );
	}

	async _createIngress( requestBody, name ){
		try {
			const result = await this._post_json("/v1/ingress", requestBody);
			return new DeltaIngressResource(result._self, this.logger.child({ingress: name}));
		}catch(problem){
			if( problem.response ){
				const statusCode = problem.response.statusCode;
				if(statusCode == 409){
					throw new Error( problem.response.body.problem );
				} else {
					throw new Error( "Unexpected response code " + problem );
				}
			} else {
				throw problem;
			}
		}
	}

	async ingress( name = "default", port = 0, wire_proxy_name = "hand" ) {
		if( !Number.isInteger( port ) ) { throw new Error( "Expected port to be a number, got: " + port ) }
		if( port < 0 || 65535 < port ){ throw new Error("Port number is invalid: ", port ) }

		const requestBody = {
			name: name,
			port: port,
			wire_proxy: wire_proxy_name,
			wait: true
		};
		return await this._createIngress(requestBody, name );
	}

	async secureIngress( name = "default", port = 0, wire_proxy_name = "hand", certificateName ) {
		if( !Number.isInteger( port ) ) { throw new Error( "Expected port to be a number, got: " + port ) }
		if( port < 0 || 65535 < port ){ throw new Error("Port number is invalid: ", port ) }
		assert(certificateName);


		const requestBody = {
			name: name,
			port: port,
			wire_proxy: wire_proxy_name,
			wait: true,
			certificateName: certificateName,
			scheme: "https"
		};
		return await this._createIngress(requestBody, name);
	}

	async deleteIngress( name ) {
		const req = {
			method: "DELETE",
			url: this.url + "/v1/ingress/" + name
		};
		if( this.authHeader ){
			req["Authorization"] = this.authHeader;
		}

		return await rp( req );
	}

	ingress_all() { return promise_requests.get_json( this.url + "/v1/ingress", 200, this.authHeader  ) }

	status() {
		return promise_requests.get_json( this.url + "/v1/status", 200, this.authHeader  )
	}

	listCertificates() {
		return promise_requests.get_json( this.url + "/v1/certificate", 200, this.authHeader );
	}

	async uploadCertificate( name, cert, key ){
		assert(name);
		assert(cert);
		assert(key);
		const result = await promise_requests.put_json( this.url + "/v1/certificate/" + name, {
			cert: cert,
			key: key
		}, this.authHeader );
		if( result.headers.statusCode != 200 ){
			throw new Error("Error: (" + result.headers.statusCode + "): " + JSON.stringify(result.body));
		}
		return result.body;
	}

	/*******
	 * Target Pools
	 ********/
	async listTargetPools(){
		const result = await promise_requests.get_json( this.url + "/v1/target-pool", 200, this.authHeader  );
		return result;
	}

	async createTargetPool( name ){
        if( !name ){
            throw new Error("Pool name is required");
        }
		const result = await promise_requests.put_json( this.url + "/v1/target-pool/" + name, {}, 200, this.authHeader );
		return result.body;
	}

	async describeTargetPool( name ){
		if( !name ){
			throw new Error("Pool name is required");
		}
		const result = await promise_requests.get_json( this.url + "/v1/target-pool/" + name, 200, this.authHeader  );
		return result;
	}

	async registerTarget( inPool, name, url ) {
		assert(inPool);
		assert(name);
		assert(url);

		const result = await promise_requests.put_json( this.url + "/v1/target-pool/" + inPool + "/target/" + name, {url: url}, this.authHeader);
		const statusCode = result.headers.statusCode;
		if( !(200 <= statusCode && statusCode < 300) ){
			const statusMessage = result.headers.statusMessage;
			this.logger.error("Registering target resulted in error: ", {statusCode, statusMessage });
			throw new Error("Unexpected status: " + statusCode + " - " + statusMessage);
		}
		return result.body;
	}

	async describeTarget( inPool, name ){
		if( !inPool ){
			throw new Error("Pool name is required");
		}
		const result = await promise_requests.get_json( this.url + "/v1/target-pool/" + inPool + "/target/" + name, 200, this.authHeader);
		return result;
	}

	async removeTarget( inPool, name ){
		assert(inPool);
		const req = {
			method: "DELETE",
			url: this.url + "/v1/target-pool/" +inPool+ "/target/" + name
		}

		if( this.authHeader ){
			req["Authorization"] = this.authHeader;
		}
		return await rp(req);
	}

	/*******
	 * Party Mode
	 ********/
	async securityMode(){
		const result = await promise_requests.get_json( this.url + "/v1/security", 200, this.authHeader);
		return result;
	}

	async installJWT( symmetricSecret ){
		const result = await promise_requests.put_json( this.url + "/v1/jwt", { symmetricSecret: symmetricSecret.toString("base64") }, this.authHeader);
		return result;
	}
}

class DeltaIngressResource {
	constructor( url, logger ) {
		assert(url);
		assert(logger);
		this.url = url
		this.loaded = false

		this.logger = logger;
	}

	clear_cache() {
		this.loaded = false
		this.retrival = undefined
		this.cache = undefined
	}

	async refresh() {
		this.logger.info("Refreshing", this.url);
		this.clear_cache()
		this.retrieval = promise_requests.get_json( this.url );
		this.cache = await this.retrieval;
		this.logger.info("Completed refresh", this.url);
		this.loaded = true;
		return this.cache;
	}

	async ensureFresh(){
		if( !this.loaded ){
			await this.refresh();
		}
	}

	/**
	 * @deprecated
	 * @param name
	 * @returns {*|PromiseLike<DeltaIngressResource>|Promise<DeltaIngressResource>}
	 */
	addTarget( name ) {
		return promise_requests.post_json( this.url, { add_targets: [ name ] } )
			.then( ( result ) => {
				this.clear_cache()
				if( result.headers.statusCode != 200 ){ throw new Error( result.headers.statusCode + " != 200" ) }
				return this
			})
	}

	useDefaultPool( name ){
		return promise_requests.post_json( this.url + "/default-pool", { defaultPool:  name } )
			.then( ( result ) => {
				this.clear_cache()
				if( result.headers.statusCode != 200 ){ throw new Error( result.headers.statusCode + " != 200" ) }
				return this
			})
	}

	async describeRules( ){
		await this.ensureFresh();
		return this.cache.rules;
	}

	applyRules( rules ){
		return promise_requests.put_json( this.url + "/routing", { rules } )
			.then( ( result ) => {
				this.clear_cache()
				if( result.headers.statusCode != 200 ){ throw new Error( result.headers.statusCode + " != 200" ) }
				return this
			})
	}

	/*
	 * returns a promise for the address once resolved
	 */
	async address() {
		if( !this.retrieval ) { await this.refresh() }
		return this.cache.address;
	}

	async attachSNI( serverName, certificateName ){
		assert(serverName);
		assert(certificateName);

		const targetURL = this.url + "/sni/" + serverName;
		const req = {
			method: "PUT",
			url: targetURL,
			body: { certificateName },
			json: true
		};
		try {
			const response = await rp(req);
			return response;
		}catch(e){
			const statusCode = e.statusCode;
			if( statusCode == 404 ){
				throw new Error("Ingress " + this.url + " does not exist");
			} else if( statusCode == 422 ){
				throw new Error("Unable to process request: " + JSON.stringify(e.response.body));
			} else {
				throw e;
			}
		}
	}
}

module.exports = DeltaClient
