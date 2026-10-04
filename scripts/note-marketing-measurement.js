'use strict';
const DAY = 86400000;
const jstDay = ms => new Date(ms + 9 * 3600000).toISOString().slice(0,10);
const timestamp = value => typeof value === 'string' && /(Z|[+-]\d{2}:\d{2})$/.test(value) ? Date.parse(value) : NaN;
// Local-only input: normalized official sales export, never a public data file.
// Output contains aggregate counts only, no buyer or order identifiers.
function measure(input) {
  const start=timestamp(input.trialStartedAt), through=timestamp(input.observedThrough);
  if (!Number.isFinite(start) || !Number.isFinite(through) || through<start) throw Error('measurement_period_invalid');
  const traffic={};
  for(const key of ['pageViews','xReferralPageViews']) {
    const n=input.traffic?.[key];
    if(n!=null && (!Number.isSafeInteger(n)||n<0)) throw Error('measurement_traffic_invalid');
    traffic[key]=n??null;
  }
  const base={trialStartedAt:input.trialStartedAt,observedThrough:input.observedThrough,traffic,
    xPurchaseAttribution:null,sales:null,repeat7Days:{status:'sales_unavailable',eligibleBuyers:null,repeatBuyers:null,rate:null}};
  if(input.sales==null)return base;
  if(!Array.isArray(input.sales))throw Error('measurement_sales_invalid');
  const coverage=input.salesCoverage;
  if(coverage?.complete!==true || timestamp(coverage.from)>start || !Number.isFinite(timestamp(coverage.from)) || timestamp(coverage.through)<through || !Number.isFinite(timestamp(coverage.through))) {
    return {...base,repeat7Days:{...base.repeat7Days,status:'coverage_incomplete'}};
  }
  const ids=new Set(), buyers=new Map();let sales=0,gross=0,unknownBuyerSales=0;
  for(const sale of input.sales) {
    const at=timestamp(sale.purchasedAt);
    if(!sale.saleId || ids.has(sale.saleId) || !Number.isFinite(at) || at<timestamp(coverage.from) || at>timestamp(coverage.through) ||
      !Number.isSafeInteger(sale.articlePriceYen) || sale.articlePriceYen<0 || !Number.isSafeInteger(sale.amountYen) || sale.amountYen<0 ||
      !['completed','refunded','cancelled'].includes(sale.status) || (sale.buyerKey!=null && (typeof sale.buyerKey!=='string'||!sale.buyerKey.trim()))) throw Error('measurement_sale_invalid');
    ids.add(sale.saleId);
    if(at<start||at>through||sale.articlePriceYen!==200||sale.status!=='completed')continue;
    sales++;gross+=sale.amountYen;
    if(!sale.buyerKey){unknownBuyerSales++;continue;}
    const times=buyers.get(sale.buyerKey)||[];times.push(at);buyers.set(sale.buyerKey,times);
  }
  let eligible=0,repeat=0,waiting=0,sameDayExtra=0;
  for(const times of buyers.values()) {
    times.sort((a,b)=>a-b);const first=times[0];
    sameDayExtra+=times.slice(1).filter(t=>jstDay(t)===jstDay(first)).length;
    if(first+7*DAY>through){waiting++;continue;}
    eligible++;
    if(times.some(t=>t>first && t<=first+7*DAY && jstDay(t)!==jstDay(first)))repeat++;
  }
  return {...base,sales:{count:sales,grossYen:gross,knownBuyers:buyers.size,unknownBuyerSales,sameDayExtraSales:sameDayExtra},
    repeat7Days:{status:eligible?'measured_known_buyers':(waiting?'observation_pending':(unknownBuyerSales?'buyer_identity_unavailable':'no_purchases')),
      eligibleBuyers:eligible,repeatBuyers:repeat,waitingBuyers:waiting,unknownBuyerSales,rate:eligible?repeat/eligible:null}};
}
if(require.main===module) {
  try { const input=JSON.parse(require('node:fs').readFileSync(process.argv[2],'utf8'));process.stdout.write(JSON.stringify(measure(input),null,2)+'\n'); }
  catch { console.error('measurement_input_invalid');process.exitCode=1; }
}
module.exports={measure};
