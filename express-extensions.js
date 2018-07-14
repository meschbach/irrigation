/*
 * Delta L7 Proxy System
 *
 * Express Extensions
 */

// Internal dependencies
const Future = require( 'junk-bucket/Future' );

//TOOD: Can these extened the actual application instances?
/*
 * Promises the listening URL for the application service
 */
exports.promise_listening_url = function promise_express_listening_url( app, port ){
	const result = new Future();
	const listener = app.listen( port, () => {
		let url = "http://localhost:" + listener.address().port
		result.resolve( url );
	});
	return result.promised;
}

