import {
    is,
    protectEnv,
    Clear,
    fixString,
    clone
} from '../mods/helper.js'

import query from '../mods/query.js';
import beautify from '../mods/beautifier.js'
const print = console.log

export default async (ast, output, state, opts) => {
    if (!state)
        throw new Error("`state` was not passed to constarray step!")

    //const start = performance.now()
    const Format = {
        type: "LocalStatement",
        init: [{
            type: "TableConstructorExpression"
        }]
    }

    const IterStats = query(ast.body, { // WrapInFunction
        type: "CallExpression",
        base: {
            type: "FunctionDeclaration"
        },
        arguments: [{
            type: "VarargLiteral"
        }]
    })[0]?.base?.body ?? ast.body // the DoStatements pretty much

    if (!IterStats) {
        print("Const array is probably off")
        return output
    }

    let SliceEnd = -1,
        DoStats = 0;

    let ConstArray, ConstArrayIdx, getConst;
    for (let idx in IterStats) {
        const i = IterStats[idx]
        if (is(i, Format)) {
            ConstArray = i, ConstArrayIdx = Number(idx);
            //break
        } else if (i?.type == "DoStatement" && ConstArray) {
            if (++DoStats > 1) {
                SliceEnd = idx // - 1
                break
            }
        }
    }

    if (!ConstArray) {
        print("Const array is off")
        return output
    }

    const arrayIdentifier = ConstArray.variables[0].name

    for (let i = ConstArrayIdx; i < IterStats.length; i++) {
        const Next = IterStats[i]

        if (Next?.type == "FunctionDeclaration") {
            getConst = Next
            break
        }
    }

    const Cloned = ast.body.slice(0, -1).concat(IterStats.slice(0, SliceEnd))
    const getConstIdentifier = getConst.identifier.name

    print("Getting constants..")

    const CodeToRun = protectEnv + beautify({
        body: Cloned
    }) + `
local __nativeGetConst = ${getConstIdentifier}
local function __nativeGetConstPacked(idx)
    local value = __nativeGetConst(idx)
    if type(value) ~= "string" then
        return false, value
    end

    return true, #value, string.byte(value, 1, #value)
end

return __nativeGetConstPacked`

    const ConstantsReturn = await (state.loadstring(CodeToRun)())

    //const Constants = ConstantsReturn[1]
    const nativeGetConst = ConstantsReturn.splice(0, 1)[0]

    //print("Constants:",Constants)

    if (!getConst) throw new Error("no `getConst` function!")

    const solve = (stat) =>
        (stat?.type == "UnaryExpression" && stat.operator == "-") ? -solve(stat.argument) :
        (stat?.type == "NumericLiteral") ? stat.value : undefined;

    const results = query(ast, "CallExpression").filter((result) =>
        result.base.type == "Identifier" && result.base.name == getConstIdentifier
    );

    const fromBytes = (bytes) => {
        let out = ""
        for (const byte of bytes)
            out += String.fromCharCode((Number(byte) || 0) & 0xff)
        return out
    }

    const fromHex = (hex) => {
        if (typeof hex != "string" || (hex.length % 2) != 0)
            return ""

        let out = ""
        for (let i = 0; i < hex.length; i += 2) {
            const byte = Number.parseInt(hex.substring(i, i + 2), 16)
            if (!Number.isFinite(byte))
                return ""

            out += String.fromCharCode(byte)
        }

        return out
    }

    const callsByIndex = new Map()

    for (const result of results) {
        const solved = solve(result.arguments[0])
        if (solved == undefined) continue

        if (!callsByIndex.has(solved)) callsByIndex.set(solved, [])
        callsByIndex.get(solved).push(result)
    }

    const packedByIndex = new Map()
    const uniqueIndices = [...callsByIndex.keys()]
    const CHUNK_SIZE = 128

    for (let i = 0; i < uniqueIndices.length; i += CHUNK_SIZE) {
        const chunk = uniqueIndices.slice(i, i + CHUNK_SIZE)
        const packedChunk = await Promise.all(chunk.map((idx) => nativeGetConst(idx)))

        for (let ci = 0; ci < chunk.length; ci++) {
            packedByIndex.set(chunk[ci], packedChunk[ci])
        }
    }

    for (const [idx, calls] of callsByIndex) {
        const packed = packedByIndex.get(idx)
        if (!Array.isArray(packed) || packed[0] !== true) continue

        const length = Number(packed[1]) || 0
        if (length < 0) continue

        const constant = fromBytes(packed.slice(2, 2 + length))
        const replacement = {
            type: "StringLiteral",
            value: constant,
            raw: `"${fixString(constant, '"', false)}"`
        }

        for (const call of calls)
            Object.assign(call, replacement)
    }

    const FirstField = ConstArray.init[0].fields[0]?.value;

    if (
        (FirstField?.type == "StringLiteral" && FirstField.raw.substring(0, 1) == "`" && !opts.fork)
        || opts.fork == "25ms"
    ) { // uses interpolated strings, probably 25ms..
        const Important = IterStats.slice(SliceEnd, IterStats.length - 1)
        //const Encryptor = IterStats[IterStats.length - 2]
        //if (Encryptor)
        //    output.push(Encryptor)

        opts.fork = "25ms"
        opts.iterStats = IterStats//[IterStats.length - 2].body

        // find the decryption func

        //const Func = IterStats.splice(SliceEnd, IterStats.length - 1).find((a) => a.type == "LocalStatement")
        const Func = Important.find((a) => a.type == "LocalStatement" && a.init[0]?.type == "FunctionDeclaration")

        if (Func) {
            //const Cloned = {}
            //Cloned.type = "ReturnStatement"
            //Cloned.arguments = [Func.init[0]]

            //const Unpacker = (await (state.loadstring(beautify([Cloned]))()))[0]
            const Calls = query(ast, {
                    base: Func.variables[0]
                })
                .reduce((acc, a) => {
                    const arg =
                        a.type == "TableCallExpression" ? a.arguments :
                        a.type == "CallExpression" ? a.arguments[0] :
                        null;

                    if (arg?.type == "TableConstructorExpression")
                        acc.push({
                            arg,
                            stat: a
                        });

                    return acc;
                }, []);

            // since single calling for every table may be slow and since the tables are still friggin broken in luau-web, we'll use a different approach
            // get every single value at once!

            const Tabled = {
                type: "TableConstructorExpression",
                fields: Calls.map((a) => ({
                    type: "TableValue",
                    value: a.arg
                }))
            }

            const TableCode = beautify(Tabled, {
                expr: true
            })

            const FuncIdent = Func.variables[0].name

            const Code = `setfenv(1, { ipairs = ipairs, table = table, string = string, type = type })
${beautify([Func])}
local function __packString(value)
    if type(value) ~= "string" then
        return nil
    end

    local out = table.create(#value)
    for j = 1, #value do
        out[j] = string.format("%02x", string.byte(value, j))
    end

    return table.concat(out)
end

local Table = ${TableCode}
local Results = table.create(#Table)
for i, Val in ipairs(Table) do
    Results[i] = __packString(${FuncIdent}(Val))
end
return table.unpack(Results)
`

            let Results = [];
            try {
                Results = await (state.loadstring(Code)())
            } catch (err) {
                console.error("errored while running 25ms string fixer",err)
            }

            let i = 0;

            for (let { stat } of Calls) {
                const packed = Results[i]
                i++

                if (typeof packed != "string")
                    continue

                const r = fromHex(packed)

                Clear(stat)

                stat.type = "StringLiteral"
                stat.value = r
                stat.raw = `"${fixString(r, '"', false)}"`
            }
        }
    }

    print("Got constants")

    //console.log("fetched constants in", performance.now() - start, "ms")

    return output;
}

