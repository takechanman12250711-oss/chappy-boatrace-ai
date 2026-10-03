"use strict";const assert=require("assert");const api=require("../js/escape-role-partner-shadow");
const base={tickets:[{ticket:"1-2-3",category:"本線",priorityScore:95},{ticket:"1-4-3",category:"本線",priorityScore:92},{ticket:"1-3-4",category:"押さえ",priorityScore:70}],candidateOutcomes:[{ticket:"1-4-6",priorityScore:88,roleLabels:[{position:1,boatNo:1,role:"head",structured:true},{position:2,boatNo:4,role:"hold",structured:true},{position:3,boatNo:6,role:"pickup",structured:true}]}]};
const r=api.build(base);assert.equal(r.eligible,true);assert.deepEqual(r.shadowTickets,["1-2-3","1-4-3","1-4-6"]);assert.equal(r.replacement.removedTicket,"1-3-4");assert.equal(r.shadowTickets.includes("1-2-3"),true);
const noThird=JSON.parse(JSON.stringify(base));noThird.candidateOutcomes[0].roleLabels=noThird.candidateOutcomes[0].roleLabels.filter(x=>x.position!==3);assert.equal(api.build(noThird).eligible,false);
const weaker=JSON.parse(JSON.stringify(base));weaker.candidateOutcomes[0].priorityScore=60;assert.equal(api.build(weaker).eligible,false);
console.log("escape role partner shadow tests: ok");
