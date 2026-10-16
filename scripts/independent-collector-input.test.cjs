'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { captureSources, observeSources } = require('../api/_official-source-capture');
const { callWithIndependentOfficialInput } = require('./independent-collector-input.cjs');
const source = fs.readFileSync(require.resolve('./collect-predictions.js'), 'utf8');
const callSource = source.slice(source.indexOf('function callApi('), source.indexOf('\nfunction wait('));
const evaluateSource = source.slice(source.indexOf('async function evaluateTargets('), source.indexOf('\nfunction upsertByRaceKey('));
const at = '2026-01-01T01:00:00.000Z';
const now = () => Date.parse(at);
const target = { date: '20260101', jcd: '01', raceNo: 1, deadlineAt: '2026-01-01T01:10:00Z' };
const original = '<html>公式原文と改行をそのまま保持\r\n締切予定時刻 10:10 10:40 11:10 11:40 12:10 12:40 13:10 13:40 14:10 14:40 15:10 15:40</html>';
function response() {
  return { ok: true, source: 'boatrace-official', date: target.date, stadiumCode: '01', raceNo: 1, fetchedAt: at,
    entries: Array.from({length:6}, (_,i)=>({boat:i+1,exhibition:{displayTime:6.7+i/100}})),
    startExhibition: Array.from({length:6}, (_,i)=>({boat:i+1,course:i+1,st:i/100,marker:i===0?'F':'',mappingSource:'official-start-image'})),
    historyContext: { ordinaryOnly: true } };
}
function harness({ capture = true, missingModule = false, error = null } = {}) {
  let calls = 0, lastRequest;
  const data = response();
  const handler = async (req,res) => {
    calls++; lastRequest=req;
    if(error) throw error;
    if(capture) captureSources(req, ['entry','exhibition'].map((role,i)=>({role,text:original,observedAt:at,
      url:`https://www.boatrace.jp/owpc/pc/race/${i?'beforeinfo':'racelist'}?hd=20260101&jcd=01&rno=1`})));
    res.json(data);
  };
  const req = createRequire(require.resolve('./collect-predictions.js'));
  const context = { Promise, Date, console, raceApi:handler, require(name) {
    if(missingModule && name==='./independent-collector-input.cjs') throw new Error('missing');
    if(name==='./independent-collector-input.cjs') return {callWithIndependentOfficialInput:(...args)=>callWithIndependentOfficialInput(...args,{now})};
    return req(name);
  }, boatIdentity:{inspectEntries:()=>({valid:true})},
  attachVenueRaceHistory: data=>({raceData:data,historyTrend:{}}),
  attachShadowReferenceHistory:data=>data, theoryInput:{prepare:data=>data},
  global:{ChappyAICore:{buildRaceTrendEvaluation:()=>({ready:true,honmei:{score:3},manshu:{score:1}})}},
  historyInsights:{supportForType:()=>0}, wait:async()=>{} };
  vm.createContext(context); vm.runInContext(callSource+'\n'+evaluateSource,context);
  return {data,handler,context,calls:()=>calls, request:()=>lastRequest};
}
test('same request, one call, original ordinary response and isolated raw packet', async()=>{
  const h=harness(); const out=await callWithIndependentOfficialInput(h.context.callApi,h.handler,{date:target.date,jcd:target.jcd,rno:String(target.raceNo)},target,{now});
  assert.equal(h.calls(),1); assert.equal(out.data,h.data); assert.equal(out.independentInput.status,'captured');
  assert.equal(out.independentInput.packet.sources[0].text,original);
  assert.equal(out.independentInput.packet.startExhibition[0].marker,'F');
  out.independentInput.packet.entries[0].boat=99; assert.equal(h.data.entries[0].boat,1);
  assert.equal(h.data.sources,undefined); assert.equal(out.independentInput.packet.historyContext,undefined);
});
for(const capture of [false,true]) test(`existing callback/results remain identical, opt-in=${capture}`,async()=>{
  const h=harness(); let args;
  const out=await h.context.evaluateTargets(target.date,[target],{onOfficialRace:(...a)=>{args=a;},captureIndependentInput:capture});
  assert.equal(h.calls(),1); assert.equal(args.length,capture?3:2); assert.equal(args[0],h.data); assert.equal(args[1],target);
  assert.equal(out.comparison[0].rawRaceData,h.data); assert.equal(out.comparison[0].independentInput,undefined);
  assert.equal(JSON.stringify(out).includes(original),false);
  if(capture) assert.equal(args[2].status,'captured');
});
test('no subscriber leaves request unobserved even with capture option',async()=>{
  const h=harness(); await h.context.evaluateTargets(target.date,[target],{captureIndependentInput:true});
  assert.equal(h.calls(),1); assert.equal(h.data.sources,undefined);
  assert.equal(observeSources(h.request())().status,'not_captured');
});
for(const options of [{capture:false},{missingModule:true}]) test(`missing capture stays independent not-ready ${JSON.stringify(options)}`,async()=>{
  const h=harness(options); let args;
  const out=await h.context.evaluateTargets(target.date,[target],{onOfficialRace:(...a)=>{args=a;},captureIndependentInput:true});
  assert.equal(h.calls(),1); assert.equal(out.comparison.length,1); assert.equal(args[2].status,'not_ready');
  assert.equal(args[2].packet,undefined); assert.equal(args[2].automaticReady,false);
});
test('invalid deadline does not prevent ordinary response or cause another fetch',async()=>{
  const h=harness(); const out=await callWithIndependentOfficialInput(h.context.callApi,h.handler,{date:target.date,jcd:target.jcd,rno:String(target.raceNo)}, {...target,deadlineAt:''},{now});
  assert.equal(h.calls(),1); assert.equal(out.data,h.data); assert.equal(out.independentInput.status,'not_ready');
  assert.equal(out.independentInput.reason,'independent_official_target_invalid');
});
test('ordinary API rejection is preserved without refetch or source diagnostics',async()=>{
  const error=new Error('ordinary failure'); const h=harness({error});
  await assert.rejects(callWithIndependentOfficialInput(h.context.callApi,h.handler,{date:target.date,jcd:target.jcd,rno:String(target.raceNo)},target,{now}),e=>e===error);
  assert.equal(h.calls(),1);
});
test('observer failure cannot reject the ordinary API call',async()=>{
  const h=harness(); const out=await h.context.callApi(h.handler,{date:target.date,jcd:target.jcd,rno:String(target.raceNo)}, {observeRequest(){throw new Error('observer error');}});
  assert.equal(out,h.data); assert.equal(h.calls(),1);
});

