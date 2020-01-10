
function compileRules( rules ){
	const targetPoolRules = rules.map( (rule) => {
		switch(rule.type) {
			case "path.prefix":
				return ( defaultTarget, req ) => {
					const path = req.url;
					return path.startsWith(rule.is) ? rule.target : defaultTarget;
				};
			case "header.host":
				return ( defaultTarget, req ) => {
					return req.headers["host"] == rule.host ? rule.target : defaultTarget;
				};
			case "host.path-prefix":
				return (defaultTarget, req ) => {
					const host = req.headers["host"];
					const path = req.url;
					return ( host == rule.host && path.startsWith(rule.prefix) ) ? rule.target : defaultTarget;
				};
			default:
				//TODO: This should behandled in validation
				throw new Error("unsupported rule " + rule.type);
		}
	});
	return targetPoolRules;
}

function runRules( compiledRules, defaultTarget, request ){
	return compiledRules.reduce( function( target, rule ){
		return rule( target, request );
	}, defaultTarget);
}

module.exports = {
	compileRules,
	runRules
};
