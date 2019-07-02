const {expect}  = require("chai");

const {delay} = require("junk-bucket/future");
const {newMetricsPlatform, promiseMetric} = require("../junk");

describe("Metrics", function(){
	it( "records elapsed time", async function(){
		const platform = newMetricsPlatform();
		const observer = platform.measure("test", {examle:"point"});
		await delay(6);
		observer.done();
		expect(platform.registry.getSingleMetric("test").hashMap[''].bucketValues[10]).to.eq(1);
	});

	it("will track a promise", async function() {
		const platform = newMetricsPlatform();
		await platform.promise("promise_test", {}, delay(5));
		expect(platform.registry.getSingleMetric("promise_test").hashMap[''].bucketValues[10]).to.eq(1);
	});
});
