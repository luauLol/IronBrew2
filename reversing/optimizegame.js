// Optimization step to remove redundant game variable assignments

import query from '../mods/query.js';
import { Clear } from '../mods/helper.js';

export default (output) => {
    console.log("Optimizing redundant game assignments...");
    
    const gameAliases = new Set();
    let removedCount = 0;
    
    // Find all assignments like: v2 = game
    for (const assign of query(output, "AssignmentStatement")) {
        if (assign.variables.length !== 1) continue;
        
        const variable = assign.variables[0];
        if (variable?.type !== "Identifier") continue;
        
        const init = assign.init?.[0];
        if (!init || init?.type !== "Identifier" || init.name !== "game") continue;
        
        // Skip if it's already 'game' itself
        if (variable.name === "game") continue;
        
        gameAliases.add(variable.name);
        removedCount++;
    }
    
    if (gameAliases.size === 0) {
        console.log("No redundant game assignments found");
        return output;
    }
    
    console.log(`Found ${gameAliases.size} redundant game variables:`, Array.from(gameAliases));
    
    // Replace all uses of these variables with 'game'
    let replacedCount = 0;
    for (const node of query(output, "Identifier")) {
        if (gameAliases.has(node.name)) {
            node.name = "game";
            replacedCount++;
        }
    }
    
    console.log(`Replaced ${replacedCount} occurrences with 'game'`);
    
    // Remove the redundant assignments (including self-assignments like game = game)
    for (let i = output.length - 1; i >= 0; i--) {
        const stat = output[i];
        if (!stat || stat.type !== "AssignmentStatement") continue;
        
        if (stat.variables.length === 1) {
            const variable = stat.variables[0];
            const init = stat.init?.[0];
            
            // Remove assignments where init is 'game' (both v2 = game and game = game)
            if (variable?.type === "Identifier" && 
                init?.type === "Identifier" && 
                init.name === "game") {
                output.splice(i, 1);
            }
        }
    }
    
    // Also remove any remaining self-assignments
    let selfAssignRemoved = 0;
    for (let i = output.length - 1; i >= 0; i--) {
        const stat = output[i];
        if (!stat || stat.type !== "AssignmentStatement") continue;
        
        if (stat.variables.length === 1) {
            const variable = stat.variables[0];
            const init = stat.init?.[0];
            
            // Remove self-assignments like: game = game
            if (variable?.type === "Identifier" && 
                init?.type === "Identifier" && 
                variable.name === init.name) {
                output.splice(i, 1);
                selfAssignRemoved++;
            }
        }
    }
    
    if (selfAssignRemoved > 0) {
        console.log(`Removed ${selfAssignRemoved} self-assignments`);
    }
    
    console.log(`Removed ${removedCount} redundant game assignments`);
    
    return output;
};
