//TODO: Move to junk-bucket
const {formattedConsoleLog} = require("./util-bunyan");
const {main} = require("junk-bucket");

async function doServiceStart( factory, logger ){
	const instance = await factory.launch(logger);

	function stopInstance(){
		instance.stop();
	}

	process.on("SIGINT", stopInstance);
	process.on("SIGTERM", stopInstance);
}

function service( name, factory ){
	const logger = formattedConsoleLog(name);
	main( () => doServiceStart(factory, logger), logger );
}

module.exports = {
	service
}