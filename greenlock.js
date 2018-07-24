/*
 * Irrigation L7 HTTP Proxy
 *
 * GreenLock
 */
const Greenlock = require("greenlock");

class GreenlockPlugin {
	start( config ) {
		this.config = config;
	}

	stop() {

	}

	async configureSocketOptions( domains ){
		console.log("Configuring socket options for ", domains);
		const opts = {
			domains: domains,
			email: this.config.email,
			agreeTos: this.config.tos,
			communityMember: false,
			skipChallengeTest: true
		}
		const greenlock = Greenlock.create({
			version: "draft-12",
			server: "https://acme-staging-v02.api.letsencrypt.org/directory",
			configDir: this.config.dir
		});
		console.log("Reigstering ", domains);
		const certs = await greenlock.register(opts);
		console.log("Registration completed: ", certs);
		return {
			key: certs.privkey,
			cert: certs.cert + "\r\n" + certs.chain
		};
	}
}

module.exports = {
	GreenlockPlugin
};
