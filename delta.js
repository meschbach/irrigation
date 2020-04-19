/*
 * Delta L7 HTTP Proxy
 *
 * Command line client
 */

const fs = require( "fs" );
const {formattedConsoleLog} = require("junk-bucket/logging-bunyan");

function configureClient( args ){
	let DeltaClient = require( './client' )
	const logger = formattedConsoleLog("cli");
	let client = new DeltaClient( args.service, logger )

	if( args.bearer ){
		client.useBearerToken(args.bearer);
	}
	return client
}

function statusCommand( args ){
	configureClient( args ).status()
		.then( ( status ) => { console.log( status ) }, ( error ) => { console.error( error ) } )
}

function ingress_list( args ){
	configureClient( args ).ingress_all().then(
		( ingress ) => { console.log( "Ingress points: ", ingress ) },
		( error ) => { console.error( "Encountered error: ", error ) }
	)
}

function ingress_intake( args ){
	configureClient( args ).ingress( args.name, args.port, args.handler ).then(
		( ingress ) => { console.log( { success: ingress } ) },
		( error ) => { console.error( { error } ) }
	)
}

function secure_ingress_intake( args ){
	configureClient( args ).secureIngress( args.name, args.port, args.handler, args.certificate ).then(
		( ingress ) => { console.log( { success: ingress } ) },
		( error ) => { console.error( { error } ) }
	)
}

function listCertificates(args) {
	configureClient( args ).listCertificates().then(
		(certificates) => { console.log(certificates) },
		(error) => { console.error(error) })
}

function uploadCertificate(args) {
	const certificateContents = fs.readFileSync( args.certificate, "utf8" );
	const keyContents = fs.readFileSync( args.key, "utf8"  );

	configureClient( args ).uploadCertificate( args.name, certificateContents, keyContents ).then(
		(certificates) => { console.log(certificates) },
		(error) => { console.error(error) })
}

function configureCertificateCommmand( yargs ){
	yargs.command( "upload", "Uploads the given certificate", (opts) => {
		opts.option("name", {description: "Name for the certificate", required: true})
		opts.option("certificate", {description: "Certificate file to be upload", required: true})
		opts.option("key", {description: "Key file to be utilized", required: true})
	}, uploadCertificate)
	yargs.command( "list", "lists the certificates which have been uploaded", (opts) => {}, listCertificates)
}

function configureTargetCommands( yargs ){
	yargs.command("list", "Lists the pools", (y) => {}, (args) => {
		configureClient( args ).listTargetPools()
			.then( (pools) => { console.log(pools) },
			(error) => { console.error(error) })
	});
	yargs.command("create <pool>", "Creates a given pool", (y) => {
		y.positional("pool", {description: "The name to of the new target pool", default: "default"})
	}, (args) => {
		configureClient( args ).createTargetPool(args.pool)
			.then( (pools) => { console.log(pools) },
				(error) => { console.error(error) })
	});
	yargs.command("describe <pool>", "Creates a given pool", (y) => {
		y.positional("pool", {description: "The name to of the new target pool", default: "default"})
	}, (args) => {
		configureClient( args ).describeTargetPool(args.pool)
			.then( (response) => { console.log(response.targetPool) },
				(error) => { console.error(error) })
	});

	yargs.command("register <pool> <name> <uri>", "Registers a given target in a pool", (y) => {
		y.positional("pool", {description: "The name to of the new target pool (ie: default)"})
		y.positional("name", {description: "The name to of the new target pool (ie: default-8080)"})
		y.positional("uri", {description: "The name to of the new target pool (ie: http://localhost:8080)"})
	}, (args) => {
		configureClient( args ).registerTarget(args.pool, args.name, args.uri)
			.then( (results) => { console.log(results) },
				(error) => { console.error(error) })
	});

	yargs.command("unregister <pool> <name>", "Removes a given target from a pool", (y) => {
		y.positional("pool", {description: "The name to of the new target pool (ie: default)"})
		y.positional("name", {description: "The name to of the new target pool (ie: default-8080)"})
	}, (args) => {
		configureClient( args )
			.removeTarget( args.pool, args.name )
			.then( (results) => { console.log(results) },
				(error) => { console.error(error) })
	});

	yargs.demandCommand();
}

function deleteIngress( args ){
	configureClient( args )
		.deleteIngress( args.name )
		.then( (results) => console.log(results), (error) => console.error("Error: ", error ) );
}

function describeIngress( args ){
	async function perform(client,name){
		const ingress = await client.describeIngress(name);
		const addr = await ingress.address();
		const rules = await ingress.describeRules();
		return {name, addr, rules};
	}

	perform(configureClient( args ), args.name).then( (results) => console.log(results), (error) => console.error("Error: ", error ) );
}

function resetIngressRules( args ){
	async function perform(client,name){
		const ingress = await client.describeIngress(name);
		ingress.applyRules([{type:"header.host", host: "bad-exmaple.invalid", target:"default"}]);
	}

	perform(configureClient( args ), args.name).then( (results) => console.log(results), (error) => console.error("Error: ", error ) );
}


let args = require( 'yargs' )
	.usage( "$0 <command>" )
	.option( 'bearer', { describe: "Bearer token to be attached to the client" } )
	.option( 'service', { describe: 'URL to contact the service controller at', default: process.env.DELTA_ADDR || "http://localhost:9000" } )
	.command( "status", 'checks status of system', ( opts ) => { }, statusCommand )
	.command( "ingress", 'Operate or query ingress listeners', ( opts ) => {
		opts.command( "list", "list the listeners and bound locations", ( opts ) => { }, ingress_list )
		opts.command( "intake", "Binds a new ingress point", ( opts ) => {
			opts.option( "port", { description: "The port to bind to", default: 0 } )
			opts.option( "wire-proxy", { description: "Wire proxy handler to actually delegate the call", default: "hand" } )
			opts.option( "name", {description: "Name of the ingress", default:"default"})
		}, ingress_intake );
		opts.command( "secure-intake", "Binds a new ingress point using TLS", ( opts ) => {
			opts.option( "name", { description: "Ingress name", default: "default" } )
			opts.option( "port", { description: "The port to bind to", default: 0 } )
			opts.option( "wire-proxy", { description: "Wire proxy handler to actually delegate the call", default: "hand" } )
			opts.option( "certificate",  { description: "Name of the certificate to use for the ingress", required: true } )
		}, secure_ingress_intake );
		opts.command( "delete <name>", "Deletes the given ingress point", function(opts){
			opts.positional("name", {description: "name of intake to be deleted"});
		}, deleteIngress );
		opts.command( "describe <name>", "Describe the particular ingress point", function(opts){
			opts.positional("name", {description: "name of ingress"});
		}, describeIngress );
		opts.command( "reset-rules <name>", "Resets rules for the given ingress point", function(opts){
			opts.positional("name", {description: "name of ingress"});
		}, resetIngressRules );
		opts.commandDir(__dirname + "/cli/ingress");
		opts.demandCommand()
	}, showHelp )
	.command( "targets", "Modifies target pools", configureTargetCommands, showHelp )
	.command( "certificate", "Manages certificates within the internal store", configureCertificateCommmand, showHelp)
	.demandCommand()
	.help();

function showHelp(){
	args.showHelp();
}


let argv = args.argv;
