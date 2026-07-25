// 日和イベントの順序・鮮度・データ有無を診断する。予想ロジックには接続しない。
(function(){
  "use strict";
  const MONITOR_KEY="chappy_hiyori_event_monitor_v1";
  const HEALTH_KEY="chappy_hiyori_event_health_v1";
  const ORDER=[
    ["chappy:race-data-ready","レースデータ準備"],
    ["chappy:hiyori-learning-snapshot-saved","学習スナップショット保存"],
    ["chappy:race-result-ready","結果データ準備"],
    ["chappy:hiyori-learning-result-matched","学習結果照合"],
    ["chappy:hiyori-learning-correlation-updated","相関分析更新"],
    ["chappy:hiyori-correlation-confidence-updated","相関信頼度更新"],
    ["chappy:hiyori-learning-adoption-updated","採用候補更新"],
    ["chappy:hiyori-adoption-proposals-updated","変更提案更新"]
  ];
  function read(key,fallback){try{return JSON.parse(localStorage.getItem(key)||"null")??fallback}catch(_){return fallback}}
  function minutesSince(value){const t=Date.parse(value||"");return Number.isFinite(t)?Math.max(0,Math.round((Date.now()-t)/60000)):null}
  function diagnose(){
    const monitor=read(MONITOR_KEY,{events:{}});
    const rows=ORDER.map(([name,label])=>{const event=monitor.events?.[name]||{};return{name,label,count:Number(event.count||0),lastFiredAt:event.lastFiredAt||null,ageMinutes:minutesSince(event.lastFiredAt),detail:event.detail||{present:false,type:"none",keys:[]}}});
    const issues=[];
    rows.forEach((row,index)=>{
      if(row.count>0&&!row.detail?.present)issues.push({level:"warning",type:"detail_missing",label:row.label,message:`${row.label}は発火済みですがdetailがありません`});
      if(index>0&&row.count>0&&rows[index-1].count===0)issues.push({level:"error",type:"sequence",label:row.label,message:`${row.label}が直前工程より先に発火しています`});
      if(index>0&&row.lastFiredAt&&rows[index-1].lastFiredAt&&Date.parse(row.lastFiredAt)<Date.parse(rows[index-1].lastFiredAt))issues.push({level:"warning",type:"order_time",label:row.label,message:`${row.label}の最終時刻が直前工程より古い状態です`});
    });
    const input=rows[0],snapshot=rows[1],result=rows[2],matched=rows[3];
    if(input.count>snapshot.count)issues.push({level:"warning",type:"snapshot_gap",label:"スナップショット保存",message:`レース入力${input.count}回に対し保存${snapshot.count}回です`});
    if(result.count>matched.count)issues.push({level:"warning",type:"match_gap",label:"結果照合",message:`結果入力${result.count}回に対し照合${matched.count}回です`});
    const latest=rows.filter(r=>r.lastFiredAt).sort((a,b)=>Date.parse(b.lastFiredAt)-Date.parse(a.lastFiredAt))[0]||null;
    if(latest?.ageMinutes>1440)issues.push({level:"warning",type:"stale",label:"入力鮮度",message:`最終イベントから${latest.ageMinutes}分経過しています`});
    const firstMissing=rows.findIndex((row,index)=>row.count===0&&(index===0||rows[index-1].count>0));
    const resultData={checkedAt:new Date().toISOString(),healthy:issues.filter(x=>x.level==="error").length===0,rows,issues,latestEvent:latest,firstMissing:firstMissing<0?null:{index:firstMissing,name:rows[firstMissing].name,label:rows[firstMissing].label}};
    localStorage.setItem(HEALTH_KEY,JSON.stringify(resultData));
    window.dispatchEvent(new CustomEvent("chappy:hiyori-event-health-updated",{detail:resultData}));
    return resultData;
  }
  function fmt(value){const d=new Date(value);return Number.isNaN(d.getTime())?"-":d.toLocaleString("ja-JP")}
  function root(){
    const dashboard=document.getElementById("hiyoriOperationsDashboard");
    if(!dashboard)return null;
    let holder=document.getElementById("hiyoriEventHealthPanel");
    if(holder)return holder;
    holder=document.createElement("section");
    holder.id="hiyoriEventHealthPanel";
    holder.style.cssText="margin-top:12px;padding:12px;border:1px solid #dbe6f3;border-radius:12px;background:#fff";
    dashboard.appendChild(holder);
    return holder;
  }
  function render(data=diagnose()){
    const holder=root();if(!holder)return data;
    const errors=data.issues.filter(x=>x.level==="error").length;
    const warnings=data.issues.filter(x=>x.level==="warning").length;
    holder.innerHTML=`<details open><summary style="font-weight:700;cursor:pointer">イベント順序・鮮度診断　異常 ${errors}／注意 ${warnings}</summary><div style="margin-top:9px;font-size:12px">${data.latestEvent?`<div><b>最終イベント：</b>${data.latestEvent.label}（${fmt(data.latestEvent.lastFiredAt)}）</div>`:`<div><b>最終イベント：</b>未記録</div>`}${data.firstMissing?`<div><b>次の未到達：</b>${data.firstMissing.label}</div>`:`<div><b>到達状況：</b>監視工程すべて発火済み</div>`}<div style="display:grid;gap:6px;margin-top:9px">${data.issues.length?data.issues.map(x=>`<div style="padding:8px;border-radius:9px;background:${x.level==="error"?"#fef2f2":"#fffbeb"};border:1px solid ${x.level==="error"?"#fca5a5":"#fcd34d"}"><b>${x.level==="error"?"異常":"注意"}：${x.label}</b><span style="display:block;margin-top:3px;color:#64748b">${x.message}</span></div>`).join(""):`<div style="padding:8px;border-radius:9px;background:#ecfdf5;border:1px solid #86efac"><b>イベント順序・鮮度に重大な異常なし</b></div>`}</div><small style="display:block;margin-top:8px;color:#64748b">監視・診断専用です。イベントの強制発火、データ補完、本番反映は行いません。</small></div></details>`;
    return data;
  }
  function install(){render();["chappy:hiyori-event-monitor-updated","chappy:hiyori-runtime-ready"].forEach(name=>window.addEventListener(name,()=>render()));setInterval(()=>render(),60000)}
  window.ChappyHiyoriEventHealth={diagnose,render,status:()=>read(HEALTH_KEY,null)};
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install,{once:true});else install();
})();