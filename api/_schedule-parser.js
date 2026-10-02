"use strict";

function decodeHref(value) {
  return String(value || "").replace(/&amp;/g, "&");
}

function parseRaceHref(block) {
  const html = String(block || "");
  const matches = html.matchAll(/href=["']([^"']*\/race\/racelist\?[^"']+)["']/gi);

  for (const match of matches) {
    const href = decodeHref(match[1]);
    const query = href.split("?")[1] || "";
    const params = new URLSearchParams(query);
    const jcd = String(params.get("jcd") || "").padStart(2, "0");
    const raceNo = Number(params.get("rno") || 0);
    const date = String(params.get("hd") || "");

    if (/^(0[1-9]|1[0-9]|2[0-4])$/.test(jcd) && raceNo >= 1 && raceNo <= 12) {
      return { href, jcd, raceNo, date };
    }
  }

  return null;
}

module.exports = { decodeHref, parseRaceHref };
