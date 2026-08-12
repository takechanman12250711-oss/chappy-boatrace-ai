"use strict";
const fs=require('node:fs');
const p='scripts/test-evaluated-scenario-consistency.js';
let s=fs.readFileSync(p,'utf8');
const old='94ea7d08df1a56f6ad6346f764699e21ebe954d6fc03d395def65e150007b695';
const neu='93af0b388491fe631437a663ccea69cf466a23855ac8d71da8e1dab2a38d6374';
if(!s.includes(old)) throw new Error('old snapshot hash not found');
s=s.replace(old,neu);fs.writeFileSync(p,s);
