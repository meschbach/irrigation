
//TODO: At least the base algorithm should be moved to the Junk Drawer
class RoundRobinScheduler {
	constructor(){
		this.targets = [];
		this.index = 0;
	}

	addTarget( target ){
		if( !this.targets.includes(target)){
			this.targets.push(target);
		}
	}

	removeTarget( target ){
		this.targets = this.targets.filter( (t) => t != target );
	}

	get isEmpty(){
		return this.targets.length == 0;
	}

	next(){
		if( this.targets.length == 0 ){ return undefined; }
		if( this.index >= this.targets.length ){
			this.index = 0;
		}
		const target = this.targets[this.index];
		this.index++;


		return target;
	}

	toJSON(){
		return {
			strategy: "round-robin",
			next: this.index,
			targets: this.targets
		};
	}
}

module.exports = {
	RoundRobinScheduler
};
