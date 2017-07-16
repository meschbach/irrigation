// External pacakges
let request = require( 'request' )

// Internal Dependencies
let defer = require( './defer' )

exports.post_json = ( url, body ) => {
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

exports.get_json_raw = ( url ) => {
	return defer( ( resolve, reject ) => {
		request({
			method: 'GET',
			uri: url,
			json: true
		}, (error, resp, body ) => {
			if( error ) { return reject( error ) }
			resolve( { headers: resp, body } )
		})
	})
}

exports.get_json = ( url, responseCode ) => {
	return exports.get_json_raw( url )
		.then( ( response ) => {
			let expectedCode = responseCode || 200
			let code = response.headers.statusCode
			if( code != expectedCode ) { throw new Error( "Expected " + expectedCode + " from " + url + ", got " + code ) }
			return response.body
		})
}

