const {expect}  = require("chai");

const {delay} = require("junk-bucket/future");
const {startMetric, promiseMetric} = require("../junk");

describe("Metrics", function(){
	it( "records elapsed time", async function(){
		let elapsed = null;
		const metric = startMetric((name, taken)=>{
			elapsed = taken;
		},"timing", {});
		await delay(5);
		metric.done();
		expect(elapsed).to.be.gte(5);
	});

	it("will track a promise", async function() {
		let elapsed = null;
		await promiseMetric((name,taken) => {
			elapsed = taken;
		}, "delay", {}, delay(10));
		expect(elapsed).to.be.gte(10);
	});
});
