import base64, sys, pathlib
from playwright.sync_api import sync_playwright
import os
# 社員の顔イラスト原画（組織図ページの400x400画像と同一。assets/staff のプロフィール表とは別物）
S = pathlib.Path(os.environ.get("STAFF_DIR", pathlib.Path(__file__).resolve().parents[2] / "assets" / "note" / "cover-faces"))
img = lambda n: "data:image/jpeg;base64," + base64.b64encode((S / n).read_bytes()).decode()
P = {n: f"{n}.jpg" for n in ["sora", "shizuku", "hinata", "tsumugi", "kai", "minato", "homura", "ruri", "kohaku", "wakaba"]}

COVERS = {
  "normal":  dict(color="#22d3ee", badge="AI展開予想", h=["展開を読んで、", "勝負レースを絞る。"], sub="AI社員チームがデータで展開を読み解く", chips=["展開を読む", "データで絞る", "結果も公開"], faces=["kai", "ruri"]),
  "escape":  dict(color="#34d399", badge="本命予想", h=["1号艇の逃げを、", "データで見極める。"], sub="スタート・展示・モーターから逃げ切りを判定", chips=["ST・展示", "モーター", "結果も公開"], faces=["minato"]),
  "manshu":  dict(color="#fbbf24", badge="万舟", h=["波乱の一撃を、", "AIが狙う。"], sub="高配当になる展開をデータで探す", chips=["攻めを読む", "穴を拾う", "結果も公開"], faces=["homura"]),
  "index":   dict(color="#60a5fa", badge="予想・結果一覧", h=["今日の予想と", "結果をまとめて。"], sub="締切順に並べて、終わったら公式結果を確認", chips=["締切順", "的中・不的中", "毎日更新"], faces=["kai", "minato", "homura", "ruri"]),
  "hit":     dict(color="#f43f5e", badge="的中速報", h=["的中！", "AIの読みが決まった。"], sub="当たったレースを、配当と一緒にお知らせ", chips=["的中報告", "配当公開", "通算も公開"], faces=["kohaku", "hinata"]),
  "cover":   dict(color="#22d3ee", badge="チャッピーボートレースAI", h=["AI社員チームが", "毎日レースを分析。"], sub="展開・データ・オッズから、その日の勝負レースを届ける", chips=["AI展開予想", "本命予想", "万舟"], faces=["kai","minato","homura","ruri","kohaku","wakaba"]),
}

CSS = """
*{box-sizing:border-box;margin:0}html,body{width:1734px;height:907px;overflow:hidden;background:#06122a;font-family:'Noto Sans CJK JP',sans-serif}
.bg{position:absolute;inset:0;background:
 radial-gradient(900px 600px at 78% 40%, color-mix(in srgb,var(--c) 28%,transparent), transparent 70%),
 linear-gradient(180deg,#081a3a 0%,#06122a 60%,#040b1c 100%)}
.grid{position:absolute;inset:0;background-image:linear-gradient(rgba(120,170,255,.08) 1px,transparent 1px),linear-gradient(90deg,rgba(120,170,255,.08) 1px,transparent 1px);background-size:56px 56px}
svg.chart{position:absolute;inset:0}
.brand{position:absolute;left:64px;top:52px;color:#cfe3ff;font-weight:700;font-size:34px;letter-spacing:.06em;display:flex;align-items:center;gap:14px}
.brand i{width:16px;height:16px;border-radius:50%;background:var(--c);box-shadow:0 0 18px var(--c)}
.badge{position:absolute;left:64px;top:126px;padding:10px 30px;border-radius:999px;background:var(--c);color:#04121f;font-weight:900;font-size:46px;box-shadow:0 0 34px color-mix(in srgb,var(--c) 70%,transparent)}
.h{position:absolute;left:60px;top:228px;color:#fff;font-weight:900;font-size:90px;line-height:1.16;letter-spacing:-.01em;text-shadow:0 6px 0 rgba(0,0,0,.35),0 0 40px color-mix(in srgb,var(--c) 45%,transparent)}
.h b{color:var(--c)}
.sub{position:absolute;left:66px;top:490px;width:960px;color:#d6e6ff;font-weight:700;font-size:34px}
.chips{position:absolute;left:64px;top:600px;display:flex;gap:18px}
.chip{border:3px solid var(--c);color:#eaf6ff;background:rgba(6,18,42,.75);border-radius:16px;padding:12px 26px;font-weight:900;font-size:36px}
.faces{position:absolute;right:60px;top:70px;bottom:70px;max-width:660px;display:flex;gap:26px;align-items:center}
.face{border-radius:28px;overflow:hidden;border:5px solid var(--c);box-shadow:0 0 0 8px rgba(6,18,42,.9),0 0 60px color-mix(in srgb,var(--c) 65%,transparent);background:#0b1f44}
.face img{display:block;width:100%;height:100%;object-fit:cover}
.tag{position:absolute;right:70px;bottom:44px;color:rgba(214,230,255,.75);font-weight:700;font-size:26px}
"""

def chart(c):
    pts = [(760,820),(860,760),(960,790),(1060,700),(1160,730),(1260,640),(1360,670),(1460,560),(1560,590),(1680,470)]
    poly = " ".join(f"{x},{y}" for x,y in pts)
    dots = "".join(f'<circle cx="{x}" cy="{y}" r="7" fill="{c}"/>' for x,y in pts[1::2])
    bars = "".join(f'<rect x="{760+i*92}" y="{860-h}" width="46" height="{h}" fill="{c}" opacity=".18"/>' for i,h in enumerate([60,110,80,150,120,190,160,230,200,270]))
    return f'<svg class="chart" viewBox="0 0 1734 907">{bars}<polyline points="{poly}" fill="none" stroke="{c}" stroke-width="6" opacity=".9"/>{dots}</svg>'

def faces_html(fs):
    size = {1: 540, 2: 316, 4: 300, 6: 204}[len(fs)]
    if len(fs) in (4, 6):
        rows = "".join(f'<div class="face" style="width:{size}px;height:{size}px"><img src="{img(P[f])}"></div>' for f in fs)
        return f'<div class="faces" style="display:grid;grid-template-columns:repeat({2 if len(fs)==4 else 3},{size}px);gap:22px;top:{110 if len(fs)==4 else 200}px;bottom:auto">{rows}</div>'
    return '<div class="faces">' + "".join(f'<div class="face" style="width:{size}px;height:{int(size*1.25)}px"><img src="{img(P[f])}" style="object-position:50% 25%"></div>' for f in fs) + '</div>'

def html(key, d):
    h1, h2 = d["h"]
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>{CSS}</style></head>
<body style="--c:{d['color']}"><div class="bg"></div><div class="grid"></div>{chart(d['color'])}{faces_html(d['faces'])}
<div class="brand"><i></i>チャッピーボートレースAI</div><div class="badge">{d['badge']}</div>
<div class="h">{h1}<br><b>{h2}</b></div><div class="sub">{d['sub']}</div>
<div class="chips">{''.join(f'<span class="chip">{c}</span>' for c in d['chips'])}</div>
<div class="tag">予想は参考情報です</div></body></html>"""

out = pathlib.Path(__file__).resolve().parents[2] / "assets" / "note"
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get("CHROMIUM_PATH") or None); pg = b.new_page(viewport={"width": 1734, "height": 907})
    for k, d in COVERS.items():
        pg.set_content(html(k, d)); pg.wait_for_timeout(300)
        name = "chappy-cover.jpg" if k == "cover" else f"chappy-{k}-cover.jpg"
        pg.screenshot(path=str(out / name), type="jpeg", quality=90)
    b.close()
print("ok")
