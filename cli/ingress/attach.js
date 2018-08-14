const {onInvocation} = require("../core");

module.exports = {
	command: "attach <ingress> <sni> <cert>",
	describe: "Reply with a specific certificate when requested via SNI",
	builder: function (yargs) {
		yargs.positional("ingress", {description: "ingress point to attach to"})
		yargs.positional("sni", {description: "server name to respond to"})
		yargs.positional("cert", {description: "certificate name to provide"})
	},
	handler: onInvocation( async (args, logger, client) => {
		const ingressName = args["ingress"];
		const sni = args["sni"];
		const cert = args["cert"];

		const ingress = await client.describeIngress(ingressName);
		return await ingress.attachSNI( sni, cert );
	})
}
