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
