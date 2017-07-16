/*
 * Delta L7 HTTP Proxy
 *
 * Command line client
 */

function configureClient( args ){
	let DeltaClient = require( './client' )
	let client = new DeltaClient( args.service )
	return client
}

function statusCommand( args ){
	configureClient( args ).status()
		.done( ( status ) => { console.log( status ) }, ( error ) => { console.error( error ) } )
}

function ingress_list( args ){
	configureClient( args ).ingress_all().done(
		( ingress ) => { console.log( "Ingress points: ", ingress ) },
		( error ) => { console.error( "Encountered error: ", error ) }
	)
}

function ingress_intake( args ){
	configureClient( args ).ingress( args.port, args.handler ).done(
		( ingress ) => { console.log( { success: ingress } ) },
		( error ) => { console.error( { error } ) }
	)
}

let args = require( 'yargs' )
	.usage( "$0 <command>" )
	.option( 'service', { describe: 'URL to contact the service controller at', default: process.env.DELTA_ADDR || "http://localhost:9000" } )
	.command( "status", 'checks status of system', ( opts ) => { }, statusCommand )
	.command( "ingress", 'Operate or query ingress listeners', ( opts ) => {
		opts.command( "list", "list the listeners and bound locations", ( opts ) => { }, ingress_list )
		opts.command( "intake", "Binds a new ingress point", ( opts ) => {
			opts.option( "port", { description: "The port to bind to", default: 0 } )
			opts.option( "wire-proxy", { descriptioN: "Wire proxy handler to actually delegate the call", default: "hand" } )
		}, ingress_intake )
	}, showHelp )
	.help()

function showHelp(){
	args.showHelp();
}


let argv = args.argv

if( argv._.length == 0 ){ showHelp() }

