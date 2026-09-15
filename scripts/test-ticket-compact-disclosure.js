const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const doc={getElementById:()=>null,querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){},body:{classList:{add(){}}},documentElement:{}};
const root={document:doc,setInterval(){},addEventListener(){}};
class Observer{observe(){}}
vm.runInNewContext(fs.readFileSync('js/final-mobile-ui.js','utf8'),{window:root,MutationObserver:Observer});
const api=root.ChappyFinalMobileUi;
const expand=n=>{let [a,b,c]=n.replace('全','123456').split('-');return [...a].flatMap(x=>[...b].flatMap(y=>[...c].filter(z=>new Set([x,y,z]).size===3).map(z=>`${x}-${y}-${z}`)));};
for(const tickets of [expand('12-345-全'),expand('4-23-全'),['1-2-3','1-3-4'],['1-2-3','1-2-4','1-2-3']]){
 const result=api.compactTickets(tickets);const actual=result.flatMap(x=>expand(x.notation));assert.deepEqual([...new Set(actual)].sort(),[...new Set(tickets)].sort());assert.equal(actual.length,new Set(tickets).size);
}
let seed=73;for(let n=0;n<120;n++){
 const tickets=expand('123456-123456-全').filter(()=>{seed=(seed*1664525+1013904223)>>>0;return seed%3===0;});
 const actual=api.compactTickets(tickets).flatMap(x=>expand(x.notation));assert.deepEqual(Array.from(actual).sort(),tickets.sort());
}
const pred={mainSheet:{tickets:['1-2-3','1-2-4'],coverTickets:['1-2-3','1-3-4'],flowFormations:[{notation:'1-23-全'}]},oddsByTicket:{'1-2-3':10,'1-2-4':20}};
const before=JSON.stringify(pred);const rows=api.buildPhotoStyleLines(pred);const actual=rows.flatMap(x=>Array.from(x.expandedTickets));assert.equal(new Set(actual).size,actual.length);assert.deepEqual(Array.from(actual).sort(),expand('1-23-全').sort());assert.equal(JSON.stringify(pred),before);
const html=api.buildBuySummary(pred);assert.match(html,/chappy-ticket-disclosure/);assert.match(html,/合成 6.7倍/);assert.doesNotMatch(html,/chappy-ticket-disclosure[^>]* open/);
console.log('exact compression, 120 sparse sets, cross-category deduplication, source immutability, closed details and composite odds: passed');
