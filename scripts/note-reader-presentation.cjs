"use strict";
// Owner-approved readable-v10 presentation, shared with the app.
// Immutable source reconstruction, recovery and result readers verify this grammar.
const {createHash}=require("node:crypto");
const reader=require("../js/forecast-reader-contract");
const scenario=require("./note-scenario-presentation.cjs");
const category=require("./note-category-article");
const {seriesOfBundle}=require("./note-article-series");
const VERSION="readable-v10",TOTAL="📌 合計（重複なし）";
const LABELS=[reader.MAIN,reader.ADDITIONAL,reader.HOLE,reader.REFERENCE];
const FORMATION=/^(?:[1-6](?:・[1-6])*) → (?:[1-6](?:・[1-6])*) → (?:[1-6](?:・[1-6])*)$/;
const FREE_NOTICE="※予想は参考情報です。舟券の購入は20歳以上の方が、ご自身の判断と責任でお願いします。";
const check=(ok,reason)=>{if(!ok)throw Error(reason);};
const hash=value=>createHash("sha256").update(value).digest("hex");
// Read the established purchase policy without selecting tickets. The legacy
// module registers a Node global on first import; restore that reference so
// rendering cannot replace a caller's selector or test fixture.
function purchaseSelection(prediction){
  if(prediction.practicalSelection?.purchaseDecision){
    const selection=prediction.practicalSelection;
    return ['skip','unchanged','unavailable'].includes(selection.purchaseDecision.status)?selection:
      {...selection,purchaseDecision:{status:'unavailable'}};
  }
  const host=typeof window==='undefined'?globalThis:window;
  const had=Object.hasOwn(host,'ChappyPracticalSelection'),previous=host.ChappyPracticalSelection;
  let decision;
  try{decision=require('../js/practical-selection').purchaseDecision(prediction);}
  catch(_){decision={status:'unavailable'};}
  finally{if(had)host.ChappyPracticalSelection=previous;else delete host.ChappyPracticalSelection;}
  if(!decision||!['skip','unchanged'].includes(decision.status))decision={status:'unavailable'};
  return {...(prediction.practicalSelection||{}),tickets:prediction.practicalSelection?.tickets??prediction.practicalTickets,purchaseDecision:decision};
}
function sourceModel(bundle,article=bundle.article){
  check(seriesOfBundle(bundle)==="normal","reader_normal_source_required");
  const p=bundle.record.prediction;
  check(p?.practicalSelection?.purchaseDecision?.status!=="skip"&&p?.practicalSelection?.status!=="skipped"&&
    article?.purchaseDecision?.status!=="skip"&&!/^【購入見送り】/m.test(String(article?.freeText||"")+"\n"+String(article?.paidText||"")),
    "reader_purchase_skipped");
  const central=scenario.sourceSubset(bundle),selection=purchaseSelection(p);
  const app=reader.fromPrediction({...p,practicalSelection:selection},selection);
  check(app?.status!=="skipped","reader_purchase_skipped");
  check(app?.status==="selected"&&JSON.stringify(app.centralTickets)===JSON.stringify(central),"reader_app_selection_unavailable");
  const source=scenario.sourceSections(bundle,"normal",article);
  const model=reader.groupTickets({
    centralTickets:central,
    additionalTickets:source.filter(g=>g.label!==category.REFERENCE&&g.label!==category.NORMAL_LABELS[3]).flatMap(g=>g.tickets),
    holeTickets:source.filter(g=>g.label===category.NORMAL_LABELS[3]).flatMap(g=>g.tickets),
    referenceTickets:source.find(g=>g.label===category.REFERENCE)?.tickets||[]
  });
  // Central order is checked above. Every displayed family and accounting
  // field must also agree; an article-only reference list cannot drift from
  // the app's saved ledger, even when its overlap hides all extra lines.
  const groups=value=>value.groups.map(g=>({label:g.label,tickets:[...g.tickets].sort()}));
  check(JSON.stringify(groups(app))===JSON.stringify(groups(model))&&
    ["referenceOriginalCount","referenceOverlapCount","primaryCount","allCount"].every(key=>app[key]===model[key]),
    "reader_app_presentation_mismatch");
  return {...model,explanation:reader.explanation(p)};
}
function footer(model){
  return [TOTAL,"本命："+model.centralTickets.length+"点","公開予想："+model.primaryCount+"点",
    "参考予想：元台帳"+model.referenceOriginalCount+"点／重複"+model.referenceOverlapCount+"点／追加表示"+
      (model.referenceOriginalCount-model.referenceOverlapCount)+"点",
    "参考を含む全体："+model.allCount+"点"].join("\n");
}
function paidTextFromModel(model){
  return model.groups.map(g=>[g.label,category.formations(g.tickets),g.tickets.length+"点"].join("\n\n")).join("\n\n")+
    "\n\n"+footer(model);
}
function sourceSections(bundle,series=seriesOfBundle(bundle),article=bundle.article){
  check(series===seriesOfBundle(bundle),"reader_series_mismatch");
  return series==="normal"?sourceModel(bundle,article).groups:scenario.sourceSections(bundle,series,article);
}
function paidTextFromSource(bundle,series=seriesOfBundle(bundle),article=bundle.article){
  check(series===seriesOfBundle(bundle),"reader_series_mismatch");
  return series==="normal"?paidTextFromModel(sourceModel(bundle,article)):scenario.paidTextFromSource(bundle,series,article);
}
function parsePaidText(text){
  check(typeof text==="string"&&text.trim()===text&&text,"reader_body_missing");
  // Independent monitor bodies keep the reviewed v9 grammar and their
  // separate practical ledger; normal v10 bodies always have the new footer.
  if(!text.includes("\n\n"+TOTAL+"\n本命：")){
    check(Object.values(category.INDEPENDENT_LABELS).some(label=>text.startsWith(label+"\n")),"reader_footer_missing");
    return scenario.parsePaidText(text);
  }
  const blocks=text.split("\n\n"+TOTAL+"\n");
  check(blocks.length===2,"reader_footer_invalid");
  const groups=[];let current=null,declared=false,last=-1;
  for(const line of blocks[0].split("\n")){
    if(!line)continue;
    const index=LABELS.indexOf(line);
    if(index>=0){
      check((!current||declared)&&index>last,"reader_section_order_invalid");
      current={label:line,tickets:[]};groups.push(current);last=index;declared=false;continue;
    }
    check(current&&!declared,"reader_line_invalid");
    const count=/^([1-9]\d*)点$/.exec(line);
    if(count){
      check(Number(count[1])===current.tickets.length,"reader_count_invalid");declared=true;continue;
    }
    check(FORMATION.test(line),"reader_formation_invalid");
    const expanded=category.ticketsIn(line);
    check(expanded.length>0,"reader_formation_invalid");current.tickets.push(...expanded);
  }
  check(current&&declared&&groups[0]?.label===reader.MAIN,"reader_main_missing");
  const all=groups.flatMap(g=>g.tickets);
  check(new Set(all).size===all.length,"reader_duplicate_ticket");
  check(groups[0].tickets.length>=1&&groups[0].tickets.length<=10,"reader_main_count_invalid");
  const foot=blocks[1].split("\n");
  check(foot.length===4,"reader_footer_invalid");
  const main=/^本命：([1-9]\d*)点$/.exec(foot[0]),primary=/^公開予想：([1-9]\d*)点$/.exec(foot[1]),
    refs=/^参考予想：元台帳(\d+)点／重複(\d+)点／追加表示(\d+)点$/.exec(foot[2]),total=/^参考を含む全体：([1-9]\d*)点$/.exec(foot[3]);
  check(main&&primary&&refs&&total,"reader_footer_invalid");
  const primaryTickets=groups.filter(g=>g.label!==reader.REFERENCE).flatMap(g=>g.tickets);
  const referenceTickets=groups.find(g=>g.label===reader.REFERENCE)?.tickets||[];
  const original=Number(refs[1]),overlap=Number(refs[2]),extra=Number(refs[3]);
  check(Number(main[1])===groups[0].tickets.length&&Number(primary[1])===primaryTickets.length&&
    Number(total[1])===all.length&&original<=120&&overlap<=primaryTickets.length&&overlap<=original&&
    original-overlap===extra&&extra===referenceTickets.length,"reader_footer_count_invalid");
  const model={groups,centralTickets:groups[0].tickets,primaryTickets,primaryCount:primaryTickets.length,
    allTickets:all,allCount:all.length,referenceOriginalCount:original,referenceOverlapCount:overlap};
  check(paidTextFromModel(model)===text,"reader_body_noncanonical");
  return {sections:groups,modelTickets:[...model.centralTickets],model,modelIncludedInPublishedResult:true};
}
function modelProof(text,sourceSha256){
  check(/^[a-f0-9]{64}$/.test(sourceSha256||""),"reader_source_hash_invalid");
  const parsed=parsePaidText(text);
  if(!parsed.model)return scenario.modelProof(text,sourceSha256);
  return {version:"note-korogashi-display-v1",label:reader.MAIN,sourceSha256,
    ticketCount:parsed.modelTickets.length,ticketsSha256:hash(JSON.stringify([...parsed.modelTickets].sort())),
    includedInPublishedResult:true};
}
function article(article,bundle,{legacyReader}={}){
  if(seriesOfBundle(bundle)!=="normal"){
    check(typeof legacyReader==="function","reader_independent_renderer_required");
    return {...legacyReader(article,bundle),presentationVersion:VERSION};
  }
  const model=sourceModel(bundle,article),record=bundle.record,date=String(record.date),deadline=Date.parse(record.deadlineAt);
  check(/^\d{8}$/.test(date)&&Number.isFinite(deadline),"reader_race_identity_invalid");
  const time=new Intl.DateTimeFormat("ja-JP",{timeZone:"Asia/Tokyo",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(deadline);
  const retained=String(article.freeText||"").split("\n\n").filter(p=>
    /^(?:作成時点の取得済み情報|今日の予想一覧\n|はじめての方へ\n|https:\/\/note\.com\/)/.test(p));
  const freeText=[
    "🚤 "+Number(date.slice(4,6))+"月"+Number(date.slice(6,8))+"日 "+record.place+record.raceNo+"R\n🕒 締切 "+time,
    ...retained.filter(p=>!/^今日の予想一覧|^はじめての方へ|^https:\/\//.test(p)),
    "🧭 展開の考え方\n"+model.explanation.text,
    "🎟️ この記事の買い目\n"+model.groups.map(g=>g.label+"："+g.tickets.length+"点").join("\n"),
    "💡 本命を先に掲載しています。追加候補をすべて購入する前提ではありません。",
    ...(model.referenceOriginalCount?[reader.referenceSummary(model)]:[]),
    "📊 結果は当たりも外れも公開し、本命と追加候補を分けて示します。参考予想は別集計です。",
    ...retained.filter(p=>/^今日の予想一覧|^はじめての方へ|^https:\/\//.test(p)),FREE_NOTICE
  ].join("\n\n");
  check(!category.ticketsIn(freeText).length,"reader_intro_ticket_leak");
  const paidText=paidTextFromModel(model),parsed=parsePaidText(paidText);
  check(parsed.sections.length===model.groups.length&&parsed.sections.every((g,i)=>g.label===model.groups[i].label&&
    JSON.stringify([...g.tickets].sort())===JSON.stringify([...model.groups[i].tickets].sort())),"reader_display_source_mismatch");
  return {...article,presentationVersion:VERSION,freeText,paidText,
    fullText:[freeText,paidText,...(Array.isArray(article.tags)&&article.tags.length?[article.tags.join(" ")]:[])].join("\n\n")};
}
module.exports={PRESENTATION_VERSION:VERSION,LABEL:scenario.LABEL,
  labelForSeries:series=>series==="normal"?reader.MAIN:scenario.LABEL,
  sourceModel,sourceSections,paidTextFromSource,parsePaidText,modelProof,article};
