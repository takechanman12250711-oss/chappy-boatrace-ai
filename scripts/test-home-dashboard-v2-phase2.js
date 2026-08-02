const fs = require('fs');
const source = fs.readFileSync('js/home-dashboard-v2.js', 'utf8');
const required = [
  'waitOption',
  'syncAndOpen',
  'btn.click()',
  'state.selectedPlace',
  'state.selectedRace',
  'setView("prediction")',
  '出走表・オッズ・AI予想'
];
for (const token of required) {
  if (!source.includes(token)) throw new Error(`Home navigation token missing: ${token}`);
}
if (/buildMarks|buildFormations|practicalTickets/.test(source)) {
  throw new Error('Home UI must not modify prediction or ticket logic');
}
console.log('approved home navigation tests passed');
