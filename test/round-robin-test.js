const {expect} = require("chai");
const {RoundRobinScheduler} = require("../service/round-robin");

function doRequest(){
	this.result = this.scheduler.next();
}

function resultIsTarget() {
	expect( this.result ).to.eq(this.target);
}

describe("RoundRobin scheduler", function(){
	beforeEach(function(){
		this.scheduler = new RoundRobinScheduler();
	});

	describe("without targets", function(){
		it("is empty", function(){
			expect( this.scheduler.isEmpty ).to.eq(true);
		});

		it("gives only undefined", function(){
			expect( this.scheduler.next() ).to.eq(undefined);
		});
	});

	describe("when configured with only one target", function(){
		beforeEach(function(){
			this.target = {};
			this.scheduler.addTarget(this.target);
		});

		it("isn't empty", function(){
			expect(this.scheduler.isEmpty).to.eq(false);
		});

		describe("on 1st request", function(){
			beforeEach(doRequest);

			it("provides the target", resultIsTarget)

			describe("on 2nd request", function() {
				beforeEach(doRequest);

				it("provides the target", resultIsTarget )
			});
		});
	});

	describe("when configured with four targets", function(){
		beforeEach(function(){
			this.targets = [
				{name:"first"},
				{name:"second"},
				{name:"third"}
			];
			this.targets.forEach( (target) => {
				this.scheduler.addTarget( target );
			})
		});

		function itGivesTarget( index ){
			it("expects target " + index, function(){
				expect( this.result ).to.eq(this.targets[index]);
			});
		}

		describe("on 1st request", function(){
			beforeEach(doRequest);

			itGivesTarget(0);

			describe("on 2nd request", function() {
				beforeEach(doRequest);

				itGivesTarget(1);

				describe("on 3rd request", function() {
					beforeEach(doRequest);

					itGivesTarget(2);

					describe("on 4th request", function() {
						beforeEach(doRequest);

						itGivesTarget(0);
					});
				});
			});

		});
	});

	describe("when adding then removing a target", function(){
		it("provides only the remaining targets", function(){
			const lb = new RoundRobinScheduler();
			lb.addTarget("a");
			lb.addTarget("b");
			lb.next();
			lb.removeTarget("a");
			expect(lb.next()).to.eq("b");
			expect(lb.next()).to.eq("b");
		})
	});

	describe("JSON encoding", function(){
		it("states the next item", function(){
			const scheduler = new RoundRobinScheduler();
			scheduler.addTarget("hansel")
			scheduler.addTarget("grettle")
			scheduler.addTarget("witch")
			scheduler.addTarget("tree")

			scheduler.next();
			scheduler.next();

			//Serialize and deserialize
			const asJSONText = JSON.stringify(scheduler);
			const rep = JSON.parse(asJSONText);

			expect(rep.next).to.eq(2);
		});

		it("gives all targets", function(){
			const scheduler = new RoundRobinScheduler();
			scheduler.addTarget("you")
			scheduler.addTarget("understood")
			scheduler.addTarget("the")
			scheduler.addTarget("play")

			scheduler.next();
			scheduler.next();

			//Serialize and deserialize
			const asJSONText = JSON.stringify(scheduler);
			const rep = JSON.parse(asJSONText);

			expect(rep.targets).to.deep.eq(["you","understood","the","play"]);
		});

		it("names itself as a the strategy", function(){
			const scheduler = new RoundRobinScheduler();

			//Serialize and deserialize
			const asJSONText = JSON.stringify(scheduler);
			const rep = JSON.parse(asJSONText);

			expect(rep.strategy).to.deep.eq("round-robin");
		});
	});
});