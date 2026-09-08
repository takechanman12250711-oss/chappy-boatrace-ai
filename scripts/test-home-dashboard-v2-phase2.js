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
  'sessionStorage',
  'requestAnimationFrame',
  'buildSelectionSchedule',
  'scheduleData',
  'requestMap',
  'renderRecommendations',
  'setView("race")',
  'home-v2-recommend'
];
for (const token of required) {
  if (!source.includes(token)) throw new Error(`Home performance token missing: ${token}`);
}
if (/buildMarks|buildFormations|practicalTickets/.test(source)) {
  throw new Error('Home performance work must not modify prediction or ticket logic');
}
const shellSource = source.slice(source.indexOf('function ensureShell'), source.indexOf('function renderRecommendations'));
if (/home-v2-filter-shell|home-v2-schedule|data-home-venues/.test(shellSource)) {
  throw new Error('Home must not render venue/race controls');
}
console.log('home dashboard performance tests passed');
