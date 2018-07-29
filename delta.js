/*
 * Delta L7 HTTP Proxy
 *
 * Command line client
 */

const fs = require( "fs" );

function configureClient( args ){
	let DeltaClient = require( './client' )
	let client = new DeltaClient( args.service )
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
	configureClient( args ).ingress( args.port, args.handler ).then(
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

let args = require( 'yargs' )
	.usage( "$0 <command>" )
	.option( 'service', { describe: 'URL to contact the service controller at', default: process.env.DELTA_ADDR || "http://localhost:9000" } )
	.command( "status", 'checks status of system', ( opts ) => { }, statusCommand )
	.command( "ingress", 'Operate or query ingress listeners', ( opts ) => {
		opts.command( "list", "list the listeners and bound locations", ( opts ) => { }, ingress_list )
		opts.command( "intake", "Binds a new ingress point", ( opts ) => {
			opts.option( "port", { description: "The port to bind to", default: 0 } )
			opts.option( "wire-proxy", { description: "Wire proxy handler to actually delegate the call", default: "hand" } )
		}, ingress_intake )
		opts.command( "secure-intake", "Binds a new ingress point using TLS", ( opts ) => {
			opts.option( "name", { description: "Ingress name", default: "default" } )
			opts.option( "port", { description: "The port to bind to", default: 0 } )
			opts.option( "wire-proxy", { description: "Wire proxy handler to actually delegate the call", default: "hand" } )
			opts.option( "certificate",  { description: "Name of the certificate to use for the ingress", required: true } )
		}, secure_ingress_intake )
	}, showHelp )
	.command( "certificate", "Manages certificates within the internal store", configureCertificateCommmand, showHelp)
	.help()

function showHelp(){
	args.showHelp();
}


let argv = args.argv

if( argv._.length == 0 ){ showHelp() }

