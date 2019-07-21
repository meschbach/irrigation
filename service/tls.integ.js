const {Irrigation,CallCountingService} = require("../test/harness");
const {defaultNullLogger} = require("junk-bucket/logging");
const Future = require("junk-bucket/future");
const selfsigned = require('selfsigned');
const url = require('url');
const tls = require("tls");
const rp = require("request-promise-native");

const {expect} = require("chai");

describe("for tls ingress", function(){
	beforeEach( async function(){
		const logger = defaultNullLogger; //formattedConsoleLog("tls-tests");
		//generate certificate
		const attrs = [{name: "commonName", value: "localhost"}]
		this.asymmetricKey = selfsigned.generate(attrs, { days: 1 });

		//build system
		const system = new Irrigation( logger );
		await system.start();
		this.system = system;

		this.counter = new CallCountingService;
		this.counterURL = await this.counter.start();
	});

	afterEach( async function(){
		await this.system.stop();
		await this.counter.stop();
	})

	describe("for the secure ingress", function(){
		beforeEach( async function(){
			const client = this.system.client();
			const certName = "self-signed";

			await client.uploadCertificate( certName, this.asymmetricKey.cert, this.asymmetricKey.private);
			const ingress = await client.secureIngress( "subject-under-test", 0, "node-http-proxy", certName);
			this.address = await ingress.address();
			this.url = url.parse(this.address);

			const targetPool = "calcutron";
			await ingress.useDefaultPool( targetPool );
			await client.createTargetPool( targetPool );
			await client.registerTarget( targetPool, "srv", this.counterURL );
		});

		it("presents the correct certificate", async function(){
			const future = new Future();
			const connection = tls.connect({
				host: this.url.hostname,
				port: this.url.port,
				ca: this.asymmetricKey.cert,
				checkServerIdentity: (servername, cert) => {
					return undefined;
				}
			}, () => {
				future.accept(connection.getPeerCertificate())
				connection.end();
			});
			connection.on("error", (e) => {
				future.reject(e);
			});
			const cert = await future.promised;
			expect( cert.subject ).to.deep.eq({CN: "localhost"});
		});

		it("proxies the intended application", async function(){
			const response = await rp({
				method: "GET",
				url: this.address,
				agentOptions: {
					ca: this.asymmetricKey.cert,
					checkServerIdentity: (servername, cert) => {
						return undefined;
					}
				}
			});
			expect( this.counter.callCount ).to.eq(1);
		});

		describe("for an additional server name", function(){
			beforeEach(async function(){
				//generate certificate
				const attrs = [{name: "commonName", value: "example.invalid"}];
				this.altHost = selfsigned.generate(attrs, { days: 1 });

				const certName = "alt name";
				const client = this.system.client();
				await client.uploadCertificate( certName, this.altHost.cert, this.altHost.private);
				const ingress = await client.describeIngress("subject-under-test");
				await ingress.attachSNI("example.invalid", certName);
			});

			it("presents the correct certificate", async function(){
				const future = new Future();
				const connection = tls.connect({
					host: this.url.hostname,
					port: this.url.port,
					ca: this.altHost.cert,
					checkServerIdentity: (servername, cert) => {
						return undefined;
					},
					servername: "example.invalid"
				}, () => {
					future.accept(connection.getPeerCertificate());
					connection.end();
				});
				connection.on("error", (e) => {
					future.reject(e);
				});
				const cert = await future.promised;
				expect( cert.subject ).to.deep.eq({CN: "example.invalid"});
			});

			it("can proxy the connection", async function(){
				const response = await rp({
					method: "GET",
					url: this.address,
					agentOptions: {
						ca: this.altHost.cert,
						servername: "example.invalid",
						checkServerIdentity: (servername, cert) => {
							return undefined;
						}
					}
				});
				expect( this.counter.callCount ).to.eq(1);
			})
		});
	});
})
