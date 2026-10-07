'use strict';

// Public result images only. The caller must re-run settlePublished against the
// immutable original and official result before passing its verified hit row.
// This module does not fetch, publish, serialize source records, or buy tickets.
// Runtime: Python >=3.10, Pillow==12.3.0, Ubuntu fonts-noto-cjk.
// https://pypi.org/project/pillow/12.3.0/
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawn } = require('node:child_process');
const { RESULT_SERIES_LABELS,isPublishedSectionLabel } = require('./note-result-presentation');
const {validatedReportOrigins}=require('./note-result-provenance');

const VERSION = 'note-result-card-v1';
const INDEX_URL = 'https://note.com/great_robin3243/n/na76b6c6c18ff';
const FONT_PATH = '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc';
const WIDTH = 1200, HEIGHT = 675;
const PNG_SIGNATURE = Buffer.from('89504e470d0a1a0a', 'hex');
const digest = data => createHash('sha256').update(data).digest('hex');
const VENUES = Object.freeze(['桐生', '戸田', '江戸川', '平和島', '多摩川', '浜名湖',
  '蒲郡', '常滑', '津', '三国', 'びわこ', '住之江', '尼崎', '鳴門', '丸亀', '児島',
  '宮島', '徳山', '下関', '若松', '芦屋', '福岡', '唐津', '大村']);
const LABELS = Object.freeze({ normal: 'AI展開予想', escape: '本命予想', manshu: '万舟予想' });
const PUBLISHED_SECTION_LABELS = Object.freeze(['中心の買い目', '相手を広げるなら', '別の展開を考えるなら', '高配当を狙うなら']);
const jstDate = time => new Date(time + 9 * 3600000).toISOString().slice(0, 10).replace(/-/g, '');

function validDate(date) {
  if (typeof date !== 'string' || !/^20\d{6}$/.test(date)) return false;
  const value = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
  const time = Date.parse(value + 'T00:00:00Z');
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

function timestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return NaN;
  if (!validDate(value.slice(0, 10).replace(/-/g, ''))) return NaN;
  return Date.parse(value);
}

// Projection is the only input to Python. Unknown/private fields are ignored,
// never stringified, logged, included in alt text, or embedded in PNG metadata.
function publicContent(row, { now = Date.now(), previousDay, indexUrl = INDEX_URL } = {}) {
  if (indexUrl !== INDEX_URL) throw Error('result_card_free_index_invalid');
  if (!row || typeof row !== 'object' || Array.isArray(row)) throw Error('result_card_row_invalid');
  if (row.version === 'published-main-race-result-v1') return publicRaceContent(row, { now, previousDay, indexUrl });
  const key = /^(20\d{6})-(0[1-9]|1\d|2[0-4])-([1-9]|1[0-2])$/.exec(row.raceKey || '');
  if (!key || !validDate(key[1])) throw Error('result_card_race_date_invalid');
  if (!Number.isFinite(now) || now < 0 || now > 4102444799999) throw Error('result_card_now_invalid');
  const [, date, venue, race] = key;
  const today = jstDate(now), yesterday = jstDate(now - 86400000);
  if (![today, yesterday].includes(date)) throw Error('result_card_race_date_outside_window');
  const isPreviousDay = date === yesterday;
  if (previousDay !== undefined && (typeof previousDay !== 'boolean' || previousDay !== isPreviousDay)) {
    throw Error('result_card_previous_day_mismatch');
  }
  if (!Object.hasOwn(LABELS, row.articleSeries) || row.publicationKey !== `${row.raceKey}:${row.articleSeries}` ||
      row.place !== VENUES[Number(venue) - 1] || row.raceNo !== Number(race)) throw Error('result_card_identity_invalid');
  if (!Number.isInteger(row.ticketCount) || row.ticketCount < 1 || row.ticketCount > 7) throw Error('result_card_ticket_count_invalid');
  if (typeof row.sourceSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(row.sourceSha256)) throw Error('result_card_source_hash_invalid');
  if (typeof row.url !== 'string' || !/^https:\/\/note\.com\/great_robin3243\/n\/n[a-f0-9]{1,64}$/.test(row.url)) throw Error('result_card_note_url_invalid');
  const deadline = timestamp(row.deadlineAt), published = timestamp(row.publishedAt);
  if (!Number.isFinite(deadline) || !Number.isFinite(published) || published >= deadline || deadline >= now ||
      jstDate(deadline) !== date || jstDate(published) !== date) throw Error('result_card_publication_time_invalid');
  const settlement = row.settlement;
  if (settlement?.status !== 'hit') throw Error('result_card_verified_hit_required');
  const combination = settlement.combination;
  if (typeof combination !== 'string' || !/^[1-6]-[1-6]-[1-6]$/.test(combination) ||
      new Set(combination.split('-')).size !== 3) throw Error('result_card_combination_invalid');
  const payout = settlement.payoutPer100Yen;
  if (!Number.isSafeInteger(payout) || payout <= 0 || payout > 99999999) throw Error('result_card_payout_invalid');
  const resultUrl = `https://www.boatrace.jp/owpc/pc/race/raceresult?hd=${date}&jcd=${venue}&rno=${Number(race)}`;
  if (settlement.resultUrl !== resultUrl || (row.resultUrl !== undefined && row.resultUrl !== resultUrl)) {
    throw Error('result_card_official_source_invalid');
  }
  const evidence = digest([row.publicationKey, row.sourceSha256, combination, payout].join('|'));
  if (settlement.evidenceId !== evidence) throw Error('result_card_evidence_mismatch');
  let resultSeenAt;
  if (row.resultObservation != null) {
    const observed = timestamp(row.resultObservation.firstResultSeenAt);
    if (row.resultObservation.evidenceId !== evidence || !Number.isFinite(observed) || observed < deadline || observed > now) {
      throw Error('result_card_observation_invalid');
    }
    resultSeenAt = new Date(observed).toISOString();
  }
  return Object.freeze({ version: VERSION, date, place: row.place, raceNo: row.raceNo,
    articleSeries: row.articleSeries, seriesLabel: LABELS[row.articleSeries], status: 'hit',
    ticketCount: row.ticketCount, combination, payoutPer100Yen: payout, indexUrl,
    previousDay: isPreviousDay, ...(resultSeenAt ? { resultSeenAt } : {}) });
}

