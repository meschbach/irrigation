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
	}

	register( service_name , port ) {
		if( !service_name ){ throw new Error("Expected service_name, is falsy") }
		if( !port && port != 0 ){ throw new Error("Expected port, got falsy") }

		return promise_requests.post_json( this.url + "/v1/target/" + service_name, { port: port } )
			.then( ( result ) => {
				if( result.headers.statusCode != 201 ){ throw new Error( result.headers.statusCode + " != 201" ) }
				return true
			})
	}

	ingress( name = "default", port = 0, wire_proxy_name = "hand" ) {
		if( !Number.isInteger( port ) ) { throw new Error( "Expected port to be a number, got: " + port ) }
		if( port < 0 || 65535 < port ){ throw new Error("Port number is invalid: ", port ) }

		return promise_requests.post_json( this.url + "/v1/ingress", { name: name, port: port, wire_proxy: wire_proxy_name, wait: true } )
			.then( ( result ) => {
				if( result.headers.statusCode != 201 ){ throw new Error( result.headers.statusCode + " != 201" ) }
				return new DeltaIngressResource( result.body._self )
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
		} )

		if( result.headers.statusCode != 201 ){
			console.log( result.body );
			throw new Error( result.headers.statusCode + " != 201" )
		}
		return new DeltaIngressResource( result.body._self )
	}

	ingress_all() { return promise_requests.get_json( this.url + "/v1/ingress" ) }

	status() {
		return promise_requests.get_json( this.url + "/v1/status" )
	}

	listCertificates() {
		return promise_requests.get_json( this.url + "/v1/certificate" );
	}

	async uploadCertificate( name, cert, key ){
		const result = await promise_requests.put_json( this.url + "/v1/certificate/" + name, {
			cert: cert,
			key: key
		} );
		return result.body;
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

	addTarget( name ) {
		return promise_requests.post_json( this.url, { add_targets: [ name ] } )
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
