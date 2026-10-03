from pathlib import Path
import hashlib,re
root=Path('.')
p=root/'js/practical-selection.js'
s=p.read_text()
raw=s.encode()
assert hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()=='ef2152457b52fb9b5a55d40e1dc64d969343b990','base selector changed'
def replace(old,new):
    global s
    assert s.count(old)==1,repr(old)
    s=s.replace(old,new)
plan=(root/'_pr1163_repair/plan.txt').read_text()
activation=(root/'_pr1163_repair/activation.txt').read_text()
apply=(root/'_pr1163_repair/apply.txt').read_text()
replace('  function selectForecast(prediction) {',plan+activation+'  function selectForecast(prediction, options = {}) {\n    const partnerPolicyActive = escapeRolePartnerActive(prediction, options);')
replace('    const selectedExpansionBoundary =',apply+'    const selectedExpansionBoundary =')
replace('    const expansionSummary = {','    const expansionSummary = {\n      ...(escapeRolePartnerReplacement ? {escapeRolePartnerReplacement} : {}),')
replace('"practical-5-7-10-grounded-flow2-candidate90-strongescape-prioritygate-v5-coursefailclosed1"','"practical-5-7-10-grounded-flow2-candidate90-strongescape-prioritygate-v5-coursefailclosed1" +\n          (partnerPolicyActive ? "|" + ESCAPE_ROLE_PARTNER_POLICY.id : "")')
replace('  function select(prediction) {\n    const result = selectForecast(prediction);','  function select(prediction, options = {}) {\n    const result = selectForecast(prediction, options);')
replace('  const api = {','  const api = {\n    ESCAPE_ROLE_PARTNER_POLICY,\n    escapeRolePartnerActive,\n    planEscapeRolePartnerReplacement,')
replace('      reason:\n        strongEscapeTrim.applied','      reason:\n        escapeRolePartnerReplacement ? escapeRolePartnerReplacement.reason :\n        strongEscapeTrim.applied')
assert hashlib.sha256(s.encode()).hexdigest()=='c65fb55003cd7247a756e90b6470d64ecd8dbc53394ba42370962d00d8376a21','not identical to locally tested selector'
p.write_text(s)
p=root/'js/prediction-runtime-loader.js'
s=p.read_text();old='"js/practical-selection.js": "20260923-wall-purchase1"';assert s.count(old)==1
p.write_text(s.replace(old,'"js/practical-selection.js": "20261003-escape-partner-v13"'))
p=root/'index.html';s=p.read_text()
s,n=re.subn(r'(src="js/prediction-runtime-loader\.js\?[^"\n]*)"',r'\1&escapePartner=20261003-v13"',s)
assert n==1,'runtime script tag not unique'
p.write_text(s)
print('Prepared exact locally tested selector and cache-version changes')