// Aggregation, original publication checks, and the ticket union belong to the
// caller. This boundary rechecks the source-linked fact and public fields;
// it never reconstructs tickets or counts separate accounting references.
function publicRaceContent(report, { now, previousDay, indexUrl }) {
  const key = /^(20\d{6})-(0[1-9]|1\d|2[0-4])-([1-9]|1[0-2])$/.exec(report.raceKey || '');
  if (!key || !validDate(key[1])) throw Error('result_card_race_date_invalid');
  if (!Number.isFinite(now) || now < 0 || now > 4102444799999) throw Error('result_card_now_invalid');
  const [, date, venue, race] = key;
  const isPreviousDay = date === jstDate(now - 86400000);
  if (date !== jstDate(now) && !isPreviousDay) throw Error('result_card_race_date_outside_window');
  if (previousDay !== undefined && (typeof previousDay !== 'boolean' || previousDay !== isPreviousDay)) throw Error('result_card_previous_day_mismatch');
  if (report.publicationKey !== `${report.raceKey}:published-main` || report.place !== VENUES[Number(venue) - 1] ||
      report.raceNo !== Number(race)) throw Error('result_card_identity_invalid');
  const deadline = timestamp(report.deadlineAt), published = timestamp(report.publishedAt);
  if (!Number.isFinite(deadline) || !Number.isFinite(published) || published >= deadline || deadline >= now ||
      jstDate(deadline) !== date || jstDate(published) !== date) throw Error('result_card_publication_time_invalid');
  if (report.status !== 'hit') throw Error('result_card_verified_hit_required');
  const types = report.articleSeries;
  if (!Array.isArray(types) || !types.length || types.length > 3 || types.some(type => typeof type !== 'string' || !Object.hasOwn(LABELS, type)) ||
      new Set(types).size !== types.length) throw Error('result_card_series_invalid');
  if (!Number.isInteger(report.publishedTicketCount) || report.publishedTicketCount < 1 || report.publishedTicketCount > 120) throw Error('result_card_ticket_count_invalid');
  const matches = report.matchedSections;
  if (!Array.isArray(matches) || !matches.length || matches.length > 12 || matches.some(section => !section || typeof section !== 'object' ||
      Array.isArray(section) || Object.keys(section).some(key => !['articleSeries', 'label'].includes(key)) ||
      !types.includes(section.articleSeries) || !isPublishedSectionLabel(section.articleSeries,section.label)) ||
      new Set(matches.map(section => `${section.articleSeries}:${section.label}`)).size !== matches.length) throw Error('result_card_matched_sections_invalid');
  const combination = report.combination, payout = report.payoutPer100Yen;
  if (typeof combination !== 'string' || !/^[1-6]-[1-6]-[1-6]$/.test(combination) || new Set(combination.split('-')).size !== 3) throw Error('result_card_combination_invalid');
  if (!Number.isSafeInteger(payout) || payout <= 0 || payout > 99999999) throw Error('result_card_payout_invalid');
  if (report.resultUrl !== `https://www.boatrace.jp/owpc/pc/race/raceresult?hd=${date}&jcd=${venue}&rno=${Number(race)}`) throw Error('result_card_official_source_invalid');
  if (typeof report.sourceSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(report.sourceSha256)) throw Error('result_card_source_hash_invalid');
  const { raceEvidenceId } = require('./note-public-results');
  if (typeof report.evidenceId !== 'string' || !/^[a-f0-9]{64}$/.test(report.evidenceId) ||
      report.evidenceId !== raceEvidenceId(report)) throw Error('result_card_evidence_mismatch');
  let resultSeenAt;
  if (report.firstResultSeenAt != null) {
    const observed = timestamp(report.firstResultSeenAt);
    if (!Number.isFinite(observed) || observed < deadline || observed > now) throw Error('result_card_observation_invalid');
    resultSeenAt = new Date(observed).toISOString();
  }
  const origins=validatedReportOrigins(report);
  const winningCategories=origins.map(o=>Object.freeze({articleSeries:o.articleSeries,categoryId:o.categoryId,label:o.label}));
  return Object.freeze({ version: VERSION, scope: 'published-main', date, place: report.place, raceNo: report.raceNo,
    articleSeries: Object.freeze([...types]), seriesLabel: types.map(type => LABELS[type]).join(' / '), status: 'hit',
    publishedTicketCount: report.publishedTicketCount,
    matchedSections: Object.freeze(matches.map(section => Object.freeze({ articleSeries: section.articleSeries, label: section.label }))),
    ...(winningCategories.length?{winningCategories:Object.freeze(winningCategories)}:{}),
    combination, payoutPer100Yen: payout, indexUrl, previousDay: isPreviousDay, ...(resultSeenAt ? { resultSeenAt } : {}) });
}

