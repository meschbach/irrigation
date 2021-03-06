const {Irrigation} = require("../test/harness");
const {expect} = require("chai");

const {get_json} = require("../promise-requests");

const {CallCountingService } = require("../test/harness");

const {createTestLogger} = require( "./test-junk" );

describe("path routing", function(){
	beforeEach( async function(){
		this.targetA = new CallCountingService();
		const targetAURL = await this.targetA.start();

		this.targetB = new CallCountingService();
		const targetBURL = await this.targetB.start();

		this.defaultTarget = new CallCountingService();
		const defaultTargetURL = await this.defaultTarget.start();

		this.irrigation = new Irrigation( createTestLogger("path routing", false) );
		await this.irrigation.start();

		const client = this.irrigation.client();
		await client.createTargetPool( "target-a" );
		await client.registerTarget("target-a", "test-a", targetAURL );

		await client.createTargetPool( "target-b" );
		await client.registerTarget("target-b", "test-b", targetBURL );

		await client.createTargetPool( "default" );
		await client.registerTarget("default", "test-c", defaultTargetURL );

		const ingress = await client.ingress( "test-ingress", 0 );
		await ingress.useDefaultPool("default");
		await ingress.applyRules([
			{type: "path.prefix", is: "/a", target: "target-a" }
		]);

		this.address = await ingress.address();
	});

	afterEach(async function(){
		await this.targetA.stop();
		await this.targetB.stop();
		await this.defaultTarget.stop();

		await this.irrigation.stop();
	})

	describe("when routing to target pool A given prefix C", function(){
		beforeEach(async function () {
			const result = await get_json( this.address + "/a/count-test");
		});

		it("routes to the target in Pool A", function(){
			expect( this.targetA.callCount ).to.eq(1);
		});
		it("does not route to the default Pool", function(){
			expect( this.defaultTarget.callCount ).to.eq(0);
		});
		it("does not route to the Pool B", function(){
			expect( this.targetB.callCount ).to.eq(0);
		});
	});
});
