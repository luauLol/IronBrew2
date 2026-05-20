import beautify from '../mods/beautifier.js';
import { is, print, Clear, fixString } from '../mods/helper.js';

import simpleAst from '../mods/simple-ast.js';
import query from '../mods/query.js';

const simple = new Set(["NumericLiteral", "NilLiteral", "StringLiteral", "CallExpression", "IndexExpression"])
const isSimple = (type) => simple.has(type);

export default async (output, extraDos, funcIdentifiers, state) => {
	// GENIUS IDEA:
	// All strings in the script are already encrypted,
	// so if we find ANY call like:
	// a("string", number)
	// that's a decryption!
	// as there cant be normal strings, they're all encrypted :)

	// fix table indexes here aswell

	const encrypted = []

	const encryptionKeys = {
		param_mul_45: null,
		param_mul_8: null,
		param_add_45: null,

		secret_key_8: null,
	};

	let step = 0,
		stopE = false,
		stopC = false,
		decryptor

	const firstFunc = (body) => {
		let step = 0;
		for (let stat of body) {
			if (stat.type == "WhileStatement") stat = stat.body.find((a) => a.type);
			else if (stat.type == "IfStatement") stat = stat.clauses[0].body.find((a) => a.type)

			if (
				step == 0 &&
				stat.type == "AssignmentStatement" &&
				is(stat.init, [
					{
						type: "BinaryExpression",
						/*right: {
                        type: "NumericLiteral",
                        value: 35184372088832
                    },*/
						left: {
							type: "BinaryExpression",
						},
						operator: "%",
					},
				])
			) {
				// we can get param_mul_45 & param_add_45 here
				// (regtable[upvalues[2]] * param_mul_45 + param_add_45) % 35184372088832.0;

				const expr = stat.init[0].left;
				if (expr.operator == "+") {
					encryptionKeys.param_add_45 = expr.right.raw;
					encryptionKeys.param_mul_45 = expr.left.right.raw;
					step++;
				}
			} else if (
				step == 1 &&
				stat.type == "AssignmentStatement" &&
				is(stat.init, [
					{
						type: "BinaryExpression",
						operator: "%",
						right: {
							type: "NumericLiteral",
							value: 257,
						},
					},
				])
			) {
				const expr = stat.init[0].left;

				if (expr.operator == "*") {
					encryptionKeys.param_mul_8 = expr.right.raw;
					stopC = true;
					step++;
				}
			} else if (step == 1 && stat.type == "RepeatStatement") {
				encryptionKeys.param_mul_8 = stat.body.find(
					(a) => a.type,
				).init[0].left.right.raw;
				stopC = true
			}
		}
		return step;
	};

	if (extraDos.length) {
		const encryption = extraDos[extraDos.length - 2].body;
		for (let stat of encryption) {
			if (stat.type == "FunctionDeclaration") {
				if (
					is(stat, {
						isLocal: true,
						body: [
							{
								type: "IfStatement",
								clauses: [
									{
										type: "IfClause",
										condition: {
											type: "BinaryExpression",
										},
									},
								],
							},
						],
					})
				) {
					// params 8 .. 45 here
					const body = stat.body[0].clauses[0].body;
					firstFunc(body);
				} else if (
					is(stat, {
						isLocal: false,
						body: [
							{
								type: "LocalStatement",
							},
							{
								type: "IfStatement",
							},
						],
					})
				) {
					Clear(stat.body[stat.body.length - 1]); // remove the ReturnStatement
					stat.body = stat.body.filter((a) => a.type);
					if (isDecryptor(stat)) decryptor = stat.identifier;
				}
			}
		}
	}

	function isDecryptor(func) {
		if (encryptionKeys.secret_key_8) return;
		if (!func.parameters?.length) return;

		let IfStat = func.body[func.body.length - 1];
		if (IfStat.type == "ReturnStatement")
			IfStat = func.body[func.body.length - 2];

		let last = [];
		let sawDecryptShape = false;

		const isWeird = is(IfStat, {
			type: "IfStatement",
			clauses: [
				{},
				{
					type: "ElseClause",
				},
			],
		}); // this isnt src code

		const elsebody = isWeird ? IfStat.clauses[1].body : func.body;

		if (isWeird) {
			for (const pre of func.body) {
				if (pre === IfStat) break;
				if (pre?.type == "AssignmentStatement" || pre?.type == "LocalStatement")
					last.push(pre);
			}
		}

		const hasIdentifier = (node, name) => {
			if (!node || typeof node != "object") return false;
			if (node.type == "Identifier" && node.name == name) return true;

			for (const key in node) {
				const value = node[key];
				if (Array.isArray(value)) {
					for (const child of value) {
						if (hasIdentifier(child, name)) return true;
					}
				} else if (value && typeof value == "object") {
					if (hasIdentifier(value, name)) return true;
				}
			}

			return false;
		};

		const evalNumeric = (node) => {
			if (!node) return null;
			if (node.type == "NumericLiteral") return Number(node.value ?? node.raw);

			if (node.type == "UnaryExpression" && node.operator == "-") {
				const n = evalNumeric(node.argument);
				return n == null ? null : -n;
			}

			if (node.type == "BinaryExpression") {
				const l = evalNumeric(node.left);
				const r = evalNumeric(node.right);
				if (l == null || r == null) return null;

				switch (node.operator) {
					case "+": return l + r;
					case "-": return l - r;
					case "*": return l * r;
					case "/": return r == 0 ? null : l / r;
					case "%": return r == 0 ? null : l % r;
					case "^": return Math.pow(l, r);
					default: return null;
				}
			}

			return null;
		};

		const resolveNumericInit = (name, visited = new Set()) => {
			if (!name || visited.has(name)) return null;
			visited.add(name);

			for (let i = last.length - 1; i >= 0; i--) {
				const stat = last[i];
				if (!(stat.type == "AssignmentStatement" || stat.type == "LocalStatement"))
					continue;

				const vars = stat.variables || [];
				const inits = stat.init || [];

				for (let vi = 0; vi < vars.length; vi++) {
					if (vars[vi]?.name != name) continue;

					const initNode = inits[vi] || inits[inits.length - 1];
					if (!initNode) return null;

					if (initNode.type == "Identifier") {
						return resolveNumericInit(initNode.name, visited);
					}

					const value = evalNumeric(initNode);
					if (value == null || !Number.isFinite(value)) return null;
					return String(Math.trunc(value));
				}
			}

			return null;
		};

		const hasStringByteCall = (node) => {
			if (!node || typeof node != "object") return false;

			if (node.type == "CallExpression") {
				const base = node.base;
				if (
					(base?.type == "MemberExpression" && base.base?.name == "string" && base.identifier?.name == "byte") ||
					(base?.type == "IndexExpression" && base.base?.name == "string" && base.index?.name == "byte")
				) return true;
			}

			for (const key in node) {
				const value = node[key];
				if (Array.isArray(value)) {
					for (const child of value) {
						if (hasStringByteCall(child)) return true;
					}
				} else if (value && typeof value == "object") {
					if (hasStringByteCall(value)) return true;
				}
			}

			return false;
		};

		const collectNumericLiterals = (node, out = []) => {
			if (!node || typeof node != "object") return out;
			if (node.type == "NumericLiteral") out.push(Number(node.value ?? node.raw));

			for (const key in node) {
				const value = node[key];
				if (Array.isArray(value)) {
					for (const child of value) collectNumericLiterals(child, out);
				} else if (value && typeof value == "object") {
					collectNumericLiterals(value, out);
				}
			}

			return out;
		};

		const findHardcodedSecret = (node) => {
			if (!node || typeof node != "object") return null;

			if (node.type == "BinaryExpression" && node.operator == "%") {
				let modValue = evalNumeric(node.right);
				if (modValue == null && node.right?.type == "Identifier") {
					const resolvedMod = resolveNumericInit(node.right.name);
					if (resolvedMod != null) modValue = Number(resolvedMod);
				}

				if (modValue == 256 && hasStringByteCall(node.left)) {
					const candidates = collectNumericLiterals(node.left)
						.filter((n) => Number.isFinite(n) && n >= 0 && n <= 255);
					if (candidates.length) return String(Math.trunc(candidates[candidates.length - 1]));
				}
			}

			for (const key in node) {
				const value = node[key];
				if (Array.isArray(value)) {
					for (const child of value) {
						const found = findHardcodedSecret(child);
						if (found != null) return found;
					}
				} else if (value && typeof value == "object") {
					const found = findHardcodedSecret(value);
					if (found != null) return found;
				}
			}

			return null;
		};

		for (let stat of elsebody) {
			if (!stat?.type) continue;

			const hardcoded = findHardcodedSecret(stat);
			if (hardcoded != null) {
				encryptionKeys.secret_key_8 = hardcoded;
				stopE = true;
				sawDecryptShape = true;
				break;
			}

			if (stat.type == "ForNumericStatement" || stat.type == "WhileStatement") {
				for (let i = 0; i < stat.body.length; i++) {
					const loopStat = stat.body[i];
					if (loopStat?.type != "AssignmentStatement") continue;

					const target = loopStat.variables?.[0];
					const init = loopStat.init?.[0];
					if (!target || target.type != "Identifier" || !init) continue;

					if (init.type != "BinaryExpression" || init.operator != "%") continue;

					let modValue = evalNumeric(init.right);
					if (modValue == null && init.right?.type == "Identifier") {
						const resolvedMod = resolveNumericInit(init.right.name);
						if (resolvedMod != null) modValue = Number(resolvedMod);
					}

					if (modValue != 256) continue;

					if (!hasIdentifier(init.left, target.name)) continue;
					sawDecryptShape = true;

					const resolved = resolveNumericInit(target.name);
					if (!resolved) continue;

					encryptionKeys.secret_key_8 = resolved;
					stopE = true;
					break;
				}

				if (stopE) break;
			}
			if (stat.type == "AssignmentStatement" || stat.type == "LocalStatement")
				last.push(stat);
		}
		return sawDecryptShape;
	}

	for (let func of query(output, "FunctionDeclaration")) {
		if (stopE && stopC) break;

		const ImportantFunc = func.body.find((a) =>
			is(a, {
				type: "IfStatement",
				clauses: [
					{
						type: "IfClause",
						condition: {
							type: "BinaryExpression",
						},
					},
				],
			}),
		);

		if (ImportantFunc && step != 2) {
			// we can find all param_... from here
			const body = ImportantFunc.clauses[0].body;
			//print(beautify(body))
			step = firstFunc(body);
			if (step == 2)
				Clear(func)
			//step = firstFunc(body) || step
		} else {
			const isDecrypt = isDecryptor(func);

			if (!isDecrypt) continue;

			decryptor = func.identifier;
			Clear(func)
			//Clear(stat) // u can do ts to remove junk
		}
	}

	let code = []

	if (encryptionKeys.param_add_45 && !encryptionKeys.secret_key_8) {
		// it's most likely inlined, look for it!
		for (let func of query(output, {
			type: "CallExpression",
			base: {
				type: "FunctionDeclaration",
			},
		})) {
			if (isDecryptor(func.base)) {
				print("decryptor is inlined");
				decryptor = func.base;
				break;
			}
		}
	}

	print("Encryption Keys:", encryptionKeys);

	if (!encryptionKeys.param_mul_45) throw new Error("Encrypt strings is off");

	//print("Encryption Keys:", encryptionKeys)

	for (let key in encryptionKeys) {
		if (!encryptionKeys[key])
			throw new Error(`UNABLE TO FIND DECRYPTION KEY ${key}`);
		print("FOUND DECRYPTION KEY", key, encryptionKeys[key]);
		code.push(`${key} = ${encryptionKeys[key]};`);
	}

	if (!decryptor) return console.error("UNABLE TO FIND DECRYPTOR!!");

	const solveNumeric = (node) => {
		if (!node) return null;
		if (node.type == "NumericLiteral")
			return Number(node.value ?? node.raw);

		if (node.type == "UnaryExpression" && node.operator == "-") {
			const n = solveNumeric(node.argument);
			return n == null ? null : -n;
		}

		if (node.type == "BinaryExpression") {
			const l = solveNumeric(node.left);
			const r = solveNumeric(node.right);
			if (l == null || r == null) return null;

			switch (node.operator) {
				case "+": return l + r;
				case "-": return l - r;
				case "*": return l * r;
				case "/": return r == 0 ? null : l / r;
				case "%": return r == 0 ? null : l % r;
				case "^": return Math.pow(l, r);
				default: return null;
			}
		}

		return null;
	};

	const copyLiteral = (node) => {
		if (!node) return null;

		if (node.type == "StringLiteral") {
			const value = node.value ?? "";
			return {
				type: "StringLiteral",
				value,
				raw: node.raw ?? `"${fixString(value, '"', false)}"`,
			};
		}

		if (node.type == "NumericLiteral") {
			const value = Number(node.value ?? node.raw);
			if (!Number.isFinite(value)) return null;
			return {
				type: "NumericLiteral",
				value,
				raw: node.raw ?? String(value),
			};
		}

		return null;
	};

	const rewriteCallsWithKnownTableSlots = (stat, slots, scalars) => {
		const resolveSlot = (node, expectedType) => {
			if (!node) return null;
			if (node.type == expectedType) return copyLiteral(node);

			if (node.type == "Identifier") {
				const lit = scalars.get(node.name);
				if (lit && lit.type == expectedType)
					return copyLiteral(lit);
			}

			if (expectedType == "NumericLiteral") {
				const n = solveNumeric(node);
				if (n != null && Number.isFinite(n))
					return { type: "NumericLiteral", value: n, raw: String(Math.trunc(n)) };

				if (node.type == "Identifier") {
					const lit = scalars.get(node.name);
					if (lit?.type == "NumericLiteral")
						return copyLiteral(lit);
				}
			}

			if (node.type != "IndexExpression" || node.base?.type != "Identifier") return null;

			const idx = solveNumeric(node.index);
			if (idx == null) return null;

			const lit = slots.get(`${node.base.name}:${idx}`);
			if (!lit || lit.type != expectedType) return null;

			return copyLiteral(lit);
		};

		const walk = (node) => {
			if (!node || typeof node != "object") return;

			if (node.type == "CallExpression" && Array.isArray(node.arguments) && node.arguments.length >= 2) {
				const enc = resolveSlot(node.arguments[0], "StringLiteral");
				const seed = resolveSlot(node.arguments[1], "NumericLiteral");

				if (enc) node.arguments[0] = enc;
				if (seed) node.arguments[1] = seed;
			}

			for (const key in node) {
				const value = node[key];
				if (Array.isArray(value)) {
					for (const child of value) walk(child);
				} else if (value && typeof value == "object") {
					walk(value);
				}
			}
		};

		walk(stat);
	};

	const applySlotAssignments = (stat, slots, scalars) => {
		if (!(stat.type == "AssignmentStatement" || stat.type == "LocalStatement")) return;

		const vars = stat.variables || [];
		const inits = stat.init || [];

		for (let i = 0; i < vars.length; i++) {
			const variable = vars[i];
			if (variable?.type != "IndexExpression" || variable.base?.type != "Identifier") continue;

			const idx = solveNumeric(variable.index);
			if (idx == null) continue;

			const key = `${variable.base.name}:${idx}`;
			const initNode = inits[i] || inits[inits.length - 1];
			if (!initNode) {
				slots.delete(key);
				continue;
			}

			let lit = copyLiteral(initNode);

			if (!lit && initNode.type == "Identifier") {
				const fromScalar = scalars.get(initNode.name);
				if (fromScalar) lit = copyLiteral(fromScalar);
			}

			if (!lit && initNode.type == "IndexExpression" && initNode.base?.type == "Identifier") {
				const fromIdx = solveNumeric(initNode.index);
				if (fromIdx != null) {
					const fromSlot = slots.get(`${initNode.base.name}:${fromIdx}`);
					if (fromSlot) lit = copyLiteral(fromSlot);
				}
			}

			if (!lit) {
				const n = solveNumeric(initNode);
				if (n != null && Number.isFinite(n)) {
					lit = {
						type: "NumericLiteral",
						value: n,
						raw: String(Math.trunc(n)),
					};
				}
			}

			if (lit && (lit.type == "StringLiteral" || lit.type == "NumericLiteral"))
				slots.set(key, lit);
			else
				slots.delete(key);
		}
	};

	const applyScalarAssignments = (stat, scalars, slots) => {
		if (!(stat.type == "AssignmentStatement" || stat.type == "LocalStatement")) return;

		const vars = stat.variables || [];
		const inits = stat.init || [];

		for (let i = 0; i < vars.length; i++) {
			const variable = vars[i];
			if (variable?.type != "Identifier") continue;

			const initNode = inits[i] || inits[inits.length - 1];
			if (!initNode) {
				scalars.delete(variable.name);
				continue;
			}

			let lit = copyLiteral(initNode);

			if (!lit && initNode.type == "Identifier") {
				const fromScalar = scalars.get(initNode.name);
				if (fromScalar) lit = copyLiteral(fromScalar);
			}

			if (!lit && initNode.type == "IndexExpression" && initNode.base?.type == "Identifier") {
				const fromIdx = solveNumeric(initNode.index);
				if (fromIdx != null) {
					const fromSlot = slots.get(`${initNode.base.name}:${fromIdx}`);
					if (fromSlot) lit = copyLiteral(fromSlot);
				}
			}

			if (lit && (lit.type == "StringLiteral" || lit.type == "NumericLiteral")) {
				scalars.set(variable.name, lit);
				continue;
			}

			const n = solveNumeric(initNode);
			if (n != null && Number.isFinite(n)) {
				scalars.set(variable.name, {
					type: "NumericLiteral",
					value: n,
					raw: String(Math.trunc(n)),
				});
			} else {
				scalars.delete(variable.name);
			}
		}
	};

	const processBlock = (body, inheritedSlots = new Map(), inheritedScalars = new Map()) => {
		const slots = new Map(inheritedSlots);
		const scalars = new Map(inheritedScalars);

		for (const stat of body || []) {
			if (!stat?.type) continue;

			rewriteCallsWithKnownTableSlots(stat, slots, scalars);
			applySlotAssignments(stat, slots, scalars);
			applyScalarAssignments(stat, scalars, slots);

			if (stat.type == "IfStatement") {
				for (const clause of stat.clauses || [])
					processBlock(clause.body, slots, scalars);
			} else if (
				stat.type == "WhileStatement" ||
				stat.type == "RepeatStatement" ||
				stat.type == "DoStatement" ||
				stat.type == "ForNumericStatement" ||
				stat.type == "ForGenericStatement" ||
				stat.type == "FunctionDeclaration"
			) {
				processBlock(stat.body, slots, scalars);
			}
		}

		return slots;
	};

	processBlock(output);

	/*for (let call of query(output, {
		type: "CallExpression",
		arguments: [
			{
				type: "StringLiteral",
			},
			{
				type: "NumericLiteral",
			},
		],
	}))
		encrypted.push(call);

	print("Strings table:",stringsTable)*/

	const collectEncrypted = () => {
		const localEncrypted = [];
		const literalByTableIndex = new Map();

		for (const stat of query(output, "AssignmentStatement")) {
			const vars = stat.variables || [];
			const inits = stat.init || [];

			for (let i = 0; i < vars.length; i++) {
				const variable = vars[i];
				if (variable?.type != "IndexExpression" || variable.base?.type != "Identifier")
					continue;

				const idx = solveNumeric(variable.index);
				if (idx == null) continue;

				const initNode = inits[i] || inits[inits.length - 1];
				if (!initNode || (initNode.type != "StringLiteral" && initNode.type != "NumericLiteral"))
					continue;

				literalByTableIndex.set(`${variable.base.name}:${idx}`, initNode);
			}
		}

		const resolveLiteralArg = (arg, expectedType) => {
			if (!arg) return null;

			if (arg.type == expectedType) return copyLiteral(arg);

			if (arg.type == "IndexExpression" && arg.base?.type == "Identifier") {
				const idx = solveNumeric(arg.index);
				if (idx == null) return null;

				const lit = literalByTableIndex.get(`${arg.base.name}:${idx}`);
				if (!lit || lit.type != expectedType) return null;

				return copyLiteral(lit);
			}

			if (expectedType == "NumericLiteral") {
				const n = solveNumeric(arg);
				if (n == null || !Number.isFinite(n)) return null;
				return {
					type: "NumericLiteral",
					value: n,
					raw: String(Math.trunc(n)),
				};
			}

			return null;
		};

		const seenEncrypted = new Set();
		const pushEncrypted = (node) => {
			if (!node) return;
			if (seenEncrypted.has(node)) return;

			let call;
			if (node.type == "IndexExpression" && node.index?.type == "CallExpression")
				call = node.index;
			else if (node.type == "CallExpression")
				call = node;

			if (!call || !Array.isArray(call.arguments) || call.arguments.length < 2) return;

			const enc = resolveLiteralArg(call.arguments[0], "StringLiteral");
			const seed = resolveLiteralArg(call.arguments[1], "NumericLiteral");
			if (!enc || !seed) return;

			seenEncrypted.add(node);
			localEncrypted.push({ node, enc, seed });
		};

		for (const call of query(output, {
			type: "CallExpression",
			arguments: [
				{ type: "StringLiteral" },
				{},
			],
		})) pushEncrypted(call);

		for (const idx of query(output, {
			type: "IndexExpression",
			index: {
				type: "CallExpression",
				arguments: [
					{ type: "StringLiteral" },
					{},
				],
			},
		})) pushEncrypted(idx);

		return localEncrypted;
	};

	/*let stringDef = "strings={"

    for (let x of encrypted) {
        const [enc, seed] = x.arguments //x.index.arguments
        stringDef += `{${enc.raw},${seed.raw}};`
    }

    code.push(stringDef + "}")*/

	const codePreamble = code.join("\n");
	const fromBytes = (bytes) => {
		let out = "";
		for (const byte of bytes)
			out += String.fromCharCode((Number(byte) || 0) & 0xff);
		return out;
	};

	const fromHex = (hex) => {
		if (typeof hex != "string" || (hex.length % 2) != 0)
			return "";

		let out = "";
		for (let i = 0; i < hex.length; i += 2) {
			const byte = Number.parseInt(hex.substring(i, i + 2), 16);
			if (!Number.isFinite(byte))
				return "";

			out += String.fromCharCode(byte & 0xff);
		}

		return out;
	};

	const runBatch = async (batch) => {
		const Table = simpleAst.emptyTable();

		for (const x of batch) {
			Table.fields.push({
				type: "TableValue",
				value: simpleAst.fieldsTable([x.enc, x.seed]),
			});
		}

		const StringsDef = {
			type: "AssignmentStatement",
			variables: [{ type: "Identifier", name: "strings" }],
			init: [Table],
		};

		let codeStr =
			codePreamble +
			"\n" +
			beautify([StringsDef]) +
		`\ndo
	local floor = math.floor
	local random = math.random;
	local remove = table.remove;
	local char = string.char;
	local state_45 = 0
	local state_8 = 2
	local digits = {}
	local charmap = {};
	local i = 0;

	local nums = {};
	for i = 1, 256 do
		nums[i] = i;
	end

	repeat
		local idx = random(1, #nums);
		local n = remove(nums, idx);
		charmap[n] = char(n - 1);
	until #nums == 0;

	local prev_values = {}
	local function get_next_pseudo_random_byte()
		if #prev_values == 0 then
			state_45 = (state_45 * param_mul_45 + param_add_45) % 35184372088832
			repeat
				state_8 = state_8 * param_mul_8 % 257
			until state_8 ~= 1
			local r = state_8 % 32
			local n = floor(state_45 / 2 ^ (13 - (state_8 - r) / 32)) % 2 ^ 32 / 2 ^ r
			local rnd = floor(n % 1 * 2 ^ 32) + floor(n)
			local low_16 = rnd % 65536
			local high_16 = (rnd - low_16) / 65536
			local b1 = low_16 % 256
			local b2 = (low_16 - b1) / 256
			local b3 = high_16 % 256
			local b4 = (high_16 - b3) / 256
			prev_values = { b1, b2, b3, b4 }
		end
		return table.remove(prev_values)
	end

	local realStrings = {};
	local STRINGS = setmetatable({}, {
		__index = realStrings;
		__metatable = nil;
	});
  	local function DECRYPT(str, seed)
		local realStringsLocal = realStrings;
		if(realStringsLocal[seed]) then else
			prev_values = {};
			local chars = charmap;
			state_45 = seed % 35184372088832
			state_8 = seed % 255 + 2
			local len = string.len(str);
			realStringsLocal[seed] = "";
			local prevVal = secret_key_8;
			for i=1, len do
				prevVal = (string.byte(str, i) + get_next_pseudo_random_byte() + prevVal) % 256
				realStringsLocal[seed] = realStringsLocal[seed] .. chars[prevVal + 1];
			end
		end
		return seed;
	end
    local function DECRYPT_PACKED(idx)
        local v = strings[idx]
        if not v then
            return 0
        end

        local value = STRINGS[DECRYPT(v[1], v[2])]
        return #value, string.byte(value, 1, #value)
    end

    return DECRYPT_PACKED
end`;

		const Loader = state.loadstring(codeStr);
		if (typeof Loader == "string") throw new Error(Loader);

		const DecryptPacked = (await Loader())[0];
		if (typeof DecryptPacked != "function")
			throw new Error("UNABLE TO LOAD DECRYPTOR FUNCTION");

		let replaced = 0;
		for (let i = 0; i < batch.length; i++) {
			const encoded = batch[i].node;
			const packed = await DecryptPacked(i + 1);

			if (!Array.isArray(packed)) continue;

			const length = Number(packed[0]) || 0;
			const val = fromBytes(packed.slice(1, 1 + length));

			Clear(encoded);

			encoded.type = "StringLiteral";
			encoded.value = val;
			encoded.raw = `"${fixString(val, '"', false)}"`;
			replaced++;
		}

		return replaced;
	};

	let totalReplaced = 0;
	let hadAnyCandidates = false;
	for (let pass = 0; pass < 6; pass++) {
		const batch = collectEncrypted();
		if (!batch.length) break;

		hadAnyCandidates = true;
		const replaced = await runBatch(batch);
		totalReplaced += replaced;

		if (replaced == 0) break;
	}

	if (!hadAnyCandidates) {
		console.error("ENCRYPTED STRINGS LIST IS EMPTY");
		return output;
	}

	// Runtime-assisted fallback for expressions that stayed dynamic after static+iterative passes
	const unresolved = [];
	for (const idx of query(output, {
		type: "IndexExpression",
		index: {
			type: "CallExpression",
			arguments: [{}, {}],
		},
	})) {
		if (idx.base?.type != "Identifier") continue;
		if (idx.index.base?.type != "Identifier") continue;

		const expr = beautify(idx, { expr: true });
		if (typeof expr != "string" || !expr.length) continue;

		unresolved.push({ node: idx, expr });
	}

	if (unresolved.length) {
		try {
			const bodyNoTailReturn = output.filter((stat, i) =>
				!(i == output.length - 1 && stat?.type == "ReturnStatement")
			);

			const evalLines = [];
			for (let i = 0; i < unresolved.length; i++) {
				evalLines.push(`do\n\tlocal __ok, __val = pcall(function() return ${unresolved[i].expr} end)\n\tif __ok and type(__val) == \"string\" then\n\t\t__results[${i + 1}] = __pack_hex(__val)\n\telse\n\t\t__results[${i + 1}] = false\n\tend\nend`);
			}

			const runtimeCode = `
local __dummy
__dummy = setmetatable({}, {
	__index = function() return __dummy end,
	__newindex = function() end,
	__call = function() return __dummy end,
	__tostring = function() return "" end,
	__len = function() return 0 end,
	__concat = function(a, b) return tostring(a) .. tostring(b) end,
	__add = function() return 0 end,
	__sub = function() return 0 end,
	__mul = function() return 0 end,
	__div = function() return 0 end,
	__mod = function() return 0 end,
	__pow = function() return 0 end,
	__eq = function() return false end,
	__lt = function() return false end,
	__le = function() return false end,
})

local __base = {
	math = math,
	string = string,
	table = table,
	ipairs = ipairs,
	pairs = pairs,
	next = next,
	pcall = pcall,
	xpcall = xpcall,
	type = type,
	tonumber = tonumber,
	tostring = tostring,
	select = select,
	setmetatable = setmetatable,
	getmetatable = getmetatable,
	unpack = unpack or table.unpack,
	error = function() return nil end,
	print = function() end,
	warn = function() end,
}

local __env = setmetatable({}, {
	__index = function(_, k)
		local v = __base[k]
		if v ~= nil then return v end
		return __dummy
	end,
	__newindex = function(t, k, v)
		rawset(t, k, v)
	end,
})

setfenv(1, __env)
` + beautify(bodyNoTailReturn) + `
local function __pack_hex(value)
	local out = table.create(#value)
	for i = 1, #value do
		out[i] = string.format("%02x", string.byte(value, i))
	end
	return table.concat(out)
end

local __results = {}
` + evalLines.join("\n") + `
return table.unpack(__results)
`;

			const RuntimeLoader = state.loadstring(runtimeCode);
			if (typeof RuntimeLoader != "string") {
				const runtimeResults = await RuntimeLoader();

				for (let i = 0; i < unresolved.length; i++) {
					const packedHex = runtimeResults?.[i];
					if (typeof packedHex != "string") continue;

					const value = fromHex(packedHex);
					if (!value.length && packedHex.length) continue;

					Clear(unresolved[i].node);
					unresolved[i].node.type = "StringLiteral";
					unresolved[i].node.value = value;
					unresolved[i].node.raw = `"${fixString(value, '"', false)}"`;
				}
			}
		} catch (err) {
			console.error("runtime-assisted decrypt fallback failed", err);
		}
	}

	/*for (let i of query(output, {
		type: "IndexExpression",
		base: stringsTable,
	})) {
		const idx = i.index;
		Clear(i);
		for (let j in idx) i[j] = idx[j];
	}*/


	return output;
};
