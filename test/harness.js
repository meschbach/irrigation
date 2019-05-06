const EventEmitter = require("events");
const {Delta} = require("../index");
const DeltaClient = require("../client");

const {listen} = require("../junk"); //junk-bucket/sockets
const {defaultNullLogger, newLoggingMetricsPlatform} = require( "../junk" ); //junk-bucket/logging}

const {Context} = require("junk-bucket/context");
const express = require("express");

class Irrigation extends EventEmitter {
	constructor( logger = defaultNullLogger ){
		super();
		this.logger = logger;
		const metrics = newLoggingMetricsPlatform(logger);
		this.proxy = new Delta( logger, metrics );
	}

	async start(){
		this.on("stop", () => { this.proxy.stop(); });
		this.localControlURL = await this.proxy.start();
	}

	client(){
		return new DeltaClient( this.localControlURL, this.logger.child({component: "client"}) );
	}

	stop(){
		this.emit("stop");
	}
}

class CallCountingService extends EventEmitter {
	constructor() {
		super();
		this.callCount = 0;
		//TODO: This should probably be fed in from the environment
		this.context = new Context("call-counting", defaultNullLogger);
	}

	async start( ) {
		const app = express();
		app.use( (req,resp) => {
			this.callCount++;
			resp.json({count: this.callCount});
		});
		return "http://" + await listen(this.context, app, 0);
	}

	async stop(){
		await this.context.cleanup();
	}
}

module.exports = {
	Irrigation,
	CallCountingService
}
