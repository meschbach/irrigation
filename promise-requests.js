// External pacakges
const request = require( 'request' );
const requestPromise = require("request-promise-native");

// Internal Dependencies
const Future = require( "junk-bucket/future");

//TODO: Most of these should be replaced with request-as-promised

function post_json( url, body, auth ) {
	const result = new Future();
	request({
		method: 'POST',
		uri: url,
		json: body,
		headers: {
			"Authorization" : auth
		}
	}, (error, resp, body ) => {
		if( error ) { return result.reject(error); }
		result.accept({ headers: resp, body });
	});
	return result.promised;
}

function get_json_raw( url, auth ) {
	const result = new Future();
	request({
		method: 'GET',
		uri: url,
		json: true,
		headers: {
			"Authorization" : auth
		}
	}, (error, resp, body ) => {
		if( error ) { return result.reject(error); }
		result.accept({ headers: resp, body });
	})
	return result.promised;
}

function get_json( url, responseCode, authorization ) {
	return get_json_raw( url, authorization )
		.then( ( response ) => {
			let expectedCode = responseCode || 200
			let code = response.headers.statusCode
			if( code != expectedCode ) { throw new Error( "Expected " + expectedCode + " from " + url + ", got " + code ) }
			return response.body
		})
}

function put_json( url, body, auth ) {
	const result = new Future();
	request({
		method: 'PUT',
		uri: url,
		json: body,
		headers: {
			"Authorization" : auth
		}
	}, (error, resp, body ) => {
		if( error ) { return result.reject(error); }
		result.accept({ headers: resp, body });
	})
	return result.promised;
}

async function promise_get_request( url ) {
	const options = {
		method: "GET",
		url,
		simple: false,
		resolveWithFullResponse: true
	};
	const result = await requestPromise( options );
	return result;
}

module.exports = {
	get_request: promise_get_request,
	put_json,
	get_json,
	get_json_raw,
	post_json
};
