const {expect} = require("chai");
const {compileRules, runRules } = require("../service/rules");

describe("rule compilation", function(){
	describe("with an unknown rule", function () {
		it("fails to generate", function(){
			expect( function(){
				compileRules([{type: "bad.rule", answer:"to me"}]);
			}).to.throw("unsupported rule bad.rule");
		})
	});

	describe("no rules", function () {
		it("generates an empty rule set", function(){
			const compiledRules = compileRules([]);
			expect( compiledRules ).to.deep.eq([]);
		})
	});

	describe("no rules", function () {
		it("uses default target", function(){
			const compiledRules = compileRules([]);
			const defaultTarget = "i am doctor bob";
			const target = runRules( compiledRules, defaultTarget, {});
			expect( target ).to.eq(defaultTarget);
		})
	});


	describe("path.prefix", function () {
		it("matches on exact string", function(){
			const ruleTarget = "gravity";
			const defaultTarget = "disppear";

			const compiledRules = compileRules([{ type: "path.prefix", is: "/drifting", target: ruleTarget}]);
			const target = runRules( compiledRules, defaultTarget, {url: "/drifting"});

			expect( target ).to.eq(ruleTarget);
		});

		it("matches on prefix", function(){
			const ruleTarget = "acme";
			const defaultTarget = "roadrunner";

			const compiledRules = compileRules([{ type: "path.prefix", is: "/catch", target: ruleTarget}]);
			const target = runRules( compiledRules, defaultTarget, {url: "/catch/wolf"});

			expect( target ).to.eq(ruleTarget);
		});

		it("defaults on other", function(){
			const ruleTarget = "number";
			const defaultTarget = "crunch";

			const compiledRules = compileRules([{ type: "path.prefix", is: "/blink", target: ruleTarget}]);
			const target = runRules( compiledRules, defaultTarget, {url: "/just/be/there"});

			expect( target ).to.eq(defaultTarget);
		});
	});

	describe("header.host", function () {
		it("matches on host header", function(){
			const ruleTarget = "at";
			const defaultTarget = "the party";

			const compiledRules = compileRules([{ type: "header.host", host: "might.be.the.one", target: ruleTarget}]);
			const target = runRules( compiledRules, defaultTarget, {headers: { "host" : "might.be.the.one"} });

			expect( target ).to.eq(ruleTarget);
		});

		it("defaults on other hosts", function(){
			const ruleTarget = "threw";
			const defaultTarget = "it";

			const compiledRules = compileRules([{ type: "header.host", host: "let.it.go", target: ruleTarget}]);
			const target = runRules( compiledRules, defaultTarget, {headers: { "host" : "might.be.the.one"} });

			expect( target ).to.eq(defaultTarget);
		});
	});

	describe("header.host", function () {
		describe("when the host matches", function () {
			describe("and the path does", function(){
				it("uses new target", function () {
					const ruleTarget = "let";
					const defaultTarget = "all go";

					const compiledRules = compileRules([{
						type: "host.path-prefix",
						host: "twice-again",
						prefix: "/end/of/time",
						target: ruleTarget
					}]);

					const target = runRules( compiledRules, defaultTarget, {headers: { "host" : "twice-again"}, url: "/end/of/time" });

					expect( target ).to.eq(ruleTarget);
				});
			});
			describe("but path does not", function(){
				it("uses default target", function () {
					const ruleTarget = "let";
					const defaultTarget = "all go";

					const compiledRules = compileRules([{
						type: "host.path-prefix",
						host: "twice-again",
						prefix: "/end/of/time",
						target: ruleTarget
					}]);

					const target = runRules( compiledRules, defaultTarget, {headers: { "host" : "twice-again"}, url: "/pick-of-time" });

					expect( target ).to.eq(defaultTarget);
				});
			});
		});

		describe("when the path matches", function () {
			describe("and the host does not", function(){
				it("uses default target", function () {
					const ruleTarget = "let";
					const defaultTarget = "all go";

					const compiledRules = compileRules([{
						type: "host.path-prefix",
						host: "twice-again",
						prefix: "/end/of/time",
						target: ruleTarget
					}]);

					const target = runRules( compiledRules, defaultTarget, {headers: { "host" : "final.chapter"}, url: "/end/of/time" });

					expect( target ).to.eq(defaultTarget);
				});
			});
		});
	});
});
