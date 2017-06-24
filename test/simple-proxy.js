let bodyParser = require('body-parser');
let chai = require( 'chai' )
let chaiAsPromised = require("chai-as-promised");
chai.use(chaiAsPromised);

let expect = chai.expect
let express = require( 'express' )
let http = require( 'http' )
let mocha = require( 'mocha' )
let morgan = require( 'morgan' )
let q = require( 'q' )
let request = require( 'request' )

function defer( what ) {
		let defer = q.defer()
		try {
			let resolve = ( value ) => {
				defer.resolve( value )
			}

			let reject = ( value ) => {
				defer.reject( value )
			}

			what( resolve, reject )
		}catch( error ){
			defer.reject( error )
		}
		return defer.promise
}

function promise_get_request( url ) {
	return defer( ( resolve, reject ) => {
		request( url, (err, resp, body) => {
			if( err ){ return reject( err ) }
			resolve( { headers: resp, body } )
		})
	})
}

function promise_post_json_request( url, body ) {
	return defer( ( resolve, reject ) => {
		request({
			method: 'POST',
			uri: url,
			json: body
		}, (error, resp, body ) => {
			if( error ) { return reject( error ) }
			resolve( { headers: resp, body } )
		})
	})
}

function express_promise_listen_url( app, port ){
	return defer( ( resolve, reject ) => {
		let listener = app.listen( port, () => {
			let url = "http://localhost:" + listener.address().port
			resolve( url )
		})
	})
}

function http_promise_listen_url( service, port ){
	return defer( ( resolve, reject ) => {
		let listener = service.listen( port, () => {
			let url = "http://localhost:" + listener.address().port
			resolve( url )
		})
	})
}

class DeltaClient {
	constructor( controlURL ) {
		this.url = controlURL
	}

	register( service_name , port ) {
		if( !service_name ){ throw new Error("Expected service_name, is falsy") }
		if( !port && port != 0 ){ throw new Error("Expected port, got falsy") }

		return promise_post_json_request( this.url + "/v1/target/" + service_name, { port: port } )
			.then( ( result ) => {
				if( result.headers.statusCode != 201 ){ throw new Error( result.headers.statusCode + " != 201" ) }
				return true
			})
	}
}

class SimpleTestService {
	start() {
		return defer( (resolve, reject ) => {
			this.app = express()
			this.app.use( morgan( "long" ) )
			this.app.use( bodyParser.json() )
			this.app.get( "/proxy-test/received", (request,response) => {
				response.json( {passed: true })
			})

			this.app.post( "/proxy-test/post-test", ( request, response ) => {
				response.json( {passed: true } )
			})

			let listener = this.app.listen( 0, () => {
				let port = listener.address().port
				this.port = port
				resolve( port )
			})
		});
	}

	register( controlURL, service_name ) {
		if( !service_name ){ throw new Error("Expected service_name, is falsy") }

		let deltaClient = new DeltaClient( controlURL )
		return deltaClient.register( service_name, this.port )
	}
}

class DeltaIngress {
	constructor( listening, mesh ){
		if( !listening ){ throw new Error("listening required") }
		if( !mesh ){ throw new Error("mesh required") }
		this.listening = listening
		this.targets = []
		this.mesh = mesh
	}

	target( name ) {
		this.targets.push( name )
	}

	requested( request, response ){
		if( this.targets.length == 0 ){
			response.statusCode = 503
			response.end()
		} else {
			console.log( "Finding targets", this.targets, request.url )
			let target = this.mesh.find_target( this.targets )
			let agent = new http.Agent({ keepAlive: false })
			console.log( "Requesting ", target, request.method, request.url )
			let req = http.request({
				host: 'localhost',
				method: request.method,
				port: target.port,
				path: request.url,
				timeout: 0.1,
				agent: agent
			}, ( targetResp ) => {
				console.log( "Response received" )
				response.statusCode = targetResp.statusCode
				targetResp.pipe( response )
			})
			req.on( 'error', ( problem ) => {
				console.log( "Error: ", problem )
			})
			req.end()
		}
	}
}

