
async function ingressList( req, resp ) {
	const {irrigation} = req;
	const ingressPoints = await irrigation.list_ingress();
	resp.json({ ingress: ingressPoints })
}

async function createIngress( req, resp ){
	const {irrigation} = req;

	// Validate message
	const body = req.body;
	let port = body.port || 0;
	let wire_proxy = body.wire_proxy || "hand";
	let wait = body.wait || true;
	let name = body.name || "default";
	const scheme = body.scheme || "http";
	const certificateName = body.certificateName;

	if( port == 0 && !wait ){
		resp.statusCode = 422;
		return resp.json( { errors: ["Must wait on unspecified ports"] } )
	}
	if( !["http", "https"].includes(scheme) ){
		resp.statusCode = 422;
		return resp.json( { errors: {scheme: ["must be either http or https"]}} );
	}
	if( scheme == "https" && !certificateName ) {
		resp.statusCode = 422;
		return resp.json( { errors: {certificateName: ["Must be defined"]}} );
	}

	if( irrigation.delta.ingress_controllers[name] ){
		resp.statusCode = 409;
		return resp.json( { errors: ["Ingress by that name already exists"] } );
	}
	irrigation.logger.info("Validated request; looks reasonable",{wait});

	// Perform operation
	try {
		let ingress;
		irrigation.logger.info("Creating ingress with target scheme ", {scheme, body: req.body});
		if (scheme == "https") {
			irrigation.logger.info("Certificate name ", certificateName);
			ingress = await irrigation.delta.secureIngress(name, port, wire_proxy, certificateName)
		} else {
			ingress = await irrigation.delta.ingress(name, port, wire_proxy)
		}
		let completion = wait ? ingress.listening : Promise.resolve(port);
		const boundPort = await completion;

		resp.statusCode = 201;
		//let scheme = req.get( "scheme" )
		resp.json({_self: "http://" + req.get("host") + "/v1/ingress/" + name})
	}catch(problem){
		irrigation.logger.error("Failed to bind to port", problem);
		resp.statusCode = 409;
		resp.json({ok:false, problem: problem.message});
	}
}

module.exports = {
	ingressList,
	createIngress
}
