let express = require("express")
let application = express()

let listener = application.listen( 0, () => {
	console.log( listener.address().port )
})
