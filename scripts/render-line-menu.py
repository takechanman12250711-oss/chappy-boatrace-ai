"""Render the two URI navigation buttons; no message delivery is involved."""
from PIL import Image, ImageDraw, ImageFont
import sys
font_path = sys.argv[1]
output = sys.argv[2]
im = Image.new('RGB', (2500, 843), '#edf7fc')
d = ImageDraw.Draw(im)
def text(x, y, value, size, color):
    font = ImageFont.truetype(font_path, size)
    d.text((x, y), value, font=font, fill=color, anchor='mm')
for x, label, sub, color in [(0, '今日の予想', 'レース別の予想一覧へ', '#0673b6'), (1250, '結果を見る', '的中・不的中を確認', '#138781')]:
    d.rounded_rectangle((x+35, 35, x+1215, 808), radius=44, fill='white')
    d.rounded_rectangle((x+105, 110, x+310, 192), radius=24, fill=color)
    text(x+207, 149, 'note', 48, 'white')
    text(x+625, 385, label, 136, '#17364b')
    text(x+625, 540, sub, 54, '#526c7e')
    d.ellipse((x+559, 635, x+691, 767), fill=color)
    d.line([(x+610, 673), (x+640, 701), (x+610, 729)], fill='white', width=12)
im.save(output, optimize=True)
