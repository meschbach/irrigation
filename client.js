
// Internal dependencies
let promise_requests = require( './promise-requests' )

class DeltaClient {
	constructor( controlURL ) {
		this.url = controlURL
	}

	register( service_name , port ) {
		if( !service_name ){ throw new Error("Expected service_name, is falsy") }
		if( !port && port != 0 ){ throw new Error("Expected port, got falsy") }

		return promise_requests.post_json( this.url + "/v1/target/" + service_name, { port: port } )
			.then( ( result ) => {
				if( result.headers.statusCode != 201 ){ throw new Error( result.headers.statusCode + " != 201" ) }
				return true
			})
	}
}

module.exports = DeltaClient
