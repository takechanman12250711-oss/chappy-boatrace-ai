const fs = require('fs');
const source = fs.readFileSync('js/home-dashboard-v2.js', 'utf8');
const required = [
  'waitForRaceOption',
  '出走表・展示・オッズ・AI予想を取得中',
  '1R〜12R',
  'home-v2-selection-status',
  'fetchButton.click()',
  'state.selectedPlace',
  'state.selectedRace'
];
for (const token of required) {
  if (!source.includes(token)) throw new Error(`Phase2 required token missing: ${token}`);
}
if (/buildMarks|buildFormations|practicalTickets/.test(source)) {
  throw new Error('Phase2 must not modify prediction or ticket logic');
}
console.log('home dashboard v2 phase2 tests passed');
