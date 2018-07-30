const {Irrigation} = require("./harness");
const {expect} = require("chai");

const crypto = require("crypto");
const {promisify} = require("util");

const crypto_randomBytes = promisify(crypto.randomBytes);

const jwt = require("jsonwebtoken");

describe("without security configured", function(){
	beforeEach(async function(){
		this.irrigation = new Irrigation();
		await this.irrigation.start();
		this.client = this.irrigation.client();
	});

	afterEach( async function(){
		this.irrigation.stop();
	});

	it( "in party mode", async function(){
		const mode = await this.client.securityMode();
		expect( mode.party ).to.eq(true);
	});

	describe("when JWT security is configured", function(){
		beforeEach(async function(){
			//Generate key material
			console.log("Key gen");
			const key = await crypto_randomBytes( 512 / 8 );
			this.key = key;

			//Install key material
			await this.client.installJWT(key);

			//Generate a valid token
			this.validToken = jwt.sign({role: "superuser"}, this.key, {expiresIn: '1 min', notBefore: '1'} );
		});

		it( "is no longer in party mode", async function() {
			this.client.useBearerToken(this.validToken);
			const result = await this.client.securityMode();
			expect( result.party ).to.eq(false);
		});

		it( "will reject tokens not known", async function(){
			const token = jwt.sign({role: "superuser"}, await crypto_randomBytes( 512 / 8 ), {expiresIn: '1 min', notBefore: '1h'} );
			this.client.useBearerToken(token);
			try {
				const certs = await this.client.listCertificates();
				throw new Error("Shouldn't be allowed");
			}catch (e) {
				//Exception should be risen
			}
		});

		it( "will accepts tokens which are known", async function(){
			this.client.useBearerToken(this.validToken );
			const certs = await this.client.listCertificates();
		});
	});
});