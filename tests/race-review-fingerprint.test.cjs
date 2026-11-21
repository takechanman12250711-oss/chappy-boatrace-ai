"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),vm=require("node:vm"),fs=require("node:fs"),path=require("node:path");
const source=fs.readFileSync(path.join(__dirname,"../scripts/race-review-evidence.js"),"utf8");
function fingerprint(platform,nested="const selection = 1;"){
 const root=platform==="win32"?"C:\\repo":"/repo";
 const files={"js/ai-core.js":'require("./nested/entry"); require("../scripts/not-prediction");',
  "js/nested/entry.js":'require("../../config/role.json");', "config/role.json":nested};
 const accessed=[],module={exports:{}};
 const fakeFs={readFileSync(file){
  const name=file.replace(/\\/g,"/").replace(/^(?:C:)?\/repo\//,"");
  accessed.push(name);if(name.startsWith("scripts/"))throw Error("out-of-scope dependency read");
  return files[name]||"";
 }};
 const sandbox={module,exports:module.exports,__dirname:platform==="win32"?"C:\\repo\\scripts":"/repo/scripts",
  require(name){return name==="node:fs"?fakeFs:name==="node:path"?path[platform]:require(name);}};
 vm.runInNewContext(source,sandbox);
 return {hash:module.exports.methodFingerprint(root),accessed};
}
test("Windows and POSIX use identical repository paths and transitive dependencies",()=>{
 const win=fingerprint("win32"),posix=fingerprint("posix");
 assert.equal(win.hash,posix.hash);
 assert.ok(win.accessed.includes("js/nested/entry.js"));assert.ok(win.accessed.includes("config/role.json"));
 assert.ok(!win.accessed.some(f=>f.includes("\\")));
});
test("a transitive config change affects both hosts equally without expanding the prediction scope",()=>{
 const a=fingerprint("win32"),b=fingerprint("win32","const selection = 2;"),c=fingerprint("posix","const selection = 2;");
 assert.notEqual(a.hash,b.hash);assert.equal(b.hash,c.hash);
});
