
let DeltaClient = require( '../client' );
const {formattedConsoleLog} = require("junk-bucket/logging-bunyan");

function configureClient( args, logger ){
	let client = new DeltaClient( args.service, logger );

	if( args.bearer ){
		client.useBearerToken(args.bearer);
	}
	return client
}

function onInvocation( fn ){

	return function( args ){
		const logger = formattedConsoleLog("cli");
		const client = configureClient( args, logger );

		try {
			fn(args, logger, client)
				.then(function (result) {
					const text = JSON.stringify(result);
					process.stdout.write(text);
				}).catch(function (problem) {
					logger.error("Unable to complete operation because: ", problem)
				});
		}catch(e){
			logger.error("Unable to complete operation because: ", problem);
		}
	}
}

module.exports = {
	onInvocation
};
