'use strict';
// Synthetic unit-test fixture only; never send this to an article queue.
const { fixture } = require('./note-independent-monitor-fixture');
const { STAGES, INPUT_VERSION } = require('./independent-role-selector.cjs');
function sample() {
  const b = fixture();
  const references = [{sourceSha256:b.monitor.sources[0].sha256, quote:b.monitor.sources[0].text}];
  const note = () => ({reason:'SYNTHETIC role evidence, not a real observation', references});
  const scenario = {type:'escape',primaryActor:1,...note()};
  b.monitor.decisionEvidence = {version:'independent-monitor-decision-v1',origin:'independent-human',
    raceKey:b.record.raceKey,kind:'escape',decidedAt:b.monitor.confirmedAt,
    stages:STAGES.map(stage=>({stage,status:'observed',...note()})),scenario,
    candidates:b.monitor.tickets.map((t,i)=>({ticket:t.ticket,priority:i+1,decision:'selected',...note(),
      roles:t.ticket.split('-').map((boat,p)=>({boat:Number(boat),position:p+1,...note()}))}))};
  b.monitor.ruleInput = {version:INPUT_VERSION,raceKey:b.record.raceKey,kind:'escape',decidedAt:b.monitor.confirmedAt,
    scenario,limit:2,
    roles:[1,2,3].map(position=>({position,boats:[1,2,3,4,5,6].map(boat=>({boat,
      eligible:position===1 ? boat===1 : position===2 ? boat===2 : [3,4,5].includes(boat),...note()}))})),
    stages:STAGES.map((stage,i)=>({stage,status:'observed',roles:[1,2,3].map(position=>({position,...note(),
      groups:i===0 ? [[1],[2],[3],[4],[5],[6]] : [[1,2,3,4,5,6]]}))}))};
  return b;
}
module.exports={sample};
