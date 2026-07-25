// 日和イベントの順序・鮮度・データ有無を診断する。予想ロジックには接続しない。
(function(){
  "use strict";
  const MONITOR_KEY="chappy_hiyori_event_monitor_v1";
  const HEALTH_KEY="chappy_hiyori_event_health_v1";
  const HISTORY_KEY="chappy_hiyori_event_health_history_v1";
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
  const ACTIONS={
    sequence:"直前工程のイベント発火と入力データを確認",
    detail_missing:"イベント送信側のdetail設定を確認",
    order_time:"直前工程の最新データで再処理されたか確認",
    snapshot_gap:"未保存のレース入力がないか確認",
    match_gap:"未照合の公式結果がないか確認",
    stale:"開催状況とデータ取得処理の稼働を確認",
    waiting:"次工程の入力条件または結果待ちを確認"
  };
  function read(key,fallback){try{return JSON.parse(localStorage.getItem(key)||"null")??fallback}catch(_){return fallback}}
  function write(key,value){localStorage.setItem(key,JSON.stringify(value))}
  function list(value){return Array.isArray(value)?value:[]}
  function minutesSince(value){const t=Date.parse(value||"");return Number.isFinite(t)?Math.max(0,Math.round((Date.now()-t)/60000)):null}
  function add(issues,level,type,label,message){issues.push({level,type,label,message,action:ACTIONS[type]||"該当工程を確認",priority:level==="critical"?1:level==="warning"?2:3})}
  function diagnose(){
    const monitor=read(MONITOR_KEY,{events:{}});
    const rows=ORDER.map(([name,label])=>{const event=monitor.events?.[name]||{};return{name,label,count:Number(event.count||0),lastFiredAt:event.lastFiredAt||null,ageMinutes:minutesSince(event.lastFiredAt),detail:event.detail||{present:false,type:"none",keys:[]}}});
    const issues=[];
    rows.forEach((row,index)=>{
      if(row.count>0&&!row.detail?.present)add(issues,"warning","detail_missing",row.label,`${row.label}は発火済みですがdetailがありません`);
      if(index>0&&row.count>0&&rows[index-1].count===0)add(issues,"critical","sequence",row.label,`${row.label}が直前工程より先に発火しています`);
      if(index>0&&row.lastFiredAt&&rows[index-1].lastFiredAt&&Date.parse(row.lastFiredAt)<Date.parse(rows[index-1].lastFiredAt))add(issues,"warning","order_time",row.label,`${row.label}の最終時刻が直前工程より古い状態です`);
    });
    const input=rows[0],snapshot=rows[1],result=rows[2],matched=rows[3];
    if(input.count>snapshot.count)add(issues,"warning","snapshot_gap","スナップショット保存",`レース入力${input.count}回に対し保存${snapshot.count}回です`);
    if(result.count>matched.count)add(issues,"warning","match_gap","結果照合",`結果入力${result.count}回に対し照合${matched.count}回です`);
    const latest=rows.filter(r=>r.lastFiredAt).sort((a,b)=>Date.parse(b.lastFiredAt)-Date.parse(a.lastFiredAt))[0]||null;
    if(latest?.ageMinutes>1440)add(issues,"warning","stale","入力鮮度",`最終イベントから${latest.ageMinutes}分経過しています`);
    const firstMissing=rows.findIndex((row,index)=>row.count===0&&(index===0||rows[index-1].count>0));
    if(firstMissing>=0)add(issues,"waiting","waiting",rows[firstMissing].label,`${rows[firstMissing].label}への到達待ちです`);
    issues.sort((a,b)=>a.priority-b.priority);
    const counts={critical:issues.filter(x=>x.level==="critical").length,warning:issues.filter(x=>x.level==="warning").length,waiting:issues.filter(x=>x.level==="waiting").length};
    const resultData={checkedAt:new Date().toISOString(),healthy:counts.critical===0,rows,issues,counts,topIssue:issues[0]||null,latestEvent:latest,firstMissing:firstMissing<0?null:{index:firstMissing,name:rows[firstMissing].name,label:rows[firstMissing].label}};
    write(HEALTH_KEY,resultData);
    const history=list(read(HISTORY_KEY,[]));
    const signature=JSON.stringify(issues.map(x=>[x.level,x.type,x.label]));
    const previous=history[0]||null;
    if(!previous||previous.signature!==signature){write(HISTORY_KEY,[{checkedAt:resultData.checkedAt,signature,counts,topIssue:resultData.topIssue,firstMissing:resultData.firstMissing},...history].slice(0,50))}
    window.dispatchEvent(new CustomEvent("chappy:hiyori-event-health-updated",{detail:resultData}));
    return resultData;
  }
  function fmt(value){const d=new Date(value);return Number.isNaN(d.getTime())?"-":d.toLocaleString("ja-JP")}
  function root(){const dashboard=document.getElementById("hiyoriOperationsDashboard");if(!dashboard)return null;let holder=document.getElementById("hiyoriEventHealthPanel");if(holder)return holder;holder=document.createElement("section");holder.id="hiyoriEventHealthPanel";holder.style.cssText="margin-top:12px;padding:12px;border:1px solid #dbe6f3;border-radius:12px;background:#fff";dashboard.appendChild(holder);return holder}
  function meta(level){return level==="critical"?{label:"重大",bg:"#fef2f2",border:"#fca5a5",text:"#991b1b"}:level==="warning"?{label:"注意",bg:"#fffbeb",border:"#fcd34d",text:"#92400e"}:{label:"待機中",bg:"#eff6ff",border:"#93c5fd",text:"#1d4ed8"}}
  function render(data=diagnose()){
    const holder=root();if(!holder)return data;
    const history=list(read(HISTORY_KEY,[]));
    holder.innerHTML=`<details open><summary style="font-weight:700;cursor:pointer">イベント健全性　重大 ${data.counts.critical}／注意 ${data.counts.warning}／待機 ${data.counts.waiting}</summary><div style="margin-top:9px;font-size:12px">${data.latestEvent?`<div><b>最終イベント：</b>${data.latestEvent.label}（${fmt(data.latestEvent.lastFiredAt)}）</div>`:`<div><b>最終イベント：</b>未記録</div>`}${data.topIssue?`<div style="margin-top:4px"><b>最優先：</b>${meta(data.topIssue.level).label}・${data.topIssue.label}</div>`:`<div><b>最優先：</b>対応なし</div>`}<div style="display:grid;gap:6px;margin-top:9px">${data.issues.length?data.issues.map(x=>{const m=meta(x.level);return`<div style="padding:8px;border-radius:9px;background:${m.bg};border:1px solid ${m.border}"><b style="color:${m.text}">${m.label}：${x.label}</b><span style="display:block;margin-top:3px;color:#64748b">${x.message}</span><span style="display:block;margin-top:3px"><b>確認：</b>${x.action}</span></div>`}).join(""):`<div style="padding:8px;border-radius:9px;background:#ecfdf5;border:1px solid #86efac"><b>イベント順序・鮮度に異常なし</b></div>`}</div><details style="margin-top:9px"><summary style="cursor:pointer;font-weight:700">異常状態の変更履歴</summary>${history.length?history.slice(0,8).map(x=>`<div style="margin-top:6px;padding:7px;border-radius:8px;background:#f8fafc"><b>${x.topIssue?`${meta(x.topIssue.level).label}・${x.topIssue.label}`:"正常"}</b><small style="display:block;color:#64748b">${fmt(x.checkedAt)} ／ 重大${x.counts?.critical||0} 注意${x.counts?.warning||0} 待機${x.counts?.waiting||0}</small></div>`).join(""):`<small style="display:block;margin-top:6px;color:#64748b">履歴はまだありません。</small>`}</details><small style="display:block;margin-top:8px;color:#64748b">確認専用です。イベント強制発火、データ補完、自動修復、本番反映は行いません。</small></div></details>`;
    return data;
  }
  function install(){render();["chappy:hiyori-event-monitor-updated","chappy:hiyori-runtime-ready"].forEach(name=>window.addEventListener(name,()=>render()));setInterval(()=>render(),60000)}
  window.ChappyHiyoriEventHealth={diagnose,render,status:()=>read(HEALTH_KEY,null),history:()=>list(read(HISTORY_KEY,[]))};
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install,{once:true});else install();
})();