const chai = require( 'chai' );
const expect = chai.expect;

const WebSocket = require('ws');
const DeltaClient = require("../client");
let delta = require( "../index" );

const {promiseEvent} = require("junk-bucket/future");
const Future = require("junk-bucket/future");

const {defaultNullLogger}  = require("junk-bucket/logging");
const {newMetricsPlatform} = require("../junk");

const http = require("http");
const {addressOnListen} = require("junk-bucket/sockets");
const assert = require("assert");
const selfsigned = require("selfsigned");

describe( "When configuring an ingress for websockets", function() {
	beforeEach(async function(){
		const service = new WebSocket.Server({port:0});
		this.targetMessage = new Future();
		service.on('connection', (ws) => {
			this.connected = true;
			ws.send("connected");
			ws.on('message', (m) => {
				if( !this.targetMessage.resolved ) {
					this.targetMessage.accept( m );
				}
				this.serviceMessage = m;
				ws.send("ack");
			})
		});
		await promiseEvent( service, "listening" );
		this.targetPort = service.address().port;
		this.targetService = service;

		//TODO: Use Irrigation facade
		const logger = defaultNullLogger;
		const metrics = newMetricsPlatform(logger);
		this.proxy = new delta.Delta( logger, metrics );

		this.proxyControl = await this.proxy.start();
		this.client = new DeltaClient( this.proxyControl );
		await this.client.createTargetPool("ws-pool");
		await this.client.registerTarget("ws-pool", "ws-target", "http://localhost:"+ this.targetPort);
		//TODO: Shoudl probably bind to a service which rasises an error
		await this.client.createTargetPool("ws-bad");
		await this.client.registerTarget("ws-bad", "ws-target", "http://localhost:"+ 35536);

		const ingress = await this.client.ingress("ws-test", 0, "node-http-proxy");
		const badIngress = await this.client.ingress("ws-bad", 0, "node-http-proxy");

		this.wsBadIngressURL = await badIngress.address();
		await badIngress.useDefaultPool("ws-bad");

		this.wsIngressURL = await ingress.address();
		await ingress.useDefaultPool("ws-pool");

		//503 backend
		const httpUpgrade503 = http.createServer( (req, resp) => {
			resp.statusCode = 503;
			resp.end();
		});
		httpUpgrade503.on("upgrade", (req, socket) => {
			socket.end();
		});
		this.httpUpgradeBind = addressOnListen(httpUpgrade503 );
		const httpUpgradeAddress = await this.httpUpgradeBind.address;
		await this.client.createTargetPool("ws-503");
		await this.client.registerTarget("ws-bad", "ws-target", "http://localhost:"+ httpUpgradeAddress.port);
		const upgradeIngress = await this.client.ingress("ws-503", 0, "node-http-proxy");
		await upgradeIngress.useDefaultPool("ws-503");
		this.wsUpgradeURL = await upgradeIngress.address();
	});
	afterEach( async function(){
		await this.httpUpgradeBind.stop();
		await this.proxy.stop();
		await this.targetService.close();
	});

	it( "relays the websocket connection", async function () {
		const url = this.wsIngressURL;
		const ws = new WebSocket(url);
		await promiseEvent(ws, "open");
		expect(this.connected).to.be.true;
	});

	it( "allows for the client to send the server a message", async function(){
		const url = this.wsIngressURL;
		const ws = new WebSocket(url);
		await promiseEvent(ws, "open");
		const message = 'test';
		ws.send(message);
		await this.targetMessage.promised;
		expect(this.serviceMessage).to.be.eq(message);
	} );

	it( "allows the server to send the client a message", async function(){
		const url = this.wsIngressURL;
		const ws = new WebSocket(url);
		const resultPromise = promiseEvent(ws, "message")
		await promiseEvent(ws, "open");
		const result = await resultPromise
		expect(result).to.be.eq("connected");
	} );

	describe("misconfigured upstreams", function(){
		it( "reasonably fails when ingress target is wrong", async function(){
			const url = this.wsBadIngressURL;
			const ws = new WebSocket(url);
			try {
				await promiseEvent(ws, "open");
				assert(false);
			}catch(e){
				console.log(e);
			}
		});

		it( "reasonably fails when ingress errors on proxy", async function(){
			const url = this.wsUpgradeURL;
			const ws = new WebSocket(url);
			try {
				await promiseEvent(ws, "open");
				ws.close();
				assert(false);
			}catch(e){
				assert(e);
			}
		});
	});

	describe("for TLS connections", function(){
		beforeEach(async function(){
			const httpUpgradeAddress = await this.httpUpgradeBind.address;

			const attrs = [{name: "commonName", value: "example.invalid"}];
			this.altHost = selfsigned.generate(attrs, { days: 1 });

			const certName = "ws-503-tls";
			await this.client.uploadCertificate( certName, this.altHost.cert, this.altHost.private);
			const ingress = await this.client.secureIngress("ws-503-tls", 0, "node-http-proxy", certName);
			await ingress.useDefaultPool("ws-503");
			this.wsTLS403URL = await ingress.address();
		});

		it( "reasonably fails when TLS ingress errors on proxy", async function(){
			const url = this.wsTLS403URL.replace("http","ws");
			console.log(url);
			const ws = new WebSocket(url);
			try {
				await promiseEvent(ws, "open");
				ws.close();
				assert(false);
			}catch(e){
				assert(e);
			}
		});
	});
});
