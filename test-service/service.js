let express = require("express")
let application = express()

application.get( "/proxy-test/received", (request,response) => {
	response.json( {passed: true })
})

let listener = application.listen( 0, () => {
	console.log( "http://localhost:" +listener.address().port )
})
