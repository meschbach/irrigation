const chai = require( 'chai' );
const expect = chai.expect;

const WebSocket = require('ws');
const DeltaClient = require("../client");
let delta = require( "../index" )

const {promiseEvent} = require("junk-bucket/future");
const Future = require("junk-bucket/future");

describe( "When configuring an ingress for websockets", function() {
	beforeEach(async function(){
		const service = new WebSocket.Server({port:0});
		this.targetMessage = new Future();
		service.on('connection', (ws) => {
			console.log("Connected");
			this.connected = true;
			ws.send("connected");
			ws.on('message', (m) => {
				console.log("message");
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

		this.proxy = new delta.Delta();

		this.proxyControl = await this.proxy.start();
		this.client = new DeltaClient( this.proxyControl );
		await this.client.createTargetPool("ws-pool");
		await this.client.registerTarget("ws-pool", "ws-target", "http://localhost:"+ this.targetPort);
		const ingress = await this.client.ingress("ws-test", 0, "node-http-proxy");

		this.wsIngressURL = await ingress.address();
		await ingress.useDefaultPool("ws-pool");
	});
	afterEach( async function(){
		await this.proxy.stop();
		await this.targetService.close();
	});

	it( "relays the websocket connection", async function () {
		const url = this.wsIngressURL;
		console.log("Proxy url: " + url);
		const ws = new WebSocket(url);
		await promiseEvent(ws, "open");
		expect(this.connected).to.be.true;
	});

	it( "allows for the client to send the server a message", async function(){
		const url = this.wsIngressURL;
		console.log("Proxy url: " + url);
		const ws = new WebSocket(url);
		await promiseEvent(ws, "open");
		const message = 'test';
		ws.send(message);
		await this.targetMessage.promised;
		expect(this.serviceMessage).to.be.eq(message);
	} );

	it( "allows the server to send the client a message", async function(){
		const url = this.wsIngressURL;
		console.log("Proxy url: " + url);
		const ws = new WebSocket(url);
		const resultPromise = promiseEvent(ws, "message")
		await promiseEvent(ws, "open");
		const result = await resultPromise
		expect(result).to.be.eq("connected");
	} );
});
