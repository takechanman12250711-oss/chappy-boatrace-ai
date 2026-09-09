"use strict";

// Read-only draft checks. Passing these checks is NEVER publication permission.
const { createHash } = require("node:crypto");
const VERSION = "note-publication-audit-v1";
const PAYWALL = "──────── ここから先は有料部分です ────────";
const NOTICE = "※舟券の購入は自己責任で、無理のない範囲でお楽しみください。";
const normalized = value => String(value ?? "").normalize("NFKC");
const ticketOf = row => normalized(typeof row === "string" ? row : row?.ticket);
const validTicket = value => /^[1-6]-[1-6]-[1-6]$/.test(value) && new Set(value.split("-")).size === 3;
const ticketsOf = rows => Array.isArray(rows) ? rows.map(ticketOf) : [];
const sameList = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const absoluteTime = value => typeof value === "string" && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)
  ? Date.parse(value) : NaN;
const sha256 = value => createHash("sha256").update(value, "utf8").digest("hex");

function ticketMentions(value) {
  // Keep slash/comma-separated ticket lists separate; 全 and ALL are formation axes.
  const pattern = /(?<![0-9A-Z])([1-6]+(?:・[1-6]+)*|全|ALL)[ \t]*[-→－–―][ \t]*([1-6]+(?:・[1-6]+)*|全|ALL)[ \t]*[-→－–―][ \t]*([1-6]+(?:・[1-6]+)*|全|ALL)(?![0-9A-Z])/gi;
  return [...normalized(value).matchAll(pattern)].map(match =>
    match.slice(1, 4).map(axis => axis.toUpperCase().replaceAll("ALL", "全").replaceAll("・", "")).join("-")
  );
}

function expandedMention(notation) {
  const axes = notation.split("-").map(axis => [...new Set((axis === "全" ? "123456" : axis).split(""))]);
  return axes[0].flatMap(first => axes[1].flatMap(second => axes[2]
    .map(third => `${first}-${second}-${third}`).filter(validTicket)));
}

function auditAdditionalTickets(paidText, prediction, issue) {
  // Only persisted candidate pools can support ordinary ticket mentions.
  const candidateTickets = new Set([
    ...ticketsOf(prediction?.mainSheet?.tickets),
    ...ticketsOf(prediction?.mainSheet?.coverTickets),
    ...ticketsOf(prediction?.mainSheet?.flowTickets),
    ...ticketsOf(prediction?.manshuSheet?.tickets),
    ...ticketsOf(prediction?.practicalTickets)
  ].filter(validTicket));
  const referenceTickets = new Set();
  const referenceFormations = new Set();
  const forecasts = prediction?.manshuSheet?.forecastLedger?.forecasts;
  (Array.isArray(forecasts) ? forecasts : []).forEach(forecast => {
    const formation = forecast?.formation;
    const expanded = ticketsOf(formation?.expandedTickets).filter(validTicket);
    if (!expanded.length) return;
    expanded.forEach(ticket => referenceTickets.add(ticket));
    ticketMentions(formation?.notation).forEach(notation => referenceFormations.add(notation));
  });

  let referenceSection = false;
  normalized(paidText).split("\n").forEach(line => {
    const text = line.trim();
    if (/^【本命とは別会計の参考予想】|^【参考(?:・|】)/.test(text)) {
      referenceSection = true;
    } else if (/^【|^🔥 実戦厳選買い目/.test(text)) {
      referenceSection = false;
    }
    ticketMentions(line).forEach(notation => {
      const expanded = expandedMention(notation);
      const supported = referenceSection
        ? referenceFormations.has(notation) ||
          (expanded.length > 0 && expanded.every(ticket => referenceTickets.has(ticket)))
        : expanded.length > 0 && expanded.every(ticket => candidateTickets.has(ticket));
      if (!supported) {
        issue(referenceSection ? "UNSOURCED_REFERENCE_TICKET" : "UNSOURCED_CANDIDATE_TICKET",
          referenceSection
            ? `${notation}を保存済みの参考・万舟予測台帳で確認できません。`
            : `${notation}を保存済みの候補・実戦厳選で確認できません。`);
      }
    });
  });
}

