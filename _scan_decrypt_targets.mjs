import fs from 'fs';
import { parse } from './mods/luaparse.js';
import query from './mods/query.js';
import beautify from './mods/beautifier.js';

const src = fs.readFileSync('./out.lua', 'utf8');
const ast = parse(src);

const callLike = query(ast, {
  type: 'CallExpression',
  arguments: [
    { type: 'StringLiteral' },
    { type: 'NumericLiteral' },
  ],
});

const indexLike = query(ast, {
  type: 'IndexExpression',
  index: {
    type: 'CallExpression',
    arguments: [
      { type: 'StringLiteral' },
      { type: 'NumericLiteral' },
    ],
  },
});

console.log('callLike:', callLike.length);
console.log('indexLike:', indexLike.length);

for (let i = 0; i < Math.min(20, callLike.length); i++) {
  console.log('\nCALL', i + 1);
  console.log(beautify([{
    type: 'CallStatement',
    expression: callLike[i],
  }]));
}

for (let i = 0; i < Math.min(20, indexLike.length); i++) {
  console.log('\nINDEX', i + 1);
  console.log(beautify([{
    type: 'CallStatement',
    expression: {
      type: 'CallExpression',
      base: { type: 'Identifier', name: 'print' },
      arguments: [indexLike[i]],
    },
  }]));
}
