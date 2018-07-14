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

let delta = require( "../index" )
let promise_get_request = delta.promise_get_request
let promise_post_json_request = delta.promise_post_json_request

class SimpleTestService {
	start() {
		return delta.defer( (resolve, reject ) => {
			this.app = express()
			this.app.use( morgan( "short" ) )
			this.app.use( bodyParser.json() )
			this.app.get( "/proxy-test/received", (request,response) => {
				response.json( {passed: true })
			})

			this.app.post( "/proxy-test/post-test", ( request, response ) => {
				//console.log( "Proxy post JSON test header: ", request.get('Content-Type') )
				//console.log( "Proxy post JSON test body: ", request.body )
				let value = request.body['shooting stars']
				response.json( {passed: value == "moon" } )
			})

			let listener = this.app.listen( 0, () => {
				let port = listener.address().port
				this.port = port
				resolve( port )
			})
			this.appSocket = listener;
		});
	}

	stop() {
		this.appSocket.close();
	}

	register( controlURL, service_name ) {
		if( !service_name ){ throw new Error("Expected service_name, is falsy") }

		let deltaClient = new delta.DeltaClient( controlURL )
		return deltaClient.register( service_name, this.port )
	}
}

class SingleProxyHarness {
	constructor( wire_proxy_name ){
		this.wire_proxy_name = wire_proxy_name || "hand"
	}

	async setup(){
		let controlPlane = this.controlPlane = new delta.Delta()
		let test = this.test = new SimpleTestService()

		let testServiceAddress = await test.start()
		let deltaServiceAddress = await controlPlane.start()

		this.ingress = q.all( [ testServiceAddress, deltaServiceAddress ] )
			.spread( ( testPort, deltaPort ) => {
				console.log("test running", testPort)
				console.log("delta running", deltaPort)
				let test_registration = test.register( deltaPort, "test-1" )
				let ingress_creation = new delta.DeltaClient( deltaServiceAddress ).ingress()
				return q.all( [ test_registration, ingress_creation ] )
			})
			.spread( ( test_registration, ingress_resource ) => {
				return ingress_resource.addTarget( 'test-1' ).then( () => {
					return ingress_resource.address()
				})
			})
		return this.ingress
	}

	stop(){
		this.test.stop();
		this.controlPlane.stop();
	}
}

[ 'hand', 'node-http-proxy' ].forEach( ( proxy_type ) => {
	describe( "Proxying a single system with " + proxy_type, function() {
		before( async function() {
			this.harness = new SingleProxyHarness( proxy_type )
			this.started = this.harness.setup()
			return await this.started
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
})