function observationLabel(content) {
  if (!content.resultSeenAt) return '';
  const jst = new Date(Date.parse(content.resultSeenAt) + 9 * 3600000).toISOString();
  return `結果確認 ${Number(jst.slice(5, 7))}/${Number(jst.slice(8, 10))} ${jst.slice(11, 16)} JST`;
}

function altText(content) {
  const date = `${content.date.slice(0, 4)}年${Number(content.date.slice(4, 6))}月${Number(content.date.slice(6, 8))}日`;
  const tickets = content.scope === 'published-main'
    ? `事前公開した掲載全券${content.publishedTicketCount}点（重複なし）で的中。的中欄：` +
      content.matchedSections.map(section => `${RESULT_SERIES_LABELS[section.articleSeries]}・${section.label}`).join('／') + '。'
    : `事前公開した中心の買い目${content.ticketCount}点で的中。`;
  return `${date}${content.previousDay ? '（前日分）' : ''} ${content.place}${content.raceNo}R ${content.seriesLabel}。` +
    `公式結果照合済み。${tickets}` +
    (content.winningCategories?.length ? `元の予想区分：${content.winningCategories.map(o=>`${RESULT_SERIES_LABELS[o.articleSeries]}・${o.label}`).join('／')}。` : '') +
    `確定出目（3連単） ${content.combination}。` +
    `公式払戻（100円あたり）${content.payoutPer100Yen.toLocaleString('ja-JP')}円。` +
    (content.resultSeenAt ? `${observationLabel(content)}。` : '') +
    `全記事の結果（無料） ${content.indexUrl}。購入実績・利益を示すものではありません。`;
}

