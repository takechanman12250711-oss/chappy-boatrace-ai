"use strict";
// Real mobile browser DOM + the production presentation loader/wrappers.
// The base renderer is a fixture: this does not certify live data/network or deployment.
const fs=require("node:fs"),path=require("node:path"),http=require("node:http"),assert=require("node:assert/strict");
const {chromium,webkit}=require("playwright");
const fixture=require("./fixtures/reader-presentation.json");
const reader=require("../js/forecast-reader-contract");
const captureFacts=require("../js/prediction-conditions").capture;
const base=path.resolve(__dirname,"..");
async function main(){
  const {installReaderPresentationCapture,assertReaderPresentation,readReaderPresentationCapture}=await import("./bright-mobile-visual-check.mjs");
  const server=http.createServer((req,res)=>{
    const pathname=decodeURIComponent(new URL(req.url,"http://localhost").pathname);
    if(pathname==="/"){
      const index=fs.readFileSync(path.join(base,"index.html"),"utf8");
      const src=name=>index.match(new RegExp('<script src="(js/'+name+'\\.js\\?[^"]+)"'))[1];
      const brightCss=index.match(/<link rel="stylesheet" href="(css\/bright-mobile-layout\.css\?[^"]+)"/)[1];
      res.setHeader("Content-Type","text/html; charset=utf-8");
      res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="'+brightCss+'"></head><body><div id="resultArea"></div>'+
        '<script src="'+src("prediction-conditions")+'"></script><script src="'+src("forecast-reader-contract")+'"></script><script src="'+src("result-void-compat")+'"></script><script src="'+src("bright-mobile-layout")+'"></script></body></html>');
      return;
    }
    const target=path.resolve(base,"."+pathname);
    if(!target.startsWith(base+path.sep)){res.writeHead(403);res.end();return;}
    fs.readFile(target,(error,bytes)=>{if(error){res.writeHead(404);res.end();return;}res.setHeader("Content-Type",target.endsWith(".css")?"text/css":target.endsWith(".js")?"text/javascript":"application/octet-stream");res.end(bytes);});
  });
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  const channel=process.env.CHAPPY_BROWSER_CHANNEL;
  const browser=await (process.env.CHAPPY_BROWSER==="webkit"?webkit:chromium).launch({headless:true,...(channel?{channel}:{})});
  try{
    for(const early of [false,true]){
      const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,deviceScaleFactor:1});
      const errors=[];page.on("pageerror",e=>errors.push(e.message));
      const install=()=>{window.renderAll=p=>{window.__lastRendered=p;document.getElementById("resultArea").innerHTML=
        '<div class="v3-root"><section class="v3-boat-evaluation"></section><section class="v3-main-newspaper"><h3>旧本命</h3></section><section class="v3-manshu-newspaper"><div class="v3-section-body"></div></section><section class="v3-practical-section"></section></div>';};};
      if(early)await page.addInitScript(install);
      await page.goto("http://127.0.0.1:"+server.address().port);
      await page.waitForFunction(()=>window.ChappyPracticalVisiblePanel&&window.ChappyFinalDisplayUserContract&&window.ChappyFinalDisplayOwner&&window.ChappyBrightMobileLayout&&window.ChappyPredictionConditions);
      if(!early)await page.evaluate(install);
      await page.addScriptTag({url:"/js/practical-selection.js"});
      await page.addScriptTag({url:"/js/main-cover-display-boundary.js"});
      await page.evaluate(()=>dispatchEvent(new Event("chappy:prediction-runtime-ready")));
      const p=structuredClone(fixture.bundle.record.prediction);
      p.raceFlow={summary:"本命は5号艇という古い説明。現在の保存根拠とは別です。"};
      const original=JSON.stringify(p),expected=reader.fromPrediction(p);
      const shortExplanation=value=>String(value).trim().split(/(?<=。)/).slice(0,2).join("").slice(0,180);
      async function render(input){await installReaderPresentationCapture(page);await page.evaluate(value=>{window.__readerRawInput=value;window.__readerRawBefore=JSON.stringify(value);renderAll(value);},input);await page.waitForTimeout(650);await assertReaderPresentation(page);assert.equal(await page.evaluate(()=>JSON.stringify(__readerRawInput)===__readerRawBefore),true,"raw forecast input remains unchanged");}
      async function snapshot(){return page.evaluate(()=>{
        const area=document.getElementById("resultArea"),card=area.querySelector("[data-reader-contract]");
        const groups=[...card.querySelectorAll("[data-reader-group]")].map(g=>({
          label:g.querySelector(".chappy-final-buy-label").textContent,
          tickets:[...g.querySelectorAll(".chappy-final-buy-line")].flatMap(line=>{
            const v=line.querySelector(".chappy-final-buy-formation").textContent.replace(/全/g,"123456").split("-");
            const out=[];for(const a of v[0])for(const b of v[1])for(const c of v[2])if(new Set([a,b,c]).size===3)out.push(a+"-"+b+"-"+c);
            return out;
          })}));
        return {status:card.dataset.readerStatus,groups,text:card.textContent,
          header:card.querySelector(".chappy-final-buy-total")?.textContent||null,
          allLabels:[...card.querySelectorAll(".chappy-final-buy-group .chappy-final-buy-label")].map(n=>n.textContent),
          foreignGroupCount:card.querySelectorAll(".chappy-final-buy-group:not([data-reader-group])").length,
          open:[...card.querySelectorAll("[data-reader-group]")].map(n=>n.open),
          intro:area.querySelector(".chappy-flow-preview p")?.textContent||null,
          legacyVisible:[...area.querySelectorAll(".v3-main-newspaper,.v3-manshu-newspaper,.chappy-practical-visible-panel")].filter(n=>!n.hidden).length,
          fallback:area.querySelectorAll(".is-practical-fallback").length,
          overflow:document.documentElement.scrollWidth>390};
      });}
      await render(p);let s=await snapshot();assert.equal(s.status,"selected");
      assert.deepEqual(s.groups.map(g=>({label:g.label,tickets:[...g.tickets].sort()})),expected.groups.map(g=>({label:g.label,tickets:[...g.tickets].sort()})));
      assert.equal(s.legacyVisible,0);assert.equal(s.fallback,0);assert.equal(s.overflow,false);
      assert.match(s.text,/本命7点.*公開予想37点/);
      assert.equal(s.header,"本命7点");assert.equal(s.foreignGroupCount,0);
      assert.deepEqual(s.allLabels,expected.groups.map(g=>g.label));
      assert.deepEqual(s.open,[true,false,false,false]);
      assert.equal(s.intro,shortExplanation(reader.explanation(p).text));
      assert.doesNotMatch(s.intro,/古い説明|本命は5号艇/);
      assert.equal(JSON.stringify(p),original);
      const capture=await readReaderPresentationCapture(page);
      assert.equal(capture.expected.status,"selected");
      assert.deepEqual(capture.expected,expected,"event input retains the full reader model");
      for(const field of ["tickets","coverTickets","flowTickets"])
        assert.deepEqual(capture.source.mainSheet[field],p.mainSheet[field],"full saved source "+field);
      assert.deepEqual(capture.source.manshuSheet.tickets,p.manshuSheet.tickets);
      assert.deepEqual(capture.source.manshuForecastLedger,p.manshuForecastLedger);
      assert.deepEqual(capture.source.practicalTickets.map(r=>r.ticket),p.practicalTickets.map(r=>r.ticket));
      assert.equal(await page.evaluate(()=>{
        const record=window.__chappyReaderPresentationDiagnostic.record;
        return Object.isFrozen(record)&&Object.isFrozen(record.source)&&Object.isFrozen(record.source.mainSheet.tickets)&&Object.isFrozen(record.expected.groups[0].tickets);
      }),true,"source and expected model are deeply frozen");
      // These negative checks exercise the exact helper used by the WebKit review.
      const tamperCases=[
        ["status",()=>document.querySelector("[data-reader-contract]").dataset.readerStatus="empty"],
        ["label",()=>document.querySelector(".chappy-final-buy-label").textContent="別の区分"],
        ["ticket",()=>document.querySelector(".chappy-final-buy-formation").textContent="6-5-4"],
        ["main count",()=>document.querySelector(".chappy-final-buy-total").textContent="本命99点"],
        ["ticket children",()=>document.querySelector(".chappy-ticket-child strong").textContent="6-5-4"],
        ["foreign empty group",()=>document.querySelector("[data-reader-contract]").insertAdjacentHTML("beforeend",'<details class="chappy-final-buy-group"><summary><span class="chappy-final-buy-label">流し</span></summary></details>')],
        ["reference counts",()=>[...document.querySelectorAll(".chappy-category-note")].find(n=>n.textContent.startsWith("参考予想")).textContent="参考予想は999点"],
        ["legacy fallback",()=>document.querySelector("[data-reader-contract]").insertAdjacentHTML("beforeend",'<div class="is-practical-fallback">旧買い目</div>')],
        ["missing marker",()=>document.querySelector("[data-reader-contract]").removeAttribute("data-reader-contract")],
        ["duplicate card",()=>{const card=document.querySelector("[data-reader-contract]");card.parentNode.appendChild(card.cloneNode(true));}]
      ];
      for(const [name,mutate] of tamperCases){
        await page.evaluate(mutate);
        await assert.rejects(()=>assertReaderPresentation(page),error=>error.code==="ERR_ASSERTION","reject "+name);
        await render(p);
      }
      await installReaderPresentationCapture(page);
      await assert.rejects(()=>assertReaderPresentation(page),/prepared prediction snapshot missing/);
      await page.evaluate(()=>dispatchEvent(new CustomEvent("chappy:presentation-rendered")));
      await assert.rejects(()=>assertReaderPresentation(page),/prepared prediction input missing/);
      await render(p);

      const sourceA=await page.evaluate(()=>__lastRendered.practicalTickets.map(r=>r.ticket));
      assert.deepEqual(sourceA,p.practicalTickets.map(r=>r.ticket),"saved A original order");
      await page.evaluate(()=>{
        const groups=[...document.querySelectorAll("[data-reader-group]")];
        groups[0].open=false;groups[1].open=true;
        for(let i=0;i<4;i++)ChappyBrightMobileLayout.organize(__lastRendered);
      });
      await page.waitForTimeout(250);
      const repeated=await snapshot();
      assert.deepEqual(repeated.groups,s.groups);assert.deepEqual(repeated.allLabels,s.allLabels);
      assert.equal(repeated.foreignGroupCount,0);assert.equal(repeated.header,s.header);assert.equal(repeated.intro,s.intro);
      assert.deepEqual(repeated.open,[false,true,false,false]);
      await assertReaderPresentation(page,{requireDefaultDisclosure:false});
      assert.deepEqual(await page.evaluate(()=>__lastRendered.practicalTickets.map(r=>r.ticket)),sourceA);
      const unverified=structuredClone(p);unverified.verificationEvidence.mainScenario.label="矛盾する説明";
      await render(unverified);const unknown=await snapshot();
      assert.equal(unknown.intro,"展開の根拠は確認中です。");assert.deepEqual(unknown.groups,s.groups);
      await render(p);

      if(process.env.CHAPPY_READER_SCREENSHOT)await page.screenshot({path:process.env.CHAPPY_READER_SCREENSHOT.replace(/\.png$/,early?"-early.png":"-late.png"),fullPage:true});
      const flagged=structuredClone(p);
      const firstBoat=flagged.preRaceConditions.boats[0],nextBoat=flagged.preRaceConditions.boats[1];
      firstBoat.exhibitionST=.02;firstBoat.exhibitionStartMarker="F";firstBoat.startExhibition={...firstBoat.startExhibition,st:.02,marker:"F"};
      nextBoat.exhibitionST=.99;nextBoat.exhibitionStartMarker="L";nextBoat.startExhibition={...nextBoat.startExhibition,st:.99,marker:"L"};
      await render(flagged);const flaggedView=await snapshot();
      assert.match(flaggedView.text,/展示STはF0.02/);assert.match(flaggedView.text,/隣の2号艇の展示STはL0.99/);
      assert.deepEqual(flaggedView.groups,s.groups);
      assert.equal(flaggedView.header,"本命7点");assert.equal(flaggedView.foreignGroupCount,0);
      assert.equal(flaggedView.intro,shortExplanation(reader.explanation(flagged).text));
      // Current map values beat older snapshot rows, including explicit missing quotes.
      p.mainSheet.tickets[0].odds=9;p.oddsByTicket={"1-2-3":101,"1-4-3":null};
      await render(p);
      assert.deepEqual((await snapshot()).groups,s.groups);
      const quotes=await page.evaluate(()=>[...ChappyFinalMobileUi.buildOddsMap(__lastRendered)]);
      assert.equal(new Map(quotes).get("1-2-3"),101);assert.equal(new Map(quotes).get("1-4-3"),null);
      assert.equal(await page.evaluate(()=>ChappyFinalMobileUi.buildOddsMap({mainSheet:{tickets:[{ticket:"1-2-3"}]},practicalTickets:[{ticket:"1-2-3",odds:30}]}).get("1-2-3")),30);
      const skipped=structuredClone(p);skipped.practicalSelection={tickets:p.practicalTickets,purchaseDecision:{status:"skip",reason:"壁艇条件"}};
      await render(skipped);s=await snapshot();assert.equal(s.status,"skipped");assert.equal(s.groups.length,0);assert.equal(s.legacyVisible,0);assert.match(s.text,/0点・0円/);assert.equal(s.allLabels.length,0);assert.equal(s.foreignGroupCount,0);assert.equal(s.header,null);
      const skippedCapture=await readReaderPresentationCapture(page);
      assert.equal(skippedCapture.expected.reason,"壁艇条件");
      await page.evaluate(()=>document.querySelector("[data-reader-contract]>p").textContent="別の理由");
      await assert.rejects(()=>assertReaderPresentation(page),/saved zero-state reason/);
      await render(skipped);
      const wall=structuredClone(p);wall.race={deadlineAt:"2026-11-16T20:07:00+09:00"};wall.wallTheory={state:"壁成立",attackerNo:2,wallCandidateNo:3,score:80,grade:"A"};
      await render(wall);s=await snapshot();assert.equal(s.status,"skipped");assert.equal(s.groups.length,0);assert.equal(s.legacyVisible,0);assert.equal(s.allLabels.length,0);assert.equal(s.header,null);
      const empty=structuredClone(p);empty.practicalSelection={tickets:[]};
      await render(empty);s=await snapshot();assert.equal(s.status,"empty");assert.equal(s.allLabels.length,0);assert.equal(s.foreignGroupCount,0);assert.equal(s.header,null);
      const missing=structuredClone(p);delete missing.mainSheet.flowTickets;await render(missing);s=await snapshot();assert.equal(s.status,"unavailable");assert.equal(s.allLabels.length,0);assert.equal(s.foreignGroupCount,0);assert.equal(s.header,null);
      const unavailableCapture=await readReaderPresentationCapture(page);
      assert.equal(unavailableCapture.expected.error,"reader_contract_source_missing");
      assert.equal(unavailableCapture.expected.reason,"保存された買い目の整合性を確認中です。");
      // A followed immediately by B: delayed wrappers and visibility restoration must retain B.
      const b={mainSheet:{honmei:{boatNo:2},tickets:[{ticket:"2-3-4"}],coverTickets:[],flowTickets:[]},manshuSheet:{tickets:[]},practicalTickets:[{ticket:"2-3-4"}]};
      await page.evaluate(([a,b])=>{renderAll(a);renderAll(b);},[p,b]);
      await page.waitForTimeout(650);
      await page.evaluate(()=>document.dispatchEvent(new Event("visibilitychange")));
      await page.waitForTimeout(100);await assertReaderPresentation(page);s=await snapshot();assert.deepEqual(s.groups[0].tickets,["2-3-4"]);assert.doesNotMatch(s.text,/1号艇逃げ/);
      await render(p);s=await snapshot();assert.equal(s.status,"selected");assert.equal(s.legacyVisible,0);
      // Real review-event projection: the saved 124 replaces only the final
      // ticket; its complete original pool and the prior generator snapshot stay.
      const rescue=structuredClone(require("./fixtures/reader-saved-rescues-derived.json").livePrediction);
      const facts=require("./fixtures/reader-explanation-derived.json").prediction;
      rescue.race=structuredClone(facts.race);rescue.aiCore=structuredClone(facts.aiCore);
      const rescueBefore=JSON.stringify(rescue),rescueExpected=reader.fromPrediction(reader.explanationView(rescue,captureFacts));
      assert.equal(rescueExpected.status,"selected");assert.equal(rescueExpected.centralTickets.length,9);
      await render(rescue);const rescued=await snapshot();
      assert.equal(rescued.header,"本命9点");
      assert.deepEqual(rescued.groups.map(g=>({label:g.label,tickets:[...g.tickets].sort()})),
        rescueExpected.groups.map(g=>({label:g.label,tickets:[...g.tickets].sort()})));
      const rescuedCapture=await readReaderPresentationCapture(page);
      assert.deepEqual(rescuedCapture.expected.explanation,rescueExpected.explanation);
      assert.equal(rescuedCapture.expected.explanation.verified,true);
      assert.match(rescued.text,/平均STは0.12、展示STはF0.02、展示タイムは6.76秒/);
      assert.match(rescued.text,/隣の5号艇の展示STは0.01/);
      assert.equal(rescued.intro,shortExplanation(rescueExpected.explanation.text));
      assert.deepEqual(Object.keys(rescuedCapture.source.preRaceConditions),["boats"]);
      assert.equal(Object.hasOwn(rescuedCapture.source.preRaceConditions,"sourceTiming"),false);
      assert.deepEqual(rescuedCapture.source.practicalSelection.tickets.map(r=>r.ticket),rescueExpected.centralTickets);
      assert.equal(rescuedCapture.source.practicalSelection.candidateValidationEvidence.finalSelectedTickets.at(-1),"2-1-5");
      assert.equal(JSON.stringify(rescue),rescueBefore);
      for(const change of [r=>r.race.entries[3].avgST=".99",r=>r.preRaceConditions=null,r=>delete r.race.raw.startExhibition[3].isOfficialCourse,
        r=>{r.race.entries[3].avgST=" ";r.race.raw.entries[3].avgSt=" ";},
        r=>{r.race=structuredClone(r.race.raw);r.race.entries[3].avgSt=false;}]){
        const uncertain=structuredClone(rescue);change(uncertain);await render(uncertain);
        const state=await snapshot();assert.equal(state.intro,"展開の根拠は確認中です。");assert.equal(state.header,"本命9点");
        assert.deepEqual(state.groups,rescued.groups);
      }
      const late=structuredClone(rescue);late.race.raw.startExhibition[4].marker="L";late.race.raw.startExhibition[4].st=.99;late.race.startExhibition[4].marker="L";late.race.startExhibition[4].st=".99";
      await render(late);assert.match((await snapshot()).text,/隣の5号艇の展示STはL0.99/);
      const unproven=structuredClone(rescue);delete unproven.practicalSelection.candidateValidationEvidence;
      await render(unproven);const rejected=await readReaderPresentationCapture(page);
      assert.equal(rejected.expected.status,"unavailable");assert.match(rejected.expected.error,/reader_saved_rescue/);
      assert.equal((await snapshot()).groups.length,0);
      await render(p);

      // Ownership marker is removed when falling back to the legacy UI.
      await page.evaluate(()=>{delete window.ChappyForecastReaderContract;renderAll({mainSheet:{tickets:[{ticket:"1-2-3"}]}});});
      await page.waitForTimeout(650);
      assert.equal(await page.locator("[data-reader-contract]").count(),0);
      assert.equal(await page.locator(".v3-manshu-newspaper").evaluate(n=>n.hidden),false);
      assert.deepEqual(await assertReaderPresentation(page),{legacy:true,groupCount:4});
      await page.evaluate(()=>document.querySelectorAll(".chappy-final-buy-group").forEach(n=>n.remove()));
      await assert.rejects(()=>assertReaderPresentation(page),/legacy presentation retains four groups/);
      assert.deepEqual(errors,[]);
      await page.close();console.log("reader mobile browser: "+(early?"early":"late")+" renderer passed");
    }
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
