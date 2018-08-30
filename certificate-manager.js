/*
 * Irragation L7 HTTP Proxy
 *
 * Certificate Management
 */
const assert = require("assert");

class MemoryCertificateManager {
	constructor() {
		this.certs = {};
	}

	async store( name, certificate, key, ca ){
		assert( name );
		assert( certificate );
		assert( key );
		this.certs[name] = {cert: certificate, key, ca};
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
};
