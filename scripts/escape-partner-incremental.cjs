'use strict';
// Research only: accepts pre-race evidence; never receives results or odds.
const VERSION = 'escape-partner-incremental-v1';
const valid = t => typeof t === 'string' && /^[1-6]-[1-6]-[1-6]$/.test(t) && new Set(t.split('-')).size === 3;
function select({base, baseRows, pool, main, formal, exhibition, boats}, {preservePriority = false} = {}) {
  if (!Array.isArray(base) || !base.length || base.length > 10 || base.some(t=>!valid(t)) || new Set(base).size !== base.length) throw Error('invalid-baseline');
  const unchanged = reason => ({tickets:[...base], changed:false, reason});
  if (!formal || !exhibition) return unchanged('official-input-incomplete');
  if (!Array.isArray(boats) || boats.find(b=>b.boatNo===1)?.course!==1) return unchanged('one-not-inside-course');
  if (!Number.isInteger(main) || main < 2 || main > 6) return unchanged('not-alternate-inside-head');
  if (!Array.isArray(pool) || !Array.isArray(baseRows)) return unchanged('missing-evidence');
  const byTicket = new Map();
  for (const p of pool) {
    if (!valid(p?.ticket) || byTicket.has(p.ticket)) return unchanged('invalid-or-duplicate-pool');
    byTicket.set(p.ticket,p);
  }
  const seconds = new Map();
  for(const t of base.filter(t=>t[0]==='1')) seconds.set(t[2],(seconds.get(t[2])||0)+1);
  const options=[];
  for(let i=0;i<base.length;i++) {
    const from=base[i], source=byTicket.get(from), saved=baseRows.find(x=>x.ticket===from);
    if(from[0]!=='1' || seconds.get(from[2])<2 || !saved || ['本線','流し'].includes(saved.category) ||
       !source?.evidenceQualified || !Number.isFinite(source.priorityScore)) continue;
    for(const to of pool) {
      if(to.ticket[0]!=='1' || to.ticket[4]!==from[4] || base.includes(to.ticket) || seconds.has(to.ticket[2]) ||
         to.evidenceQualified!==true || to.candidateKind!=='canonical-formation' || !to.branchIds?.length ||
         !Number.isFinite(to.priorityScore) || (preservePriority && to.priorityScore<source.priorityScore)) continue;
      options.push({index:i,removed:from,added:to.ticket,fromPriority:source.priorityScore,toPriority:to.priorityScore,
        branchIds:[...to.branchIds],savedPurchaseEligible:to.purchaseEligible===true});
    }
  }
  // Fixed tie order: strongest saved alternative, weakest donor, latest donor slot, ticket.
  options.sort((a,b)=>b.toPriority-a.toPriority || a.fromPriority-b.fromPriority || b.index-a.index || a.added.localeCompare(b.added));
  if(!options.length)return unchanged('no-supported-same-third-swap');
  const change=options[0], tickets=[...base];tickets[change.index]=change.added;
  return {tickets,changed:true,reason:'one-new-second-same-third',change};
}
module.exports={VERSION,select};
