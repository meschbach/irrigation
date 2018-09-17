const {expect} = require("chai");

const {Irrigation} = require("./harness");
const {addressOnListen} = require("junk-bucket/sockets");

const rp = require("request-promise-native");

const express =require("express");
class HostCaptureService {
	constructor() {
		this.callCount = 0;
	}

	async start() {
		const app = express();
		app.use( (req,resp) => {
			this.callCount++;
			resp.json({host: req.hostname, forwardedHost: req.header("X-Forwarded-Host")});
		});
		const listener = addressOnListen(app, 0);
		this.listener = listener;
		const rawAddress = await listener.address;
		return rawAddress.host + ":" + rawAddress.port;
	}

	async stop(){
		this.listener.stop();
	}
}

describe("when the request is proxied", function(){
	beforeEach(async function(){
		this.system = new Irrigation();
		await this.system.start();

		this.hostService = new HostCaptureService();
		const hostPort = await this.hostService.start();

		const irrigation = this.system.client();
		await irrigation.createTargetPool("host-service");
		await irrigation.registerTarget("host-service", "one-use", "http://"+hostPort);

		const defaultIngress = await irrigation.ingress("test", 0, "node-http-proxy");
		await defaultIngress.useDefaultPool("host-service");
		this.address = await defaultIngress.address();
	});

	afterEach(async function(){
		await this.system.stop();
		await this.hostService.stop();
	});

	describe("by default", function () {
		it("forwards with the X-Forwarded-Host", async function(){
			const result = await rp({
				method: "get",
				url: this.address,
				headers: {
					Host: "test",
				},
				json:true
			});
			expect(result.forwardedHost).to.eq("test");
		});

		it("sets the Host header to the correct target", async function(){
			const result = await rp({
				method: "get",
				url: this.address,
				headers: {
					Host: "test",
				},
				json:true
			});
			expect(result.host).to.eq("test");
		});
	});
});
