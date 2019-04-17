const {Irrigation} = require("./harness");
const {promise_listening_url} = require("../express-extensions");
const {parallel} = require("junk-bucket/future");
const rp = require("request-promise-native");

const {expect} = require("chai");
const {CallCountingService} = require("./harness");

describe("round robin load balancing", function(){
	beforeEach(async function(){
		this.irrigation = new Irrigation( );
		await this.irrigation.start();

		this.targetA = new CallCountingService();
		this.targetB = new CallCountingService();

		const client = this.irrigation.client();
		const poolName = "subject-under-test";
		this.poolName = poolName;
		await client.createTargetPool( poolName );
		await client.registerTarget( poolName, "target-a", await this.targetA.start() );
		await client.registerTarget( poolName, "target-b", await this.targetB.start() );

		const ingress = await client.ingress("test-ingress" );
		ingress.useDefaultPool(poolName);
		this.ingressURL = await ingress.address();
	});
	beforeEach(async function(){
		const callTarget = async () =>{
			return await rp(this.ingressURL);
		};
		const results = [];
		for( let i = 0 ; i < 5; i++ ){
			results.push(callTarget());
		}
		await parallel(results);
	});

	afterEach(async function(){
		this.targetB.stop();
		this.targetA.stop();
		await this.irrigation.stop();
	});

	it("sends the correct number of requests to target A", function(){
		expect(this.targetA.callCount).to.eq(3);
	});
	it("sends the correct number of requests to target B", function(){
		expect(this.targetB.callCount).to.eq(2);
	});

	describe("when when A is removed from the pool", function(){
		beforeEach(async function(){
			const client = this.irrigation.client();
			await client.removeTarget( this.poolName, "target-a" );

			const callTarget = async () =>{
				return await rp(this.ingressURL);
			};
			const results = [];
			for( let i = 0 ; i < 5; i++ ){
				results.push(callTarget());
			}
			await parallel(results);
		});

		it("continues sending requests to B", function(){
			expect(this.targetB.callCount).to.eq(7);
		});
		it("no longer sends requests to A", function(){
			expect(this.targetA.callCount).to.eq(3);
		});
	});
});
