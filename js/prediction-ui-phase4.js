(function(root){
  "use strict";
  if(root.ChappyPredictionUiPhase4)return;
  const labels=[
    {key:"main",label:"本命",words:["本命","最有力"]},
    {key:"manshu",label:"万舟",words:["万舟","波乱"]},
    {key:"tickets",label:"買い目",words:["買い目","フォーメーション","ランキング"]},
    {key:"reason",label:"AI根拠",words:["AI根拠","理論","展開理由"]},
    {key:"practical",label:"実戦厳選",words:["実戦厳選"]}
  ];
  let observer=null;
  function text(el){return String(el?.textContent||"").replace(/\s+/g," ").trim();}
  function findSections(area){
    const all=[...area.querySelectorAll(":scope > section,:scope > article,:scope > div")];
    return labels.map(item=>({item,el:all.find(el=>item.words.some(word=>text(el).includes(word)))})).filter(row=>row.el);
  }
  function installStyle(){
    if(document.getElementById("predictionPhase4Style"))return;
    const style=document.createElement("style");style.id="predictionPhase4Style";
    style.textContent=".prediction-phase4-nav{position:sticky;top:74px;z-index:25;display:flex;gap:7px;overflow-x:auto;margin:0 0 12px;padding:7px;background:rgba(255,255,255,.96);border:1px solid #dbe6f4;border-radius:14px;box-shadow:0 7px 18px rgba(20,63,110,.09)}.prediction-phase4-nav button{flex:0 0 auto;border:1px solid #d9e4ef;background:#fff;color:#4b6075;border-radius:999px;padding:8px 12px;font-size:.72rem;font-weight:900}.prediction-phase4-nav button.is-active{background:#0878f9;border-color:#0878f9;color:#fff}.prediction-phase4-anchor{scroll-margin-top:132px}.prediction-phase4-collapsible>.prediction-phase4-toggle{width:100%;border:0;background:#f4f9ff;color:#17324d;padding:10px 12px;font-weight:900;text-align:left}.prediction-phase4-collapsible.is-collapsed>.prediction-phase4-body{display:none}@media(max-width:700px){.prediction-phase4-nav{top:66px;margin-left:-3px;margin-right:-3px}.prediction-phase4-nav button{padding:7px 10px;font-size:.66rem}}";
    document.head.appendChild(style);
  }
  function enhanceReason(el){
    if(!el||el.dataset.phase4Folded)return;el.dataset.phase4Folded="1";el.classList.add("prediction-phase4-collapsible");
    const body=document.createElement("div");body.className="prediction-phase4-body";while(el.firstChild)body.appendChild(el.firstChild);
    const toggle=document.createElement("button");toggle.type="button";toggle.className="prediction-phase4-toggle";toggle.textContent="AI根拠を表示／折りたたむ";
    toggle.addEventListener("click",()=>el.classList.toggle("is-collapsed"));el.append(toggle,body);
  }
  function enhance(){
    const area=document.getElementById("resultArea");if(!area||!area.children.length)return;
    installStyle();document.querySelector(".prediction-phase4-nav")?.remove();
    const rows=findSections(area);if(!rows.length)return;
    const nav=document.createElement("nav");nav.className="prediction-phase4-nav";
    rows.forEach(({item,el},index)=>{el.classList.add("prediction-phase4-anchor");el.dataset.phase4Key=item.key;const button=document.createElement("button");button.type="button";button.textContent=item.label;if(index===0)button.classList.add("is-active");button.addEventListener("click",()=>el.scrollIntoView({behavior:"smooth",block:"start"}));nav.appendChild(button);if(item.key==="reason")enhanceReason(el);});
    area.before(nav);observer?.disconnect();observer=new IntersectionObserver(entries=>{const visible=entries.filter(e=>e.isIntersecting).sort((a,b)=>b.intersectionRatio-a.intersectionRatio)[0];if(!visible)return;nav.querySelectorAll("button").forEach((b,i)=>b.classList.toggle("is-active",rows[i]?.el===visible.target));},{rootMargin:"-25% 0px -60% 0px",threshold:[.05,.25,.5]});rows.forEach(row=>observer.observe(row.el));
  }
  const mutation=new MutationObserver(()=>root.requestAnimationFrame(enhance));
  function init(){const area=document.getElementById("resultArea");if(area){mutation.observe(area,{childList:true,subtree:false});enhance();}}
  root.ChappyPredictionUiPhase4={enhance};
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})(window);
