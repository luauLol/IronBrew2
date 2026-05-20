// Semantic variable renaming based on code context

import query from '../mods/query.js';
import { Clear, fixString } from '../mods/helper.js';

const serviceNames = {
    "Players": "players",
    "Workspace": "workspace",
    "RunService": "runService",
    "UserInputService": "userInputService",
    "ReplicatedStorage": "replicatedStorage",
    "TweenService": "tweenService",
    "Lighting": "lighting",
    "HttpService": "httpService",
    "CollectionService": "collectionService",
    "TeleportService": "teleportService",
    "Teams": "teams",
    "MarketplaceService": "marketplaceService",
    "RbxAnalyticsService": "rbxAnalyticsService",
    "VirtualInputManager": "virtualInputManager",
    "CoreGui": "coreGui",
    "StarterGui": "starterGui",
    "GuiService": "guiService",
};

const getStringLiteralValue = (node) => {
    if (node?.type === "StringLiteral") {
        return node.value;
    }
    // Handle function calls that return strings (like LPH_ENCSTR)
    if (node?.type === "CallExpression") {
        const args = node.arguments;
        if (args && args.length > 0) {
            const firstArg = args[0];
            if (firstArg?.type === "StringLiteral") {
                return firstArg.value;
            }
        }
    }
    return null;
};

const getServiceName = (node) => {
    // Look for pattern: x.GetService(y, "ServiceName") or x.GetService(y, LPH_ENCSTR("ServiceName"))
    if (node?.type !== "CallExpression") return null;
    
    const base = node.base;
    if (base?.type !== "MemberExpression" && base?.type !== "CallExpression") return null;
    
    // Check if it's GetService
    const identifier = base?.identifier || base?.base?.identifier;
    if (!identifier || identifier.name !== "GetService") return null;
    
    // Get the service name argument
    const args = node.arguments;
    if (!args || args.length < 1) return null;
    
    // The service name might be the second argument if first is the game object
    const serviceNameArg = args.length >= 2 ? args[1] : args[0];
    
    return getStringLiteralValue(serviceNameArg);
};

export default (output) => {
    console.log("Applying semantic variable renaming...");
    
    const renames = new Map();
    let renameCount = 0;
    
    // Find assignments like: r24 = cloneref(game.GetService(game, "Players"))
    for (const assign of query(output, "AssignmentStatement")) {
        if (assign.variables.length !== 1) continue;
        
        const variable = assign.variables[0];
        if (variable?.type !== "Identifier") continue;
        
        // Skip if already renamed or not a register variable
        if (!/^[rv]\d+$/.test(variable.name)) continue;
        
        const init = assign.init?.[0];
        if (!init) continue;
        
        // Check if it's a cloneref call
        if (init?.type === "CallExpression" && init.base?.name === "cloneref") {
            const innerArg = init.arguments?.[0];
            const serviceName = getServiceName(innerArg);
            
            if (serviceName && serviceNames[serviceName]) {
                const newName = serviceNames[serviceName];
                renames.set(variable.name, newName);
                renameCount++;
                console.log(`  ${variable.name} -> ${newName} (from GetService("${serviceName}"))`);
            }
        }
        // Also check direct GetService calls without cloneref
        else {
            const serviceName = getServiceName(init);
            if (serviceName && serviceNames[serviceName]) {
                const newName = serviceNames[serviceName];
                renames.set(variable.name, newName);
                renameCount++;
                console.log(`  ${variable.name} -> ${newName} (from GetService("${serviceName}"))`);
            }
        }
    }
    
    // Apply renames throughout the AST
    if (renames.size > 0) {
        const renameIdentifier = (node) => {
            if (node?.type === "Identifier" && renames.has(node.name)) {
                node.name = renames.get(node.name);
            }
        };
        
        for (const node of query(output, "Identifier")) {
            renameIdentifier(node);
        }
    }
    
    console.log(`Renamed ${renameCount} variables semantically`);
    
    return output;
};