for (const asynchronous of [false, true]) test(`raw consumer failure is isolated and sanitized, async=${asynchronous}`,async()=>{
  const h=harness(); const warnings=[]; h.context.console={warn:(...args)=>warnings.push(args.join(' '))};
  const fail=(data,target,input)=>{throw new Error(input.packet.sources[0].text);};
  const onOfficialRace=asynchronous?async(...args)=>fail(...args):fail;
  const out=await h.context.evaluateTargets(target.date,[target],{captureIndependentInput:true,onOfficialRace});
  await Promise.resolve();
  assert.equal(out.comparison.length,1); assert.equal(out.attempts[0].status,'evaluated');
  assert.equal(h.calls(),1); assert.equal(warnings.length,1);
  assert.equal(warnings[0],'Independent official input consumer failed; normal prediction unchanged');
  assert.equal(JSON.stringify(out).includes(original),false);
});
test('throwing then getter is isolated without leaking original',async()=>{
  const h=harness(); const warnings=[]; h.context.console={warn:line=>warnings.push(line)};
  const out=await h.context.evaluateTargets(target.date,[target],{captureIndependentInput:true,
    onOfficialRace:(data,target,input)=>({get then(){throw new Error(input.packet.sources[0].text);}})});
  await Promise.resolve();
  assert.equal(out.comparison.length,1); assert.equal(warnings.length,1);
  assert.equal(warnings[0].includes(original),false);
});
