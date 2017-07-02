/*
 * Delta L7 Proxy System
 *
 * Express Extensions
 */

// Internal dependencies
let defer = require( './defer' )

//TOOD: Can these extened the actual application instances?
/*
 * Promises the listening URL for the application service
 */
exports.promise_listening_url = function promise_express_listening_url( app, port ){
	return defer( ( resolve, reject ) => {
		let listener = app.listen( port, () => {
			let url = "http://localhost:" + listener.address().port
			resolve( url )
		})
	})
}

