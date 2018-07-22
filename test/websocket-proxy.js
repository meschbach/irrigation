const chai = require( 'chai' );
const expect = chai.expect;

const WebSocket = require('ws');
const {DeltaClient} = require("../client");
let delta = require( "../index" )

const {promiseEvent} = require("junk-bucket/future");

describe( "When configuring an ingress for websockets", function() {
	before(async function(){
		const service = new WebSocket.Server({port:0});
		service.on('connection', (ws) => {
			console.log("Connected");
			this.connected = true;
			ws.on('message', (m) => {
				this.serviceMessage = m;
			})
		});
		await promiseEvent( service, "listening" );
		this.targetPort = service.address().port;
		this.targetService = service;

		this.proxy = new delta.Delta();
		this.proxyControl = await this.proxy.start();
		this.proxy.register_target("target", this.targetPort);
		this.ingress = this.proxy.ingress("ws-test", 0, "node-http-proxy");
		await promiseEvent(this.ingress.serverSocket, "listening");
		const ingressAddress = this.ingress.serverSocket.address();
		this.wsIngressURL = "ws://localhost:"+ingressAddress.port;
		this.ingress.targets.push("target");
	});
	after(function(){
		this.proxy.stop();
		this.targetService.close();
	});

	it( "relays the websocket connection", async function () {
		const url = this.wsIngressURL;
		console.log("Proxy url: " + url);
		const ws = new WebSocket(url);
		await promiseEvent(ws, "open");
		expect(this.connected).to.be.true;
	});

	it( "allows for the client to send the server a message" );
	it( "allows the server to send the client a message" );
});
