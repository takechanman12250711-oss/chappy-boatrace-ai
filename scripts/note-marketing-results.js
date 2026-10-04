'use strict';
// Invoke the existing official result handler only for a validated race key.
async function fetchOfficialResult(raceKey) {
  if (!/^\d{8}-(0[1-9]|1[0-9]|2[0-4])-([1-9]|1[0-2])$/.test(raceKey)) throw Error('marketing_result_key_invalid');
  const [date, jcd, rno] = raceKey.split('-');
  return new Promise((resolve, reject) => {
    let status = 200;
    const response = { setHeader() {}, status(code) { status = code; return this; },
      json(value) { if (status >= 400 || value?.ok !== true) reject(Error('marketing_official_fetch_failed')); else resolve(value); } };
    Promise.resolve(require('../api/result')({ query: { date, jcd, rno } }, response)).catch(reject);
  });
}
module.exports = { fetchOfficialResult };
