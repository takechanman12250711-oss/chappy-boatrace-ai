"use strict";
// Real mobile browser DOM + the production presentation loader/wrappers.
// The base renderer is a fixture: this does not certify live data/network or deployment.
const fs=require("node:fs"),path=require("node:path"),http=require("node:http"),assert=require("node:assert/strict");
const {chromium,webkit}=require("playwright");
const fixture=require("./fixtures/reader-presentation.json");
const reader=require("../js/forecast-reader-contract");
const base=path.resolve(__dirname,"..");
async function main(){
  const server=http.createServer((req,res)=>{
    const pathname=decodeURIComponent(new URL(req.url,"http://localhost").pathname);
    if(pathname==="/"){
      const index=fs.readFileSync(path.join(base,"index.html"),"utf8");
      const src=name=>index.match(new RegExp('<script src="(js/'+name+'\\.js\\?[^"]+)"'))[1];
      res.setHeader("Content-Type","text/html; charset=utf-8");
      res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="resultArea"></div>'+
        '<script src="'+src("forecast-reader-contract")+'"></script><script src="'+src("result-void-compat")+'"></script></body></html>');
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
      await page.waitForFunction(()=>window.ChappyPracticalVisiblePanel&&window.ChappyFinalDisplayUserContract&&window.ChappyFinalDisplayOwner);
      if(!early)await page.evaluate(install);
      await page.addScriptTag({url:"/js/main-cover-display-boundary.js"});
      await page.evaluate(()=>dispatchEvent(new Event("chappy:prediction-runtime-ready")));
      const p=structuredClone(fixture.bundle.record.prediction);
      const expected=reader.fromPrediction(p);
      async function render(input){await page.evaluate(value=>renderAll(value),input);await page.waitForTimeout(650);}
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
          legacyVisible:[...area.querySelectorAll(".v3-main-newspaper,.v3-manshu-newspaper,.chappy-practical-visible-panel")].filter(n=>!n.hidden).length,
          fallback:area.querySelectorAll(".is-practical-fallback").length,
          overflow:document.documentElement.scrollWidth>390};
      });}
      await render(p);let s=await snapshot();assert.equal(s.status,"selected");
      assert.deepEqual(s.groups.map(g=>({label:g.label,tickets:[...g.tickets].sort()})),expected.groups.map(g=>({label:g.label,tickets:[...g.tickets].sort()})));
      assert.equal(s.legacyVisible,0);assert.equal(s.fallback,0);assert.equal(s.overflow,false);
      assert.match(s.text,/本命7点.*公開予想37点/);
      if(process.env.CHAPPY_READER_SCREENSHOT)await page.screenshot({path:process.env.CHAPPY_READER_SCREENSHOT.replace(/\.png$/,early?"-early.png":"-late.png"),fullPage:true});
      // Current map values beat older snapshot rows, including explicit missing quotes.
      p.mainSheet.tickets[0].odds=9;p.oddsByTicket={"1-2-3":101,"1-4-3":null};
      await render(p);
      assert.deepEqual((await snapshot()).groups,s.groups);
      const quotes=await page.evaluate(()=>[...ChappyFinalMobileUi.buildOddsMap(__lastRendered)]);
      assert.equal(new Map(quotes).get("1-2-3"),101);assert.equal(new Map(quotes).get("1-4-3"),null);
      const skipped=structuredClone(p);skipped.practicalSelection={tickets:p.practicalTickets,purchaseDecision:{status:"skip",reason:"壁艇条件"}};
      await render(skipped);s=await snapshot();assert.equal(s.status,"skipped");assert.equal(s.groups.length,0);assert.equal(s.legacyVisible,0);assert.match(s.text,/0点・0円/);
      const empty=structuredClone(p);empty.practicalSelection={tickets:[]};
      await render(empty);assert.equal((await snapshot()).status,"empty");
      const missing=structuredClone(p);delete missing.practicalTickets;await render(missing);assert.equal((await snapshot()).status,"unavailable");
      // A followed immediately by B: delayed wrappers and visibility restoration must retain B.
      const b={mainSheet:{honmei:{boatNo:2},tickets:[{ticket:"2-3-4"}],coverTickets:[],flowTickets:[]},manshuSheet:{tickets:[]},practicalTickets:[{ticket:"2-3-4"}]};
      await page.evaluate(([a,b])=>{renderAll(a);renderAll(b);},[p,b]);
      await page.waitForTimeout(650);
      await page.evaluate(()=>document.dispatchEvent(new Event("visibilitychange")));
      await page.waitForTimeout(100);s=await snapshot();assert.deepEqual(s.groups[0].tickets,["2-3-4"]);assert.doesNotMatch(s.text,/1号艇逃げ/);
      await render(p);s=await snapshot();assert.equal(s.status,"selected");assert.equal(s.legacyVisible,0);
      // Ownership marker is removed when falling back to the legacy UI.
      await page.evaluate(()=>{delete window.ChappyForecastReaderContract;renderAll({mainSheet:{tickets:[{ticket:"1-2-3"}]}});});
      await page.waitForTimeout(650);
      assert.equal(await page.locator("[data-reader-contract]").count(),0);
      assert.equal(await page.locator(".v3-manshu-newspaper").evaluate(n=>n.hidden),false);
      assert.deepEqual(errors,[]);
      await page.close();console.log("reader mobile browser: "+(early?"early":"late")+" renderer passed");
    }
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
