'use strict';
const path=require('node:path');
global.window=global;
global.document={};
try{require(path.join('..','js','ai-core.js'));}catch(error){console.error(JSON.stringify({loadError:error.message,stack:error.stack},null,2));process.exit(1);}
const api=global.ChappyAICore||global.window?.ChappyAICore;
if(!api){console.error('ChappyAICore was not exported');process.exit(1);}
const keys=Object.keys(api).sort();
const functions=keys.filter(k=>typeof api[k]==='function');
const values=Object.fromEntries(keys.filter(k=>typeof api[k]!=='function').map(k=>[k,typeof api[k]]));
console.log(JSON.stringify({keys,functions,values},null,2));
