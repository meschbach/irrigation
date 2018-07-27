const {expect} = require("chai");

const EventEmitter = require("events");
const {Delta} = require("../index");
const DeltaClient = require("../client");
const {get_json} = require("../promise-requests");

class Irrigation extends EventEmitter {
	constructor(){
		super();
		this.proxy = new Delta();
	}

	async start(){
		this.on("stop", () => { this.proxy.stop(); });
		this.localControlURL = await this.proxy.start();
	}

	client(){
		return new DeltaClient( this.localControlURL );
	}

	stop(){
		this.emit("stop");
	}
}

const express = require("express");
const {promise_listening_url} = require("../express-extensions");

class CallCountingService extends EventEmitter {
	constructor() {
		super();
		this.callCount = 0;
	}

	async start() {
		const app = express();
		app.use( (req,resp) => {
			this.callCount++;
			resp.json({count: this.callCount});
		})
		app.on("listening", ( socket ) => {
			this.serviceSocket = socket;
		})
		return promise_listening_url( app, 0 );
	}

	async stop(){
		this.serviceSocket.close();
	}
}

describe("given an instance of the system", function(){
	beforeEach(async function(){
		this.irrigation = new Irrigation();
		await this.irrigation.start();
		this.client = this.irrigation.client();
	});

	afterEach( async function(){
		this.irrigation.stop();
	});

	describe("when a target pool doesn't exist", function(){
		it("errors", async function(){
			const client = await this.irrigation.client();
			try {
				await client.describeTarget("nonexistent-target");
				throw new Error("Expected to throw"); // TOOD: Figure out cleaner assertion pattern
			}catch(e){ }
		});
	});

	describe("when creating a memory target pool", function(){
		it("has no members", async function(){
			const client = await this.irrigation.client();
			await client.createTargetPool( "in-memory" );
			const response = await client.describeTargetPool("in-memory");

			expect(response.targetPool.targets).to.deep.eq([]);
		})
	});

	describe("when adding a member to the target pool", function(){
		beforeEach(async function(){
			this.poolName = "in-memory";
			this.targetName = "counting-calls";
			this.counter = new CallCountingService();
			const addr = await this.counter.start();
			console.log("Address of counting service: ", addr);

			await this.client.createTargetPool( this.poolName );
			await this.client.registerTarget( this.poolName,  this.targetName, addr );
		});

		afterEach( async function(){
			await this.counter.stop();
		});

		it("is immeidately considered in service", async function(){
			const targetResponse =  await this.client.describeTarget( this.poolName, this.targetName );
			const target = targetResponse.target;
			expect( target.inService ).to.eq(true);
		});

		describe("when target is in service", function(){
			it("will route to the target", async function(){
				const ingress = await this.client.ingress();
				await ingress.setDefaultPool(this.poolName);
				const address = await ingress.address();
				console.log(address);

				const result = await get_json(address);
				expect( this.counter.callCount ).to.eq(1);
			});
		})
	});
});
