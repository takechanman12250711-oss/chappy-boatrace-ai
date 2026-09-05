(function(root){
  "use strict";
  if(!root)return;

  const FLAG="__chappyTicketSpecificReasonWrapped";

  function exactTicket(value){
    const text=String(value||"").replace(/\s+/g,"").trim();
    return /^[1-6]-[1-6]-[1-6]$/.test(text)&&new Set(text.split("-")).size===3?text:"";
  }

  function courseOf(prediction,boatNo){
    const n=Number(boatNo);
    const byBoat=prediction?.indexes?.byBoat||{};
    const candidate=Number(byBoat?.[n]?.course??n);
    return Number.isInteger(candidate)&&candidate>=1&&candidate<=6?candidate:n;
  }

  function headAction(course){
    if(course===1)return "イン先マイ";
    if(course===2)return "2コース差し";
    if(course===3)return "3コース攻め";
    if(course===4)return "4カド攻め";
    if(course===5)return "5コースまくり差し";
    if(course===6)return "6コース最内差し";
    return "1着展開";
  }

  function secondAction(course){
    if(course===1)return "イン残し";
    if(course===2)return "差し残り";
    if(course===3)return "センター残り";
    if(course===4)return "カド残り";
    if(course===5)return "展開拾い";
    if(course===6)return "道中拾い";
    return "2着残し";
  }

  function thirdAction(course){
    if(course===1)return "インの3着残り";
    if(course===2)return "差し残りの3着";
    if(course===3)return "センターの3着";
    if(course===4)return "カドの3着";
    if(course===5)return "外の3着拾い";
    if(course===6)return "最内の3着拾い";
    return "3着拾い";
  }

  function reasonFor(ticket,prediction){
    const exact=exactTicket(ticket);
    if(!exact)return "";
    const [a,b,c]=exact.split("-").map(Number);
    const ca=courseOf(prediction,a);
    const cb=courseOf(prediction,b);
    const cc=courseOf(prediction,c);
    return `${a}号艇の${headAction(ca)}を軸に、${b}号艇の${secondAction(cb)}を2着、${c}号艇の${thirdAction(cc)}を3着で評価。`;
  }

  function ticketText(row){
    if(typeof row==="string")return row;
    if(!row||typeof row!=="object")return "";
    return row.ticket||row.line||row.notation||row.formation?.notation||row.formation||"";
  }

  function decorateList(list,prediction){
    if(!Array.isArray(list))return list;
    return list.map(row=>{
      if(!row||typeof row!=="object")return row;
      const reason=reasonFor(ticketText(row),prediction);
      return reason?{...row,reason,scenarioSummary:reason}:row;
    });
  }

  function buildFlowFormations(list,prediction){
    if(!Array.isArray(list))return [];
    const groups=new Map();
    list.forEach(row=>{
      const exact=exactTicket(ticketText(row));
      if(!exact)return;
      const [a,b,c]=exact.split("-");
      const key=`${a}-${b}`;
      if(!groups.has(key))groups.set(key,{a,b,thirds:[],tickets:[]});
      const group=groups.get(key);
      if(!group.thirds.includes(c))group.thirds.push(c);
      group.tickets.push(exact);
    });
    return [...groups.values()].map(group=>{
      group.thirds.sort((a,b)=>Number(a)-Number(b));
      const notation=`${group.a}-${group.b}-${group.thirds.join("")}`;
      const reasons=group.tickets.map(ticket=>reasonFor(ticket,prediction)).filter(Boolean);
      return {
        notation,
        pointCount:group.tickets.length,
        expandedTickets:[...group.tickets],
        reason:reasons.length===1?reasons[0]:`${group.a}号艇の${headAction(courseOf(prediction,group.a))}を軸に、${group.b}号艇を2着固定、3着${group.thirds.join("・")}号艇へ展開。`
      };
    });
  }

  function prepare(prediction){
    if(!prediction||typeof prediction!=="object")return prediction;
    const next={...prediction};
    const rawFlow=prediction.mainSheet?.flowTickets||prediction.ticketSheets?.flow||[];
    const fallbackFormations=buildFlowFormations(rawFlow,prediction);
    if(prediction.mainSheet){
      next.mainSheet={...prediction.mainSheet,
        tickets:decorateList(prediction.mainSheet.tickets,prediction),
        coverTickets:decorateList(prediction.mainSheet.coverTickets,prediction),
        flowTickets:decorateList(prediction.mainSheet.flowTickets,prediction),
        flowFormations:Array.isArray(prediction.mainSheet.flowFormations)&&prediction.mainSheet.flowFormations.length?prediction.mainSheet.flowFormations:fallbackFormations
      };
    }
    if(prediction.manshuSheet){
      next.manshuSheet={...prediction.manshuSheet,
        tickets:decorateList(prediction.manshuSheet.tickets,prediction)
      };
    }
    if(prediction.ticketSheets){
      next.ticketSheets={...prediction.ticketSheets,
        main:decorateList(prediction.ticketSheets.main,prediction),
        cover:decorateList(prediction.ticketSheets.cover,prediction),
        flow:decorateList(prediction.ticketSheets.flow,prediction),
        hole:decorateList(prediction.ticketSheets.hole,prediction),
        all:decorateList(prediction.ticketSheets.all,prediction)
      };
    }
    next.formation={...(prediction.formation||{}),flowFormations:Array.isArray(prediction.formation?.flowFormations)&&prediction.formation.flowFormations.length?prediction.formation.flowFormations:fallbackFormations};
    next.aiTicketList=decorateList(prediction.aiTicketList,prediction);
    return next;
  }

  function install(target){
    if(!target||target[FLAG])return false;
    ["renderAll","renderPrediction"].forEach(name=>{
      const original=target[name];
      if(typeof original!=="function")return;
      target[name]=function(prediction,...args){
        return original.call(this,prepare(prediction),...args);
      };
    });
    target[FLAG]=true;
    return true;
  }

  const api=Object.freeze({exactTicket,courseOf,reasonFor,buildFlowFormations,prepare,install});
  root.ChappyTicketSpecificReason=api;
  install(root);
})(typeof window!=="undefined"?window:globalThis);
