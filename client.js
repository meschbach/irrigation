/*
 * Irragation L7 Proxy System
 *
 * Client Interface
 */

// Internal dependencies
let promise_requests = require( './promise-requests' )

class DeltaClient {
	constructor( controlURL ) {
		this.url = controlURL
		this.authHeader = undefined;
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
		if( !inPool ){
			throw new Error("Pool name is required");
		}
		const result = await promise_requests.put_json( this.url + "/v1/target-pool/" + inPool + "/target/" + name, {url: url}, this.authHeader);
		const statusCode = result.headers.statusCode;
		if( 200 > statusCode && statusCode >= 300 ){
			throw new Error("Unexpected status: ", statusCode);
		}
		return result;
	}

	async describeTarget( inPool, name ){
		if( !inPool ){
			throw new Error("Pool name is required");
		}
		const result = await promise_requests.get_json( this.url + "/v1/target-pool/" + inPool + "/target/" + name, 200, this.authHeader);
		return result;
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

	applyRules( rules ){
		return promise_requests.put_json( this.url + "/routing", { rules } )
			.then( ( result ) => {
				this.clear_cache()
				if( result.headers.statusCode != 200 ){ throw new Error( result.headers.statusCode + " != 200" ) }
				return this
			})
	}

	refresh() {
		this.clear_cache()
		this.retrieval = promise_requests.get_json( this.url ).then( ( response ) => {
			this.loaded = true
			this.cache = response
		})
		return this.retrieval
	}

	/*
	 * returns a promise for the address once resolved
	 */
	address() {
		if( !this.retrieval ) { this.refresh() }
		return this.retrieval.then( () => {
			console.log( "Address request", this.cache )
			return this.cache.address
		})
	}
}

module.exports = DeltaClient
