const {expect}  = require("chai");

const {delay} = require("junk-bucket/future");
const {newMetricsPlatform, promiseMetric} = require("../junk");

function totalSampleCount( registry, metric ){
	const records = registry.getSingleMetric( metric );
	const buckets = records.hashMap[''].bucketValues;
	const values =  buckets['5'] + buckets['10'];
	return values;
}

describe("Metrics", function(){
	it( "records elapsed time", async function(){
		const platform = newMetricsPlatform();
		const observer = platform.measure("test", {examle:"point"});
		await delay(7);
		observer.done();
		expect(totalSampleCount(platform.registry, "test")).to.eq(1);
	});

	it("will track a promise", async function() {
		const platform = newMetricsPlatform();
		await platform.promise("promise_test", {}, delay(7));
		expect(totalSampleCount(platform.registry, "promise_test")).to.eq(1);
	});
});
