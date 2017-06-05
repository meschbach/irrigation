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
		if( !service_name ){ throw "Expected service_name, is falsy" }

		return defer( ( resolve, reject ) => {
			console.log(" Registering delta client ", this.url)
			request({
				method: 'POST',
				uri: this.url + "/v1/target/" + service_name,
				json: {port: port}
			}, (error, result) => {
				if( error ) { return reject( error ) }
				if( result.statusCode != 200 ){ return reject( new Error( result.statusCode + " != 200" ) ); }
				return resolve(true)
			})
		})
	}
}

class SimpleTestService {
	start() {
		return defer( (resolve, reject ) => {
			this.app = express()
			this.app.get( "/proxy-test/received", (request,response) => {
				response.json( {passed: true })
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
		return deltaClient.register( service_name, "http://localhost:" + this.port )
	}
}

class DeltaIngress {
	constructor( listening ){
		this.listening = listening
		this.targets = []
	}

	registerTarget( target, port ){
		target.push({ port })
	}

	requested( request, response ){
		if( this.targets.length == 0 ){
			response.statusCode = 503
			response.end()
		} else {
			let target = this.targets[0]
			let agent = new http.Agent({ keepAlive: false })
			http.request({
				host: 'localhost',
				method: request.method,
				port: target.port,
				path: request.path,
				timeout: 100,
				agent
			}, ( targetResp ) => {
				console.log( targetResp )
			})
		}
	}
}

class Delta {
	constructor() {
		this.intake = []
	}

	/**
	 * Boots up the default ingress listener and attaches a handler for hearing control messages
	 */
	start() {
		this.control = express()
		this.control.use( morgan( 'short' ) )
		this.control.use( bodyParser.json() )
		this.control.post( '/v1/target/:name', ( req, resp ) => {
			let intake = this.intake[0]
			intake.registerTarget( req.params.name, req.body.port )
		})

		let promise = express_promise_listen_url( this.control, 0 )
		promise.then( (port) => { console.log("Delta running on port " + port) } ).done()
		return promise
	}

	ingress( port ) {
		let server = new http.Server( ( request, response ) => {
			ingress.requested( request, response )
		})
		let whenListening = http_promise_listen_url( server, 0 )
		var ingress = new DeltaIngress( whenListening )
		console.log( "=== Ingress: ", ingress )
		this.intake.push( ingress )
		return ingress
	}
}

describe( "Given a simple service to proxy", () => {
	it( "properly proxies the service", () => {
		let test = new SimpleTestService()
		let delta = new Delta()

		return q.all([ test.start(), delta.start() ])
			.spread( ( testPort, deltaPort ) => {
				console.log("test running", testPort)
				console.log("delta running", deltaPort)
				return test.register( deltaPort, "test-1" )
			})
			.then( () => {
				let ingress = delta.ingress( 0 )
				return ingress.listening
			}).then( ( ingressURL ) => {
				console.log( "Requesting ", ingressURL )
				return defer( ( resolve, reject ) => {
					request( ingressURL + "/proxy-test/received", (err, resp, body) => {
							if( err ){ return reject( err ) }
							if( resp.statusCode != 200 ){ return reject( new Error( resp.statusCode + " != 200 OK" ) ) ; }
							expect( () => { body.passed } ).to.be.true
					})
				})
			})
	})
})

