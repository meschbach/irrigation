/*
 * Delta L7 Proxy System
 *
 * Express Extensions
 */

// Internal dependencies
const Future = require( 'junk-bucket/future' );

//TOOD: Can these extened the actual application instances?
/*
 * Promises the listening URL for the application service
 */
exports.promise_listening_url = function promise_express_listening_url( app, port ){
	const result = new Future();
	const listener = app.listen( port, () => {
		app.emit("listening", listener);
		let url = "http://localhost:" + listener.address().port
		result.accept( url );
	});
	//TODO: This whole function is janky and creates work around after work around...I need to fix this
	return result.promised;
}

