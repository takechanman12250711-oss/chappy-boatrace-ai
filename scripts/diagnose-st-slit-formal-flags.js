"use strict";
const fs=require("node:fs"),path=require("node:path");
const root=path.resolve(__dirname,"..");
const dir=path.join(root,"data","predictions");
function docs(){return fs.readdirSync(dir).filter(n=>/^\d{8}\.json$/.test(n)).sort().map(n=>JSON.parse(fs.readFileSync(path.join(dir,n),"utf8")));}
function roles(r={}){const p=r.prediction||{};const v=p.verificationEvidence||{};return Array.isArray(v?.stSlit?.roles)?v.stSlit.roles:[];}
function scan(list){const byDate={};let races=0,roleRaces=0,formalRaces=0,appliedRaces=0,rolesTotal=0,formalRoles=0,appliedRoles=0;for(const d of list){for(const name of["predictions","verificationPredictions"]){for(const r of(d[name]||[])){races++;const rs=roles(r);if(!rs.length)continue;roleRaces++;rolesTotal+=rs.length;const f=rs.some(x=>x?.isFormal===true),a=rs.some(x=>x?.appliedToScore===true);if(f)formalRaces++;if(a)appliedRaces++;formalRoles+=rs.filter(x=>x?.isFormal===true).length;appliedRoles+=rs.filter(x=>x?.appliedToScore===true).length;const k=String(r.date||d.date||"unknown");byDate[k]??={roleRaces:0,formalRaces:0,appliedRaces:0};byDate[k].roleRaces++;if(f)byDate[k].formalRaces++;if(a)byDate[k].appliedRaces++;}}}return{races,roleRaces,formalRaces,appliedRaces,rolesTotal,formalRoles,appliedRoles,byDate};}
const out=scan(docs());console.log(JSON.stringify(out,null,2));
if(out.roleRaces>0&&out.formalRaces===0&&out.appliedRaces===0)process.exitCode=2;
