"""Dated public reference snapshots; no prediction inputs or result joins."""
import concurrent.futures
import datetime as dt
import hashlib
from html.parser import HTMLParser
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import urllib.request

VERSION = 'official-reference-v1'
FLAGS = dict(productionChanged=False, automaticApplication=False, usableForPrediction=False)
JST = dt.timezone(dt.timedelta(hours=9))
DATE = r'(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日'


def date_value(groups):
    return dt.date(*map(int, groups)).isoformat()


def date_after(pattern, text):
    m = re.search(pattern, text)
    if not m:
        raise ValueError('missing_source_date')
    return date_value(m.groups())


class Page(HTMLParser):
    def __init__(self, html):
        super().__init__()
        self.rows, self.parts, self.row, self.cell = [], [], [], None
        self.feed(html)
        self.text = ' '.join(' '.join(self.parts).split())

    def handle_starttag(self, tag, attrs):
        if tag == 'tr':
            self.row = []
        if tag in ('td', 'th'):
            self.cell = []

    def handle_data(self, value):
        self.parts.append(value)
        if self.cell is not None:
            self.cell.append(value)

    def handle_endtag(self, tag):
        if tag in ('td', 'th') and self.cell is not None:
            self.row.append(''.join(''.join(self.cell).split()))
            self.cell = None
        if tag == 'tr' and self.row:
            self.rows.append(self.row)


def number(value, upper, integer=False):
    if not re.fullmatch(r'\d+(?:\.\d+)?', value):
        raise ValueError('invalid_numeric_value')
    n = float(value)
    if not 0 <= n <= upper or (integer and n != int(n)):
        raise ValueError('numeric_out_of_range')
    return int(n) if integer else n


def stadium(html):
    p = Page(html)
    if 'コース別入着率' not in p.text or '枠番別コース取得率' not in p.text:
        raise ValueError('stadium_schema_changed')
    m = re.search(r'集計期間[:：]\s*(\d{4}/\d{2}/\d{2})\s*[～〜]\s*(\d{4}/\d{2}/\d{2})', p.text)
    if not m:
        raise ValueError('missing_period')
    start, end = [dt.datetime.strptime(x, '%Y/%m/%d').date().isoformat() for x in m.groups()]
    if start > end:
        raise ValueError('reversed_period')
    rows = [r for r in p.rows if len(r) == 13 and re.fullmatch('[1-6]', r[0])]
    if len(rows) != 6 or sorted(r[0] for r in rows) != list('123456'):
        raise ValueError('incomplete_or_duplicate_courses')
    return dict(kind='stadium', periodStart=start, periodEnd=end, sampleSize=None, unit='percent',
                rows=[dict(course=int(r[0]), finishRates=[number(v, 100) for v in r[1:7]],
                           winningMethodRates=[number(v, 100) for v in r[7:]]) for r in rows],
                methodOrder=['escape', 'makuri', 'sashi', 'makuriSashi', 'nuki', 'megumare'])


def motors(html, venue):
    p = Page(html)
    start = date_after(r'現モーターの使用開始\s*[:：]\s*' + DATE, p.text)
    if venue == '05':
        asof = date_after(r'集計期間\s*[:：]\s*' + DATE, p.text)
        header = ['モーター番号', '2連対率', '勝率', '1着', '2着', '3着', '出走回数']
        if not any(r[:7] == header for r in p.rows):
            raise ValueError('motor_header_changed')
        candidates = [r for r in p.rows if len(r) == 17 and r[0].isdigit()]
        rows = [dict(motor=int(r[0]), top2Rate=number(r[1], 100), winScore=number(r[2], 10),
                     first=number(r[3], 10000, True), second=number(r[4], 10000, True),
                     third=number(r[5], 10000, True), starts=number(r[6], 10000, True)) for r in candidates]
        for r in rows:
            if r['first'] + r['second'] + r['third'] > r['starts']:
                raise ValueError('motor_count_mismatch')
    else:
        asof = date_after(DATE + r'\s*終了時点', p.text)
        if 'モーターランキング' not in p.text or '2連対率上位順' not in p.text:
            raise ValueError('motor_header_changed')
        candidates = [r for r in p.rows if len(r) == 7 and r[0].isdigit()]
        rows = [dict(motor=number(r[2], 999, True), top2Rate=number(r[3], 100),
                     winScore=number(r[4], 10), starts=None) for r in candidates]
    if not rows or len(rows) != len({r['motor'] for r in rows}):
        raise ValueError('missing_or_duplicate_motors')
    return dict(kind='motor', asOf=asof, useStartedAt=start, rows=sorted(rows, key=lambda r:r['motor']))


def maintenance(text):
    asof = date_after(DATE + '現在', text)
    rows, current = [], None
    for line in text.splitlines():
        m = re.match(r'\s*' + DATE + r'\s+(\d+)\s+' + DATE + r'\s+(.*)', line)
        if m:
            g = m.groups()
            current = dict(maintenanceDate=date_value(g[:3]), motor=int(g[3]),
                           useStartedAt=date_value(g[4:7]), parts=[])
            rows.append(current)
            line = g[7]
        elif not current or not line.strip() or '整備日' in line or '部品交換' in line:
            continue
        else:
            line = line.strip()
        parts = re.findall(r'([^\s\d]+)\s+(\d+)', line)
        if not parts or re.sub(r'[^\s\d]+\s+\d+', '', line).strip():
            raise ValueError('unrecognized_maintenance_row')
        current['parts'].extend(dict(name=n, count=int(c)) for n,c in parts)
    if not rows or any(not r['parts'] for r in rows):
        raise ValueError('empty_maintenance')
    if len(rows) != len({(r['motor'],r['maintenanceDate']) for r in rows}):
        raise ValueError('duplicate_maintenance')
    return dict(kind='maintenance', asOf=asof, rows=rows)


