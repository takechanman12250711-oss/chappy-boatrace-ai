const fs = require('fs');
const source = fs.readFileSync('js/home-dashboard-v2.js', 'utf8');
const required = [
  'ChappyRaceSelection.select',
  'ChappyStartupGate?.activateRace',
  'syncAndOpen',
  'fetchButton.click()',
  'state.selectedPlace',
  'state.selectedRace',
  'setView("prediction")',
  'PAGE_SIZE = 5',
  'slice(0, state.visibleCount)',
  'sessionStorage',
  'requestIdleCallback',
  'requestMap',
  'renderRecommendations',
  'renderSchedule'
];
for (const token of required) {
  if (!source.includes(token)) throw new Error(`Home performance token missing: ${token}`);
}
if (/buildMarks|buildFormations|practicalTickets/.test(source)) {
  throw new Error('Home performance work must not modify prediction or ticket logic');
}
console.log('home dashboard performance tests passed');