class DeltaTarget {
	constructor( port ) {
		if( !port ) { throw new Error("port may not be falsy"); }
		this.port = port
	}
}

class Delta {
	constructor() {
		this.intake = []
		this.targets = {}
	}

	/**
	 * Boots up the default ingress listener and attaches a handler for hearing control messages
	 */
	start() {
		this.control = express()
		this.control.use( morgan( 'short' ) )
		this.control.use( bodyParser.json() )
		this.control.post( '/v1/target/:name', ( req, resp ) => {
			this.targets[ req.params.name ] = new DeltaTarget( req.body.port )
			resp.statusCode = 201
			resp.end()
		})

		let promise = express_promise_listen_url( this.control, 0 )
		promise.then( (port) => { console.log("Delta running on port " + port) } ).done()
		return promise
	}

	ingress( port ) {
		let server = new http.Server( ( request, response ) => {
			console.log("Accepted request")
			ingress.requested( request, response )
		})
		let whenListening = http_promise_listen_url( server, 0 )
		var ingress = new DeltaIngress( whenListening, this )
		this.intake.push( ingress )
		return ingress
	}

	/*
 	 * TODO: Really a service mesh
 	 */
	find_target( target ){
		return this.targets[target];
	}
}

class SingleProxyHarness {
	setup(){
		let delta = this.delta = new Delta()
		let test = this.test = new SimpleTestService()

		let testServiceAddress = test.start()
		let deltaServiceAddress = delta.start()

		this.ingress = q.all( [ testServiceAddress, deltaServiceAddress ] )
			.spread( ( testPort, deltaPort ) => {
				console.log("test running", testPort)
				console.log("delta running", deltaPort)
				return test.register( deltaPort, "test-1" )
			})
			.then( () => {
				let ingress = delta.ingress( 0 )
				ingress.target( 'test-1' )
				return ingress.listening
			})
		return this.ingress
	}

	stop(){
		//TODO: implement stopping
	}
}

describe( "Proxying a single system", function() {
	before( function() {
		this.harness = new SingleProxyHarness()
		this.started = this.harness.setup()
		return this.started
	})
	after( function() { this.harness.stop() })

	describe( "For a GET 200 OK resource", function(){
		before( function(){
			let response_promise = this.started.then( ( ingressURL ) => {
				console.log( "Requesting ", ingressURL )
				let uri = ingressURL + "/proxy-test/received"
				return promise_get_request( uri )
			})

			this.response = response_promise
			this.headers = response_promise.then( ( result ) => { return result.headers } )
			this.body = response_promise.then( ( result ) => { return JSON.parse( result.body ) })
			return response_promise
		})

		it( "returns expected response entity", function() {
			return expect( this.body ).to.eventually.deep.equal( { passed: true } )
		})

		it( "returns correct response code", function() {
			return expect( this.headers.then( (r) => { return r.statusCode } ) ).to.eventually.deep.equal( 200 )
		})
	})

	describe( "For a POST 200 OK resource", function(){
		before( function(){
			let response_promise = this.started.then( ( ingressURL ) => {
				console.log( "Requesting ", ingressURL )
				let url = ingressURL + "/proxy-test/post-test"
				let body = { "shooting stars" : "moon" }
				return promise_post_json_request( url, body )
			})
			this.response = response_promise
			this.headers = response_promise.then( ( result ) => { return result.headers } )
			this.body = response_promise.then( ( result ) => { return result.body })
			return response_promise
		})

		it( "returns expected response entity", function() {
			return expect( this.body ).to.eventually.deep.equal( { passed: true } )
		})

		it( "returns correct response code", function() {
			return expect( this.headers.then( (r) => { return r.statusCode } ) ).to.become( 200 )
		})
	})
})
