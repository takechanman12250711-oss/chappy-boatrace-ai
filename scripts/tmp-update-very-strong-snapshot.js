"use strict";
const fs=require('node:fs');
const p='scripts/test-evaluated-scenario-consistency.js';
let s=fs.readFileSync(p,'utf8');
const oldHash='03b24fda4aa4226a6e4283b86ac9655dbc5caf378de738d4ca53908ca2218c63';
const newHash='1e5167b38bd49f88580ad5bf43318d4b080cad8275fd7bc950e8c0811ca65dbb';
if(!s.includes(oldHash))throw new Error('expected old snapshot hash not found');
s=s.replace(oldHash,newHash);
fs.writeFileSync(p,s);
