let q = require( 'q' )


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

module.exports = defer
