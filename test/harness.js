const EventEmitter = require("events");
const {Delta} = require("../index");
const DeltaClient = require("../client");

const {defaultNullLogger} = require( "junk-bucket/logging" );
const express = require("express");
const {promise_listening_url} = require("../express-extensions");

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
	}

	async start() {
		const app = express();
		app.use( (req,resp) => {
			this.callCount++;
			resp.json({count: this.callCount});
		});
		app.on("listening", ( socket ) => {
			this.serviceSocket = socket;
		});
		return promise_listening_url( app, 0 );
	}

	async stop(){
		this.serviceSocket.close();
	}
}

module.exports = {
	Irrigation,
	CallCountingService
}
