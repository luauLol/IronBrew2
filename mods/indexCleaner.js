import {
    fixRaw,
    isWeird,
    Clear
} from './helper.js'

import query from './query.js'

export default (output, Env) => {
    for (let idx of query(output, "IndexExpression"/*, { dontTouch: new Set() }*/)) {
			const key = idx.index,
				oldbase = idx.base,
				isEnv = oldbase.type == "Identifier" && (oldbase.name == Env.name || oldbase.name == "Env");

			if (key.type == "StringLiteral") {
				const value = fixRaw(key);

				if (!isWeird(value)) {
					Clear(idx);

					if (isEnv) {
						((idx.type = "Identifier"), (idx.name = value));
						continue;
					}

					((idx.type = "MemberExpression"),
						(idx.indexer = "."),
						(idx.base = oldbase),
						(idx.identifier = {
							type: "Identifier",
							name: value,
						}));
				}
			}
		}
}