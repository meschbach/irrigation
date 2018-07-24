/*
 * Irragation L7 HTTP Proxy
 *
 * Certificate Management
 */

class MemoryCertificateManager {
	constructor() {
		this.certs = {};
	}

	async store( name, certificate, key ){
		this.certs[name] = {cert: certificate, key};
	}

	async retrieve( name ){
		return this.certs[name];
	}

	async names() {
		return Object.keys( this.certs );
	}
}

module.exports = {
	MemoryCertificateManager
}
