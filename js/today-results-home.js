(function(root){
  "use strict";
  if(root.ChappyTodayResultsHome)return;

  function load(){
    if(document.querySelector('script[data-race-flow-result]'))return;
    const script=document.createElement("script");
    script.src="js/race-flow-result-panel.js?v=20260802-unified2";
    script.async=true;
    script.dataset.raceFlowResult="true";
    document.head.appendChild(script);
  }

  root.ChappyTodayResultsHome=Object.freeze({load});
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",load,{once:true});
  else load();
})(window);
