// 日和運用基盤の読み取り専用セルフテスト。予想・買い目・本番設定は変更しない。
(function(){
  "use strict";
  const RESULT_KEY="chappy_hiyori_operations_self_test_v1";
  const HISTORY_KEY="chappy_hiyori_operations_self_test_history_v1";
  const REQUIRED_GLOBALS=[
    "ChappyHiyoriRuntimeDiagnostics","ChappyHiyoriOperationsDashboard","ChappyHiyoriEventHealth",
    "ChappyHiyoriOperationsSummary","ChappyHiyoriOperationsSnapshot","ChappyHiyoriOperationsSnapshotCompare",
    "ChappyHiyoriOperationsReport"
  ];
  const REQUIRED_KEYS=[
    "chappy_hiyori_runtime_diagnostics_v1","chappy_hiyori_operations_summary_v1",
    "chappy_hiyori_pipeline_diagnosis_v1","chappy_hiyori_event_health_v1"
  ];
  function read(key,fallback){try{return JSON.parse(localStorage.getItem(key)||"null")??fallback}catch(_){return fallback}}
  function write(key,value){localStorage.setItem(key,JSON.stringify(value))}
  function test(name,passed,detail,level){return{name,passed:passed===true,detail:detail||"",level:level||"required"}}
  function run(){
    const runtime=read("chappy_hiyori_runtime_diagnostics_v1",null);
    const summary=read("chappy_hiyori_operations_summary_v1",null);
    const checks=[];
    REQUIRED_GLOBALS.forEach(name=>checks.push(test(`モジュール ${name}`,typeof window[name]!=="undefined",typeof window[name]!=="undefined"?"読込済み":"未読込")));
    REQUIRED_KEYS.forEach(key=>checks.push(test(`保存キー ${key}`,localStorage.getItem(key)!==null,localStorage.getItem(key)!==null?"存在":"未生成","advisory")));
    checks.push(test("ランタイム接続",runtime?.connected===true,runtime?.connected===true?"接続済み":"未接続"));
    checks.push(test("安全ロック",runtime?.globalProductionLock!==false&&summary?.safeLock!==false,"安全ロック維持"));
    checks.push(test("予想へ未反映",runtime?.appliedToPrediction!==true,"予想ロジック未変更"));
    checks.push(test("本番へ未適用",runtime?.productionApplied!==true,"本番未反映"));
    const required=checks.filter(row=>row.level==="required");
    const passed=required.filter(row=>row.passed).length;
    const result={
      createdAt:new Date().toISOString(),
      status:passed===required.length?"passed":"failed",
      passed,required:required.length,
      advisoryMissing:checks.filter(row=>row.level==="advisory"&&!row.passed).length,
      checks,
      safety:{productionApplied:false,appliedToPrediction:false,globalProductionLock:true,readOnly:true}
    };
    write(RESULT_KEY,result);
    const history=read(HISTORY_KEY,[]);
    write(HISTORY_KEY,[result,...(Array.isArray(history)?history:[])].slice(0,30));
    window.dispatchEvent(new CustomEvent("chappy:hiyori-operations-self-test-completed",{detail:result}));
    render();
    return result;
  }
  function root(){
    const dashboard=document.getElementById("hiyoriOperationsDashboard");if(!dashboard)return null;
    let holder=document.getElementById("hiyoriOperationsSelfTestPanel");
    if(!holder){holder=document.createElement("section");holder.id="hiyoriOperationsSelfTestPanel";holder.style.cssText="margin-top:12px;padding:12px;border:1px solid #dbe6f3;border-radius:12px;background:#fff";dashboard.appendChild(holder)}
    return holder;
  }
  function render(){
    const holder=root();if(!holder)return null;
    const result=read(RESULT_KEY,null);
    const failed=(result?.checks||[]).filter(row=>!row.passed);
    const statusLabel=result?`— ${result.status==="passed"?"正常":"要確認"}`:"";
    const failedHtml=failed.length
      ?`<div style="margin-top:7px;font-size:11px">${failed.slice(0,8).map(row=>`・${row.name}：${row.detail}`).join("<br>")}</div>`
      :"<small style=\"display:block;margin-top:5px\">重大な接続異常はありません。</small>";
    const resultHtml=result
      ?`<div style="margin-top:9px;padding:9px;border-radius:10px;background:${result.status==="passed"?"#ecfdf5":"#fff7ed"}"><b>${result.passed}/${result.required} 項目正常</b><small style="display:block;margin-top:3px;color:#64748b">任意キー未生成 ${result.advisoryMissing}件</small>${failedHtml}</div>`
      :"<small style=\"display:block;margin-top:8px;color:#64748b\">未実行です。</small>";
    holder.innerHTML=`<details><summary style="font-weight:700;cursor:pointer">運用基盤セルフテスト ${statusLabel}</summary><div style="margin-top:9px"><button type="button" data-run-ops-self-test style="width:100%;padding:10px 12px;border:0;border-radius:10px;background:#334155;color:#fff;font-weight:700">セルフテストを実行</button>${resultHtml}<small style="display:block;margin-top:6px;color:#64748b">確認専用です。予想・買い目・本番設定は変更しません。</small></div></details>`;
    holder.querySelector("[data-run-ops-self-test]")?.addEventListener("click",run);
    return result;
  }
  function install(){render();window.addEventListener("chappy:hiyori-runtime-ready",()=>setTimeout(run,0),{once:true})}
  window.ChappyHiyoriOperationsSelfTest={run,render,get:()=>read(RESULT_KEY,null)};
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install,{once:true});else install();
})();