// Fixed, offline renderer. BASIC layout avoids optional RAQM differences.
// No generated timestamps, source hashes, private text, EXIF, or ancillary text
// chunks. An optional genuine result-observation time is drawn as public text.
const PYTHON_RENDERER = String.raw`
import io, json, sys
from datetime import datetime, timedelta
from PIL import Image, ImageDraw, ImageFont
c = json.load(sys.stdin)
font_path = sys.argv[1]
aggregate = c.get('scope') == 'published-main'
S = 2
image = Image.new('RGB', (1200*S, 675*S), '#0b1730')
draw = ImageDraw.Draw(image)
fonts = {}
def font(size):
    if size not in fonts:
        fonts[size] = ImageFont.truetype(font_path, size*S, index=0, layout_engine=ImageFont.Layout.BASIC)
    return fonts[size]
def box(coords, fill, radius=0, outline=None, width=1):
    coords = tuple(int(v*S) for v in coords)
    if radius:
        draw.rounded_rectangle(coords, radius=radius*S, fill=fill, outline=outline, width=width*S)
    else:
        draw.rectangle(coords, fill=fill, outline=outline, width=width*S)
def text(x, y, value, size, fill='#ffffff', max_width=None, anchor='lt'):
    while max_width and draw.textlength(value, font=font(size)) > max_width*S and size > 12:
        size -= 1
    if max_width and draw.textlength(value, font=font(size)) > max_width*S:
        raise ValueError('text_does_not_fit')
    draw.text((x*S, y*S), value, font=font(size), fill=fill, anchor=anchor)
# A result-first layout, visually distinct from the illustrated prediction
# covers. Draw the target locally: CJK fonts do not reliably include emoji.
accent = '#6be1cd'
gold = '#ffdb79'
box((0,0,1200,8), accent)
text(48,30,'チャッピーボートレースAI',25,'#d5e4f5',max_width=680)
text(1152,32,'公式結果レポート',24,accent,anchor='rt')
def target(x,y,r):
    for scale,color in [(1,'#ff646e'),(.76,'#ffffff'),(.52,'#ff646e'),(.28,'#ffffff'),(.12,'#ff646e')]:
        q=r*scale
        draw.ellipse(((x-q)*S,(y-q)*S,(x+q)*S,(y+q)*S),fill=color)
    draw.line(((x+4)*S,(y-4)*S,(x+44)*S,(y-44)*S),fill=gold,width=7*S)
    draw.polygon([((x+29)*S,(y-43)*S),((x+46)*S,(y-46)*S),((x+43)*S,(y-29)*S)],fill=gold)
target(94,141,37)
categories = list(dict.fromkeys(o['label'] for o in c.get('winningCategories',[])))
headline = ('・'.join(categories)+'で的中') if len(categories) <= 2 else '複数区分で的中'
text(153,92,headline if categories else '的中',83 if categories else 106,gold,max_width=565)
date = c['date'][:4] + '.' + c['date'][4:6] + '.' + c['date'][6:8]
text(1149,84,date+('  前日分' if c['previousDay'] else ''),26,'#c7d7eb',anchor='rt')
text(1152,124,c['place']+' '+str(c['raceNo'])+'R',60,anchor='rt',max_width=460)
# Promote the actual winning article and literal published section names.
# Never infer 本命/押さえ/流し from a merged published heading.
labels = {'normal':'AI展開予想','escape':'独立本命予想','manshu':'独立万舟予想'}
section_names = {'🎯 本命':'本命','🛡️ 押さえ':'押さえ','🌊 流し':'流し','💥 万舟狙い':'万舟狙い','🎯 独立本命':'独立本命','💥 独立万舟':'独立万舟'}
groups = []
if aggregate:
    for series in ['normal','escape','manshu']:
        matches = [section_names.get(section['label'],section['label']) for section in c['matchedSections'] if section['articleSeries'] == series]
        if matches: groups.append((labels[series],matches,[o['label'] for o in c.get('winningCategories',[]) if o['articleSeries']==series]))
else:
    groups = [(labels[c['articleSeries']],['中心の買い目'],[])]
box((48,207,1152,327),'#123348',radius=14)
if len(groups) == 1:
    family, matches, origins = groups[0]
    text(72,223,family+('｜'+'・'.join(origins) if origins else 'で的中'),30,accent,max_width=1060)
    text(72,269,'「'+'／'.join(matches)+'」',38,max_width=1060)
else:
    for line,(family,matches,origins) in enumerate(groups):
        text(72,224+line*33,family+('（'+'・'.join(origins)+'）' if origins else '')+'：'+'／'.join(matches),27,max_width=1060)
# Single high-contrast result block: combination and official per-100 payout.
box((48,346,1152,535),'#f4f8fc',radius=20)
text(74,362,'確定出目（3連単）',24,'#344863')
text(1124,362,'公式払戻（100円あたり）',25,'#344863',anchor='rt')
boat_colors = {'1':('#ffffff','#15243c'),'2':('#263044','#ffffff'),'3':('#d45252','#ffffff'),
               '4':('#3883be','#ffffff'),'5':('#e2b744','#12213b'),'6':('#319681','#ffffff')}
for index, boat in enumerate(c['combination'].split('-')):
    x = 74 + index*139
    bg, fg = boat_colors[boat]
    box((x,407,x+101,512),bg,radius=12,outline='#95a5b9',width=1)
    text(x+50,459,boat,76,fg,anchor='mm')
    if index < 2: text(x+119,459,'-',36,'#344863',anchor='mm')
text(1124,412,format(c['payoutPer100Yen'],',')+'円',79,'#163352',max_width=583,anchor='rt')
count_text = '掲載全券 '+str(c['publishedTicketCount'])+'点（重複なし）' if aggregate else '事前公開した中心の買い目 '+str(c['ticketCount'])+'点'
text(48,550,count_text,29,accent,max_width=1104)
text(48,608,'全結果は投稿内の無料一覧へ',23,accent,max_width=650)
if c.get('resultSeenAt'):
    seen = datetime.fromisoformat(c['resultSeenAt'].replace('Z','+00:00')) + timedelta(hours=9)
    label = '結果確認 '+str(seen.month)+'/'+str(seen.day)+' '+seen.strftime('%H:%M')+' JST'
    text(1152,609,label,20,'#bfcee0',max_width=440,anchor='rt')
text(48,650,'公式結果との照合記録 ｜ 別会計の参考は対象外。購入実績・利益を示すものではありません',17,'#a6b7ce',max_width=1104)
image = image.resize((1200,675), Image.Resampling.LANCZOS)
output = io.BytesIO()
image.save(output, format='PNG', compress_level=9, optimize=False)
sys.stdout.buffer.write(output.getvalue())
`;