def sources():
    out = [dict(id='stadium-'+str(i).zfill(2), venue=str(i).zfill(2), kind='stadium',
                url='https://www.boatrace.jp/owpc/pc/data/stadium?jcd='+str(i).zfill(2)) for i in range(1,25)]
    out += [dict(id='motor-05',venue='05',kind='motor',url='https://www.boatrace-tamagawa.com/modules/datafile/'),
            dict(id='motor-06',venue='06',kind='motor',url='https://www.boatrace-hamanako.jp/sp/index.php?page=datafile-motorrank'),
            dict(id='maintenance-06',venue='06',kind='maintenance',url='https://www.boatrace-hamanako.jp/uploads/cdn/pdf/motorpdf/chukanseibi/chukanseibi.pdf')]
    return out


def fetch(source):
    req = urllib.request.Request(source['url'], headers={'User-Agent':'ChappyResearch/1.0 (public reference snapshots)'})
    with urllib.request.urlopen(req, timeout=25) as response:
        raw = response.read(3*1024*1024+1)
        if len(raw) > 3*1024*1024:
            raise ValueError('response_too_large')
    if source['kind'] == 'maintenance':
        if not raw.startswith(b'%PDF-'):
            raise ValueError('expected_pdf')
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp)/'source.pdf'
            path.write_bytes(raw)
            text = subprocess.run(['pdftotext','-layout',str(path),'-'], check=True,
                                  capture_output=True, timeout=20).stdout.decode('utf-8')
        data = maintenance(text)
    else:
        text = raw.decode('utf-8')
        data = stadium(text) if source['kind']=='stadium' else motors(text,source['venue'])
    return raw, data


def digest(value):
    return hashlib.sha256(value).hexdigest()


def encoded(value):
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2)+'\n').encode()


def atomic(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix('.tmp')
    temp.write_bytes(encoded(value))
    os.replace(temp, path)


def collect(root, now=None, fetcher=fetch, catalog=None):
    live_clock = now is None
    now = now or dt.datetime.now(dt.timezone.utc)
    stamp, day = now.isoformat(), now.astimezone(JST).date().isoformat()
    path = Path(root)/'data/stats/official-reference-v1.json'
    old = json.loads(path.read_text()) if path.exists() else dict(sources={})
    items = sources() if catalog is None else catalog
    states = dict(old.get('sources',{}))
    due = [s for s in items if states.get(s['id'],{}).get('lastAttemptDateJst') != day]
    if not due:
        return old
    def attempt(s):
        prior = states.get(s['id'],{})
        state = dict(prior, sourceUrl=s['url'], lastAttemptAt=stamp, lastAttemptDateJst=day)
        try:
            raw, data = fetcher(s)
            observed = dt.datetime.now(dt.timezone.utc).isoformat() if live_clock else stamp
            source_date = data.get('asOf',data.get('periodEnd'))
            if not source_date or source_date > day:
                raise ValueError('missing_or_future_source_date')
            record = dict(version=VERSION, sourceId=s['id'], venue=s['venue'], sourceUrl=s['url'],
                          data=data, **FLAGS)
            content_hash = digest(encoded(record))
            rel = 'data/official-reference/'+s['id']+'/'+content_hash+'.json'
            target = Path(root)/rel
            if not target.exists():
                atomic(target,dict(record, capturedAt=observed, sourceSha256=digest(raw), contentSha256=content_hash))
            state.update(status='ok', lastSuccessAt=observed, lastError=None, latestSnapshot=rel,
                         sourceDate=source_date, rowCount=len(data['rows']), contentSha256=content_hash,
                         sourceSha256=digest(raw), sourceAgeDays=(dt.date.fromisoformat(day)-dt.date.fromisoformat(source_date)).days)
        except Exception as exc:
            # Keep the last good snapshot and its timestamp; failure is never an empty success.
            state.update(status='error', lastError=type(exc).__name__+': '+str(exc)[:160])
        return s['id'],state
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        states.update(pool.map(attempt,due))
    warnings=[]
    a,b = states.get('motor-06',{}),states.get('maintenance-06',{})
    if a.get('latestSnapshot') and b.get('latestSnapshot'):
        motor=json.loads((Path(root)/a['latestSnapshot']).read_text())['data']
        maint=json.loads((Path(root)/b['latestSnapshot']).read_text())['data']
        dates=sorted({r['useStartedAt'] for r in maint['rows']})
        if dates != [motor['useStartedAt']]:
            warnings.append(dict(code='use_start_date_conflict',venue='06',motorDate=motor['useStartedAt'],maintenanceDates=dates))
    git_head = subprocess.run(['git','-C',str(root),'rev-parse','HEAD'], capture_output=True, text=True)
    source_commit = git_head.stdout.strip() if git_head.returncode == 0 else None
    report=dict(version=VERSION, generatedAt=dt.datetime.now(dt.timezone.utc).isoformat() if live_clock else stamp, sourceCommit=source_commit,
                runId=os.environ.get('GITHUB_RUN_ID'), expectedSources=len(items),
                failedSources=[s['id'] for s in items if states[s['id']]['status']=='error'],
                sources=states, warnings=warnings, **FLAGS)
    atomic(path,report)
    return report


if __name__=='__main__':
    import argparse
    parser=argparse.ArgumentParser()
    parser.add_argument('--root',default='.')
    args=parser.parse_args()
    report=collect(args.root)
    print(json.dumps({k:report[k] for k in ('expectedSources','failedSources','warnings')},ensure_ascii=False))
    # Nonzero after writing the failure report so Actions can persist it first.
    raise SystemExit(1 if report['failedSources'] else 0)
