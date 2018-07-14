// External pacakges
let request = require( 'request' )

// Internal Dependencies
const Future = require( "junk-bucket/future");

//TODO: Most of these should be replaced with request-as-promised

exports.post_json = ( url, body ) => {
	const result = new Future();
	request({
		method: 'POST',
		uri: url,
		json: body
	}, (error, resp, body ) => {
		if( error ) { return result.reject(error); }
		result.accept({ headers: resp, body });
	});
	return result.promised;
}

exports.get_json_raw = ( url ) => {
	const result = new Future();
	request({
		method: 'GET',
		uri: url,
		json: true
	}, (error, resp, body ) => {
		if( error ) { return result.reject(error); }
		result.accept({ headers: resp, body });
	})
	return result.promised;
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