function auditNotePublication(input = {}) {
  const report = {
    version: VERSION,
    status: "blocked",
    contentReady: false,
    canPublish: false,
    automaticPublicationEnabled: false,
    issues: [],
    auditedAt: "",
    raceKey: "",
    articleSha256: ""
  };
  const issue = (code, message) => report.issues.push({ code, message });
  try {
    const { article, record, baselinePracticalTickets, now = new Date().toISOString(),
      minLeadSeconds = 120, maxPracticalTickets = 10 } = input;
    report.auditedAt = typeof now === "string" ? now : "";
    report.raceKey = typeof record?.raceKey === "string" ? record.raceKey : "";
    if (!article || !record) {
      issue("INPUT_MISSING", "生成記事と保存予想の両方が必要です。");
      return report;
    }
    if (!Number.isFinite(minLeadSeconds) || minLeadSeconds < 120 ||
        !Number.isInteger(maxPracticalTickets) || maxPracticalTickets < 1 || maxPracticalTickets > 10) {
      issue("POLICY_INVALID", "締切余裕120秒以上・厳選最大10点以内の検査設定が必要です。");
    }
    if (article.ok !== true || article.publishable !== true) {
      issue("GENERATION_REJECTED", "既存の原稿生成条件を満たしていません。");
    }

    const date = String(record.date ?? "");
    const jcd = String(record.jcd ?? "").padStart(2, "0");
    const raceNo = Number(record.raceNo);
    const place = normalized(record.place);
    const meta = article.meta || {};
    if (!/^\d{8}$/.test(date) || !/^(0[1-9]|1\d|2[0-4])$/.test(jcd) ||
        !Number.isInteger(raceNo) || raceNo < 1 || raceNo > 12 || !place ||
        report.raceKey !== `${date}-${jcd}-${raceNo}` ||
        String(meta.date) !== date || normalized(meta.place) !== place || Number(meta.raceNo) !== raceNo) {
      issue("RACE_IDENTITY_MISMATCH", "日付・場・レース番号が保存予想と一致しません。");
    }

    const deadline = absoluteTime(record.deadlineAt);
    const current = absoluteTime(now);
    if (!Number.isFinite(current)) issue("CLOCK_INVALID", "検査時刻にタイムゾーン付きの日時が必要です。");
    if (!Number.isFinite(deadline)) {
      issue("DEADLINE_MISSING", "公式締切の絶対時刻を確認できません。");
    } else {
      if (Number.isFinite(current) && deadline - current <= minLeadSeconds * 1000) {
        issue("DEADLINE_TOO_CLOSE", "締切済み、または締切までの余裕が不足しています。");
      }
      const jst = new Date(deadline + 9 * 60 * 60 * 1000).toISOString();
      const clock = jst.slice(11, 16);
      const display = normalized(meta.deadline).replace(/^締切\s*/, "").trim();
      if (jst.slice(0, 10).replaceAll("-", "") !== date || display !== clock ||
          !normalized(article.freeText).includes(`締切 ${clock}`)) {
        issue("DEADLINE_DISPLAY_MISMATCH", "原稿の締切表示が保存された公式締切と一致しません。");
      }
    }

    const { title, freeText, paidText, fullText, paywallMarker, tags } = article;
    if (![title, freeText, paidText, fullText].every(value => typeof value === "string" && value.trim())) {
      issue("ARTICLE_INCOMPLETE", "タイトル・無料部分・有料部分・全文が必要です。");
      return report;
    }
    report.articleSha256 = sha256(`# ${title}\n\n${fullText}\n`);
    const raceLabel = `${Number(date.slice(4, 6))}月${Number(date.slice(6, 8))}日 ${place}${raceNo}R`;
    if (!normalized(title).includes(raceLabel) || !normalized(freeText).includes(raceLabel)) {
      issue("RACE_LABEL_MISMATCH", "タイトルまたは本文の対象レース表示が一致しません。");
    }
    if (paywallMarker !== PAYWALL || fullText.split(PAYWALL).length !== 2 ||
        freeText.includes(PAYWALL) || paidText.includes(PAYWALL)) {
      issue("PAYWALL_INVALID", "有料境界は指定マーカー1箇所である必要があります。");
    }
    const expectedFullText = [freeText, PAYWALL, paidText, NOTICE,
      Array.isArray(tags) ? tags.join(" ") : ""].filter(Boolean).join("\n\n");
    if (!Array.isArray(tags) || fullText !== expectedFullText) {
      issue("ARTICLE_ASSEMBLY_MISMATCH", "全文が無料部分・有料部分・注意書き・タグと一致しません。");
    }
    // Includes explicit wildcard formations; not a semantic leakage guarantee.
    if (ticketMentions(`${title}\n${freeText}`).length) {
      issue("FREE_TICKET_LEAK", "無料部分またはタイトルに具体的な3連単買い目が含まれています。");
    }
    if (/未取得|未確認|取得失敗/.test(fullText)) {
      issue("UNRESOLVED_DATA", "本文に未取得・未確認の表示が残っています。");
    }

    const stored = ticketsOf(record.prediction?.practicalTickets);
    const baseline = ticketsOf(baselinePracticalTickets);
    const generated = ticketsOf(article.practicalTickets);
    if (!stored.length || stored.length > maxPracticalTickets || stored.some(ticket => !validTicket(ticket)) ||
        new Set(stored).size !== stored.length) {
      issue("STORED_TICKETS_INVALID", "保存済み厳選の点数・艇番・重複に問題があります。");
    }
    if (!baseline.length || !sameList(baseline, stored)) {
      issue("BASELINE_TICKETS_MISMATCH", "原稿生成前の独立した保存予想と買い目・順序が一致しません。");
    }
    if (!sameList(generated, stored)) {
      issue("ARTICLE_TICKETS_MISMATCH", "原稿データの厳選買い目・順序が保存予想と一致しません。");
    }
    report.sourceTicketsSha256 = sha256(JSON.stringify({ raceKey: report.raceKey, tickets: baseline }));

    // Validate their separate sources without adding candidates/references to practical counts.
    auditAdditionalTickets(paidText, record.prediction, issue);
    const practicalBlocks = [...normalized(paidText).matchAll(
      /🔥 実戦厳選買い目\n([\s\S]*?)\n厳選買い目\s+(\d+)点\/最大10点/g
    )];
    if (practicalBlocks.length !== 1) {
      issue("PRACTICAL_SECTION_INVALID", "厳選ブロックと点数表示を一意に確認できません。");
    } else {
      const block = practicalBlocks[0];
      const lines = block[1].split("\n").filter(line => line.startsWith("・"));
      const rendered = lines.map(line => line.match(/^・(\S+)/)?.[1] || "");
      if (!sameList(rendered, stored) || Number(block[2]) !== stored.length) {
        issue("RENDERED_TICKETS_MISMATCH", "有料本文の厳選買い目・順序・点数が保存予想と一致しません。");
      }
      lines.forEach((line, index) => {
        const shown = Number(line.match(/\s(\d+(?:\.\d+)?)倍(?:\s|$)/)?.[1]);
        const source = Number(record.prediction?.practicalTickets?.[index]?.odds);
        const original = Number(baselinePracticalTickets?.[index]?.odds);
        const articleOdds = Number(article.practicalTickets?.[index]?.odds);
        if (![shown, source, original, articleOdds].every(value => Number.isFinite(value) && value > 0)) {
          issue("ODDS_MISSING", `${rendered[index] || index + 1}のオッズを確認できません。買い目は変更しません。`);
        } else if (![source, original, articleOdds].every(value => value === shown)) {
          issue("ODDS_MISMATCH", `${rendered[index]}の表示オッズが保存スナップショットと一致しません。`);
        }
      });
    }
    const evaluationSection = normalized(paidText).match(/【6艇評価】\n([\s\S]*?)\n【AI買い目候補/);
    const boats = evaluationSection ? [...evaluationSection[1].matchAll(/^([1-6])号艇/gm)].map(match => match[1]).sort() : [];
    if (!sameList(boats, ["1", "2", "3", "4", "5", "6"])) {
      issue("BOAT_EVALUATIONS_INCOMPLETE", "6艇評価の艇番・重複・欠落を確認してください。");
    }
    report.contentReady = report.issues.length === 0;
    report.status = report.contentReady ? "ready_for_review" : "blocked";
    return report;
  } catch {
    report.status = "audit_error";
    report.contentReady = false;
    issue("AUDIT_EXECUTION_FAILED", "原稿監査を実行できませんでした。公開は停止しています。");
    return report;
  }
}

module.exports = { VERSION, auditNotePublication };

if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    if (![2, 4].includes(args.length) || args[0] !== "--input" ||
        (args.length === 4 && args[2] !== "--now")) {
      throw new Error("Usage: node scripts/note-publication-audit.js --input payload.json [--now ISO_TIMESTAMP]");
    }
    const payload = JSON.parse(require("node:fs").readFileSync(args[1], "utf8"));
    // A payload cannot set its own clock. --now is for reproducible offline checks only.
    const report = auditNotePublication({ ...payload, now: args[3] || new Date().toISOString() });
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    process.exitCode = report.contentReady ? 0 : 1;
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
  }
}
