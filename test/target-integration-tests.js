const {expect} = require("chai");
const {get_json} = require("../promise-requests");
const {Irrigation} = require("./harness");
const {CallCountingService} = require("./harness");

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

			expect(response.targetPool.targets).to.deep.eq({});
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
				await ingress.useDefaultPool(this.poolName);
				const address = await ingress.address();
				console.log(address);

				const result = await get_json(address);
				expect( this.counter.callCount ).to.eq(1);
			});
		})
	});
});
