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

	useBearerToken( token ){
		this.authHeader = "Bearer " + token;
		console.log("Installing bearer token", this.authHeader);
	}

	/**
	 * @deprecated Please use #registerTarget
	 * @param service_name
	 * @param port
	 * @returns {Promise<*>}
	 */
	register( service_name , port ) {
		if( !service_name ){ throw new Error("Expected service_name, is falsy") }
		if( !port && port != 0 ){ throw new Error("Expected port, got falsy") }

		return this.registerTarget("default", service_name + "-" + port, "http://localhost:" + port);
	}

	async describeIngress( name ) {
		return new DeltaIngressResource(this.url + "/v1/ingress/"+name);
	}

	ingress( name = "default", port = 0, wire_proxy_name = "hand" ) {
		if( !Number.isInteger( port ) ) { throw new Error( "Expected port to be a number, got: " + port ) }
		if( port < 0 || 65535 < port ){ throw new Error("Port number is invalid: ", port ) }

		return promise_requests.post_json( this.url + "/v1/ingress", { name: name, port: port, wire_proxy: wire_proxy_name, wait: true }, this.authHeader )
			.then( ( result ) => {
				if( result.headers.statusCode != 201 ){ throw new Error( result.headers.statusCode + " != 201" ) }
				return new DeltaIngressResource( result.body._self, this.authHeader )
			})
	}

	async secureIngress( name = "default", port = 0, wire_proxy_name = "hand", certificateName ) {
		if( !Number.isInteger( port ) ) { throw new Error( "Expected port to be a number, got: " + port ) }
		if( port < 0 || 65535 < port ){ throw new Error("Port number is invalid: ", port ) }
		if( !certificateName ){
			throw new Error("Certificate name must be specified");
		}

		const result = await promise_requests.post_json( this.url + "/v1/ingress", {
			name: name,
			port: port,
			wire_proxy: wire_proxy_name,
			wait: true,
			certificateName: certificateName,
			scheme: "https"
		}, this.authHeader )

		if( result.headers.statusCode != 201 ){
			console.log( result.body );
			throw new Error( result.headers.statusCode + " != 201" )
		}
		return new DeltaIngressResource( result.body._self, this.authHeader )
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
		const result = await promise_requests.put_json( this.url + "/v1/certificate/" + name, {
			cert: cert,
			key: key
		}, this.authHeader );
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
		console.log("sec mode auth: ", this.authHeader);
		const result = await promise_requests.get_json( this.url + "/v1/security", 200, this.authHeader);
		return result;
	}

	async installJWT( symmetricSecret ){
		const result = await promise_requests.put_json( this.url + "/v1/jwt", { symmetricSecret: symmetricSecret.toString("base64") }, this.authHeader);
		return result;
	}
}

class DeltaIngressResource {
	constructor( url ) {
		if( !url ) { throw new Error( "URL must be defined" ) }
		this.url = url
		this.loaded = false
	}

	clear_cache() {
		this.loaded = false
		this.retrival = undefined
		this.cache = undefined
	}

	refresh() {
		this.clear_cache()
		this.retrieval = promise_requests.get_json( this.url ).then( ( response ) => {
			this.loaded = true
			this.cache = response
		})
		return this.retrieval
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
	address() {
		if( !this.retrieval ) { this.refresh() }
		return this.retrieval.then( () => {
			return this.cache.address
		})
	}

	async attachSNI( serverName, certificateName ){
		const targetURL = this.url + "/sni/" + serverName;
		const req = {
			method: "PUT",
			url: targetURL,
			body: { sni: { serverName, certificateName } },
			json: true
		};
		try {
			const response = await rp(req);
			return response.body;
		}catch(e){
			const statusCode = e.statusCode;
			if( statusCode ){
				throw new Error("Ingress " + this.url + " does not exist");
			}
		}
	}
}

module.exports = DeltaClient
