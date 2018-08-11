const EventEmitter = require("events");
const {Delta} = require("../index");
const DeltaClient = require("../client");

const {defaultNullLogger} = require( "junk-bucket/logging" );

class Irrigation extends EventEmitter {
	constructor( logger = defaultNullLogger ){
		super();
		this.logger = logger;
		this.proxy = new Delta( logger );
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

module.exports = {
	Irrigation
}
