let bodyParser = require('body-parser');
let chai = require( 'chai' )
let chaiAsPromised = require("chai-as-promised");
chai.use(chaiAsPromised);

let expect = chai.expect
let express = require( 'express' )
let morgan = require( 'morgan' )

const Future = require("junk-bucket/future");

const {Irrigation} = require("./harness");

let delta = require( "../index" )
let promise_get_request = delta.promise_get_request
let promise_post_json_request = delta.promise_post_json_request

class SimpleTestService {
	start() {
		const future = new Future();

		this.app = express()
		this.app.use( morgan( "short" ) );
		this.app.use( bodyParser.json() );
		this.app.get( "/proxy-test/received", (request,response) => {
			response.json( {passed: true })
		});

		this.app.post( "/proxy-test/post-test", ( request, response ) => {
			let value = request.body['shooting stars'];
			response.json( {passed: value == "moon" } )
		});

		let listener = this.app.listen( 0, () => {
			let port = listener.address().port;
			this.port = port;
			future.accept( port )
		});
		this.appSocket = listener;

		return future.promised;
	}

	stop() {
		this.appSocket.close();
	}
}

[ 'hand', 'node-http-proxy' ].forEach( ( proxy_type ) => {
	describe( "Proxying a single system with " + proxy_type + " over HTTP", function() {
		before( async function() {
			this.system = new Irrigation();
			await this.system.start();
			this.client = this.system.client();

			this.subjectService = new SimpleTestService();
			const subjectPort = await this.subjectService.start();

			await this.client.createTargetPool("default");
			await this.client.registerTarget("default", "subject-under-test", "http://localhost:"+ subjectPort );
			const ingress = await this.client.ingress("test",0,proxy_type);
			await ingress.useDefaultPool("default");
			this.ingressURL = await ingress.address();
		})
		after( async function() {
			await this.system.stop();
			await this.subjectService.stop();
		})

		it( "shows the target as registered", async function() {
			const pool = await this.client.describeTargetPool("default");
			expect( pool.targetPool.targets ).to.have.key( "subject-under-test" );
		})

		describe( "For a GET 200 OK resource", function(){
			before( async function(){
				const ingressURL = this.ingressURL;
				this.response = await promise_get_request(  ingressURL + "/proxy-test/received" )
				this.body = this.response.body;
				this.headers = this.response.headers;
			})

			it( "returns expected response entity", function() {
				expect( JSON.parse( this.body ) ).to.deep.equal( { passed: true } )
			})

			it( "returns correct response code", function() {
				expect( this.response.statusCode ).to.deep.equal( 200 )
			})
		})

		describe( "For a POST 200 OK resource", function(){
			before( async function(){
				const url = this.ingressURL + "/proxy-test/post-test"
				const body = { "shooting stars" : "moon" }
				this.response = await promise_post_json_request( url, body )

				this.headers = this.response.headers
				this.body = this.response.body
			})

			it( "returns expected response entity", function() {
				return expect( this.body ).to.deep.equal( { passed: true } )
			})

			it( "returns correct response code", function() {
				expect( this.headers.statusCode ).to.deep.equal( 200 )
			})
		})
	})
})
