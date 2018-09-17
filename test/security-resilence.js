const chai = require( 'chai' );
const expect = chai.expect;

const assert = require("assert");
const {Irrigation} = require("./harness");

describe( "Security: Ensure service is resilent to errors", function() {
	beforeEach(async function(){
		this.system = new Irrigation();
		await this.system.start();
	});
	afterEach( async function(){
		await this.system.stop();
	});

	it("tolerates a bad port bind for plain sockets", async function(){
		const client = this.system.client();
		try {
			const ingress = await client.ingress("bad-port", 1, "hand");
			await ingress.useDefaultPool("default");
		}catch (e) {
			assert(e.message);
		}
	});

	it("tolerates a bad port bind for secure sockets", async function(){
		const client = this.system.client();
		try {
			const ingress = await client.secureIngress("bad-port", 1, "hand","default-certificate");
			await ingress.useDefaultPool("default");
		}catch (e) {
			assert(e.message);
		}
	});
});