function renderPng(content, fontPath) {
  return new Promise((resolve, reject) => {
    const child = spawn('python3', ['-c', PYTHON_RENDERER, fontPath], { stdio: ['pipe', 'pipe', 'pipe'] });
    const chunks = [];
    let size = 0, failed = false;
    const fail = code => { if (!failed) { failed = true; clearTimeout(timer); child.kill(); reject(Error(code)); } };
    const timer = setTimeout(() => fail('result_card_renderer_timeout'), 30000);
    child.once('error', () => fail('result_card_renderer_unavailable'));
    child.stdin.on('error', () => fail('result_card_renderer_failed'));
    child.stderr.resume(); // Never surface dependency errors containing filesystem/private context.
    child.stdout.on('data', chunk => {
      size += chunk.length;
      if (size > 5 * 1024 * 1024) return fail('result_card_image_too_large');
      chunks.push(chunk);
    });
    child.once('close', code => {
      clearTimeout(timer);
      if (failed) return;
      if (code !== 0) return fail('result_card_renderer_failed');
      resolve(Buffer.concat(chunks));
    });
    child.stdin.end(JSON.stringify(content));
  });
}

async function renderCard(row, options = {}) {
  const content = publicContent(row, options);
  // Caller-controlled local font override supports a preinstalled identical font
  // on another OS; row values can never choose a path or process argument.
  const fontPath = options.fontPath || FONT_PATH;
  if (typeof fontPath !== 'string' || !path.isAbsolute(fontPath) || !fs.existsSync(fontPath)) throw Error('result_card_font_missing');
  const png = await renderPng(content, fontPath);
  if (png.length < 1000 || !png.subarray(0, 8).equals(PNG_SIGNATURE) || png.toString('ascii', 12, 16) !== 'IHDR' ||
      png.readUInt32BE(16) !== WIDTH || png.readUInt32BE(20) !== HEIGHT) throw Error('result_card_image_invalid');
  const sha256 = digest(png);
  return { png, sha256, content, width: WIDTH, height: HEIGHT, mimeType: 'image/png',
    name: `result-${row.raceKey}-${content.scope || content.articleSeries}-${sha256}.png`, altText: altText(content) };
}

module.exports = { VERSION, INDEX_URL, FONT_PATH, WIDTH, HEIGHT, PUBLISHED_SECTION_LABELS, publicContent, renderCard, altText, observationLabel };
