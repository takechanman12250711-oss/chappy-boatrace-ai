'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {measure}=require('./note-marketing-measurement');
const base={trialStartedAt:'2026-10-04T17:36:00+09:00',observedThrough:'2026-10-13T00:00:00+09:00',traffic:{pageViews:146,xReferralPageViews:null},salesCoverage:{complete:true,from:'2026-10-01T00:00:00+09:00',through:'2026-10-13T00:00:00+09:00'}};
const sale=(id,at,buyer='a',price=200)=>({saleId:id,purchasedAt:at,buyerKey:buyer,articlePriceYen:price,amountYen:price,status:'completed'});
test('only mature 200-yen cohorts count next-JST-day repurchases; output has no identifiers',()=>{
  const output=measure({...base,sales:[sale('one','2026-10-04T18:00:00+09:00'),sale('two','2026-10-04T19:00:00+09:00'),sale('three','2026-10-05T00:01:00+09:00'),sale('four','2026-10-12T18:00:00+09:00','b'),sale('five','2026-10-04T20:00:00+09:00',null),sale('six','2026-10-04T19:00:00+09:00','c',300)]});
  assert.deepEqual(output.sales,{count:5,grossYen:1000,knownBuyers:2,unknownBuyerSales:1,sameDayExtraSales:1});
  assert.deepEqual(output.repeat7Days,{status:'measured_known_buyers',eligibleBuyers:1,repeatBuyers:1,waitingBuyers:1,unknownBuyerSales:1,rate:1});
  assert.equal(output.xPurchaseAttribution,null);assert(!JSON.stringify(output).includes('saleId'));assert(!JSON.stringify(output).includes('buyerKey'));
});
test('missing data, zero sales, incomplete coverage and immature cohorts remain distinct',()=>{
  assert.equal(measure(base).repeat7Days.status,'sales_unavailable');
  assert.equal(measure({...base,sales:[]}).repeat7Days.status,'no_purchases');
  assert.equal(measure({...base,sales:[sale('unknown','2026-10-04T18:00:00+09:00',null)]}).repeat7Days.status,'buyer_identity_unavailable');
  assert.equal(measure({...base,sales:[],salesCoverage:{...base.salesCoverage,complete:false}}).sales,null);
  const pending=measure({...base,sales:[sale('p','2026-10-12T18:00:00+09:00')]});assert.equal(pending.repeat7Days.status,'observation_pending');assert.equal(pending.repeat7Days.rate,null);
  const sameDay=measure({...base,sales:[sale('a','2026-10-04T18:00:00+09:00'),sale('b','2026-10-04T19:00:00+09:00')]});assert.equal(sameDay.repeat7Days.repeatBuyers,0);
  const duplicate=sale('a','2026-10-04T18:00:00+09:00');assert.throws(()=>measure({...base,sales:[duplicate,duplicate]}),/sale_invalid/);
});
