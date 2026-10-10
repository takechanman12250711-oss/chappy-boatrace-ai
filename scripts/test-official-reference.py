import datetime as dt
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec=importlib.util.spec_from_file_location('collector',Path(__file__).with_name('collect-official-reference.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
NOW=dt.datetime(2026,10,10,21,tzinfo=dt.timezone.utc)
SOURCE=dict(id='stadium-06',venue='06',kind='stadium',url='https://www.boatrace.jp/owpc/pc/data/stadium?jcd=06')
def html():
 return 'コース別入着率 枠番別コース取得率 集計期間：2026/07/01～2026/09/30 <table>'+''.join('<tr>'+''.join('<td>'+str(v)+'</td>' for v in [i]+[10]*12)+'</tr>' for i in range(1,7))+'</table>'

class Tests(unittest.TestCase):
 def test_courses_dates_and_null_denominator(self):
  d=m.stadium(html());self.assertEqual(d['periodEnd'],'2026-09-30');self.assertIsNone(d['sampleSize']);self.assertEqual(len(d['rows']),6)
 def test_broken_source_is_not_zero(self):
  for h in [html().replace('<td>6</td>','<td>5</td>'),html().replace('10</td>','101</td>'),html().replace('2026/09/30','unknown')]:
   with self.assertRaises(ValueError):m.stadium(h)
 def test_multiline_parts_and_conflicting_date_preserved(self):
  text='2026年10月10日現在\n2026年9月17日 27 2026年4月8日 電気一式 1 ピストン 2\n ピストンリング 4\n'
  d=m.maintenance(text);self.assertEqual(d['rows'][0]['useStartedAt'],'2026-04-08');self.assertEqual(len(d['rows'][0]['parts']),3)
  with self.assertRaises(ValueError):m.maintenance(text+' 解釈不能\n')
 def test_daily_dedupe_failure_and_recovery(self):
  with tempfile.TemporaryDirectory() as tmp:
   calls=[]
   def good(s):calls.append(s);return b'source',m.stadium(html())
   r=m.collect(tmp,NOW,good,[SOURCE]);p=Path(tmp)/r['sources']['stadium-06']['latestSnapshot'];before=p.read_bytes()
   self.assertEqual(r['failedSources'],[])
   m.collect(tmp,NOW+dt.timedelta(hours=1),good,[SOURCE]);self.assertEqual(len(calls),1)
   r=m.collect(tmp,NOW+dt.timedelta(days=1),good,[SOURCE]);self.assertEqual(len(calls),2);self.assertEqual(p.read_bytes(),before)
   self.assertEqual(len(list((Path(tmp)/'data/official-reference').rglob('*.json'))),1)
   def bad(s):raise ValueError('network_failed')
   failed=m.collect(tmp,NOW+dt.timedelta(days=2),bad,[SOURCE]);state=failed['sources']['stadium-06']
   self.assertEqual(state['status'],'error');self.assertEqual(state['lastSuccessAt'],r['sources']['stadium-06']['lastSuccessAt']);self.assertEqual(p.read_bytes(),before)
   recovered=m.collect(tmp,NOW+dt.timedelta(days=3),good,[SOURCE]);self.assertEqual(recovered['failedSources'],[])
   changed=lambda s:(b'changed',m.stadium(html().replace('<td>10</td>','<td>11</td>')))
   m.collect(tmp,NOW+dt.timedelta(days=4),changed,[SOURCE]);self.assertEqual(len(list((Path(tmp)/'data/official-reference').rglob('*.json'))),2);self.assertEqual(p.read_bytes(),before)
 def test_future_date_rejected(self):
  with tempfile.TemporaryDirectory() as tmp:
   r=m.collect(tmp,NOW,lambda s:(b'x',dict(kind='stadium',periodEnd='2027-01-01',rows=[])),[SOURCE]);self.assertEqual(r['failedSources'],['stadium-06'])
 def test_catalog_and_safe_flags(self):
  self.assertEqual(len(m.sources()),27);self.assertEqual(len({s['id'] for s in m.sources()}),27)
  self.assertTrue(all(v is False for v in m.FLAGS.values()))

if __name__=='__main__':unittest.main()
