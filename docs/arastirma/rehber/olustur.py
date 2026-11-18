"""Pedagoji sahibi ve danışman öğretmen için sistem rehberini (HTML) üretir.

Çalıştır (depo kökünden):
  python3 docs/arastirma/rehber/olustur.py            -> docs/arastirma/rehber/rehber.html
  node docs/arastirma/rehber/pdf.mjs                  -> docs/arastirma/kaynak-sistem-rehberi.pdf
Sayılar docs/arastirma/sim/sonuclar/ altındaki simülasyon çıktılarından alınmıştır.
"""
from pathlib import Path

OUT = Path(__file__).resolve().parent / "rehber.html"

TEAL = "#00676e"
TEAL_L = "#cfe7e8"
AMBER = "#b86e00"
AMBER_L = "#f6e3c4"
RED = "#b42318"
RED_L = "#f8d7d4"
GREEN = "#2e7d32"
GREEN_L = "#d6ecd7"
GREY = "#6b7280"
GREY_L = "#e5e7eb"
INK = "#1f2937"


def esc(s):
    return str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def text(x, y, s, size=11, anchor="start", weight=400, fill=INK, italic=False):
    st = ' font-style="italic"' if italic else ""
    return f'<text x="{x}" y="{y}" font-size="{size}" text-anchor="{anchor}" font-weight="{weight}" fill="{fill}"{st}>{esc(s)}</text>'


def box(x, y, w, h, label, fill=TEAL_L, stroke=TEAL, size=11, weight=600, sub=None, r=8):
    out = f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{fill}" stroke="{stroke}" stroke-width="1.2"/>'
    if sub:
        out += text(x + w / 2, y + h / 2 - 3, label, size, "middle", weight)
        out += text(x + w / 2, y + h / 2 + 12, sub, size - 2, "middle", 400, GREY)
    else:
        out += text(x + w / 2, y + h / 2 + 4, label, size, "middle", weight)
    return out


def arrow(x1, y1, x2, y2, color=GREY):
    return f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{color}" stroke-width="1.6" marker-end="url(#ah)"/>'


DEFS = f'<defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="{GREY}"/></marker></defs>'


def svg(w, h, body, label):
    return f'<svg viewBox="0 0 {w} {h}" width="100%" role="img" aria-label="{esc(label)}" xmlns="http://www.w3.org/2000/svg" font-family="Inter, sans-serif">{DEFS}{body}</svg>'


# ---------------------------------------------------------------- 1. yolculuk
def journey():
    steps = [
        ("Davet ve onam", "18+, KVKK"),
        ("Profil", "ilgi alanları, çalışma modu, hedef"),
        ("Yerleştirme", "uyarlamalı, ≈ 8–10 dk"),
        ("Seviye kararı", "A1 · A2 · A2 üstü"),
    ]
    body = ""
    x = 10
    for i, (a, b) in enumerate(steps):
        body += box(x, 20, 150, 56, a, sub=b)
        if i < len(steps) - 1:
            body += arrow(x + 150, 48, x + 168, 48)
        x += 170
    # branch
    body += arrow(625, 76, 625, 112)
    body += box(540, 114, 170, 50, "A2 üstü", fill=AMBER_L, stroke=AMBER, sub="kapı + bekleme listesi")
    body += arrow(560, 76, 300, 112)
    loop = [("Günlük oturum", "9 etkinlik, 15–20 dk"), ("Değerlendirme", "anında geri bildirim"), ("Öğrenme profili", "her cevapta güncellenir"), ("Teşhis ve plan", "konu mu, beceri mi?")]
    xs = [20, 190, 360, 360]
    ys = [114, 114, 114, 190]
    body += box(20, 114, 150, 50, loop[0][0], sub=loop[0][1])
    body += arrow(170, 139, 188, 139)
    body += box(190, 114, 150, 50, loop[1][0], sub=loop[1][1])
    body += arrow(340, 139, 358, 139)
    body += box(360, 114, 150, 50, loop[2][0], sub=loop[2][1])
    body += arrow(435, 164, 435, 188)
    body += box(360, 190, 150, 50, loop[3][0], sub=loop[3][1])
    body += f'<path d="M360,215 L95,215 L95,166" fill="none" stroke="{GREY}" stroke-width="1.6" marker-end="url(#ah)"/>'
    body += text(228, 209, "sonraki oturum hazırlanır", 10, "middle", 400, GREY, True)
    body += box(540, 190, 170, 50, "İlerleme ekranı", fill=GREEN_L, stroke=GREEN, sub="ızgara, teşhisler, hedefler")
    body += arrow(510, 215, 538, 215)
    del xs, ys
    return svg(720, 250, body, "Öğrencinin yolculuğu")


# ---------------------------------------------------------------- 2. yerleştirme karşılaştırma
def placement_compare():
    rows = [
        ("Bugünkü test (14 sabit soru)", 73.7, 14.0, None),
        ("Merdiven yöntemi", 70.9, 8.7, 16.0),
        ("Yeni test (ilk gün)", 88.3, 17.4, 0.8),
        ("Yeni test (kalibrasyondan sonra)", 91.1, 12.8, 2.1),
    ]
    colors = [GREY, AMBER, TEAL, GREEN]
    body = ""
    panels = [("Doğru sınıflama (%)", 1, 100, "{:.0f}"), ("Ortalama soru sayısı", 2, 20, "{:.1f}"), ("Yanlış dışlama (%)", 3, 20, "{:.1f}")]
    px = 210
    pw = 160
    for pi, (title, col, vmax, fmt) in enumerate(panels):
        x0 = px + pi * (pw + 20)
        body += text(x0, 14, title, 10.5, "start", 600)
        for ri, row in enumerate(rows):
            y = 26 + ri * 30
            v = row[col]
            if pi == 0:
                body += text(200, y + 15, row[0], 10.5, "end")
            body += f'<rect x="{x0}" y="{y}" width="{pw}" height="20" fill="{GREY_L}" rx="3"/>'
            if v is None:
                body += text(x0 + 6, y + 14, "ayıramıyor", 10, "start", 600, RED)
                continue
            w = max(2, pw * min(v, vmax) / vmax)
            body += f'<rect x="{x0}" y="{y}" width="{w:.1f}" height="20" fill="{colors[ri]}" rx="3"/>'
            label = fmt.format(v)
            inside = w > 40
            body += text(x0 + (w - 5 if inside else w + 5), y + 14, label, 10, "end" if inside else "start", 600, "#fff" if inside else INK)
    return svg(720, 150, body, "Yerleştirme yöntemlerinin karşılaştırması")


# ---------------------------------------------------------------- 3. örnek yerleştirme
A2_EX = [[0.43, 0.35, 0.22, 'A1', 1], [0.19, 0.47, 0.34, 'B1', 0], [0.25, 0.57, 0.18, 'A2', 1], [0.06, 0.57, 0.37, 'B1', 0], [0.08, 0.69, 0.23, 'A2', 0], [0.18, 0.78, 0.04, 'A1', 1], [0.13, 0.82, 0.05, 'A2', 1], [0.06, 0.86, 0.08, 'A2', 1], [0.03, 0.85, 0.12, 'B1', 0], [0.03, 0.88, 0.09, 'B1', 0], [0.04, 0.9, 0.06, 'A2', 1], [0.02, 0.9, 0.08, 'A2', 0], [0.03, 0.93, 0.04, 'A2', 0], [0.06, 0.93, 0.01, 'A1', 1], [0.04, 0.95, 0.02, 'A2', 1], [0.02, 0.95, 0.03]]
B2_EX = [[0.43, 0.35, 0.22, 'A1', 1], [0.19, 0.47, 0.34, 'B1', 0], [0.25, 0.57, 0.18, 'A2', 1], [0.06, 0.57, 0.37, 'B1', 1], [0.01, 0.34, 0.66, 'B1', 1], [0.0, 0.13, 0.87, 'B1', 1], [0.0, 0.07, 0.94, 'B1', 0], [0.0, 0.1, 0.91, 'B1', 1], [0.0, 0.05, 0.95]]


def trajectory(data, title, w=720):
    n = len(data)
    left, top, ph = 46, 28, 150
    bw = min(34, (w - left - 80) / n - 6)
    gap = 6
    body = text(left, 16, title, 11, "start", 600)
    for g in [0, 0.5, 0.95]:
        y = top + ph * (1 - g)
        dash = ' stroke-dasharray="4 3"' if g == 0.95 else ""
        body += f'<line x1="{left}" y1="{y}" x2="{left + n * (bw + gap)}" y2="{y}" stroke="{RED if g == 0.95 else GREY_L}" stroke-width="1"{dash}/>'
        body += text(left - 6, y + 4, f"%{int(g * 100)}", 9, "end", 400, GREY)
    body += text(left + n * (bw + gap) + 4, top + ph * 0.05 + 4, "karar eşiği", 9, "start", 600, RED)
    for i, row in enumerate(data):
        x = left + i * (bw + gap)
        y = top + ph
        for v, c in zip(row[:3], [GREY, TEAL, AMBER]):
            h = ph * v
            y -= h
            body += f'<rect x="{x}" y="{y:.1f}" width="{bw}" height="{h:.1f}" fill="{c}"/>'
        lab = "başta" if i == 0 else f"{i}."
        body += text(x + bw / 2, top + ph + 13, lab, 9, "middle", 400, GREY)
        if len(row) > 3:
            body += text(x + bw / 2 + (bw + gap) / 2, top + ph + 27, row[3], 8.5, "middle", 400, GREY)
            mark = "✓" if row[4] else "✗"
            body += text(x + bw / 2 + (bw + gap) / 2, top + ph + 41, mark, 11, "middle", 700, GREEN if row[4] else RED)
    body += text(left - 6, top + ph + 27, "soru", 8.5, "end", 400, GREY)
    body += text(left - 6, top + ph + 41, "cevap", 8.5, "end", 400, GREY)
    lx = left
    for lab, c in [("A1 olasılığı", GREY), ("A2 olasılığı", TEAL), ("A2 üstü olasılığı", AMBER)]:
        body += f'<rect x="{lx}" y="{top + ph + 52}" width="10" height="10" fill="{c}"/>' + text(lx + 14, top + ph + 61, lab, 9.5)
        lx += 120
    return svg(w, top + ph + 70, body, title)


# ---------------------------------------------------------------- 4. öğrenen modeli bileşenleri
def components():
    items = [
        ("Genel seviye", "yerleştirmeden başlar", TEAL_L, TEAL),
        ("Beceri", "ör. dinlemesi biraz zayıf", TEAL_L, TEAL),
        ("Konu", "bu konuyu ne kadar biliyor", GREEN_L, GREEN),
        ("Konu × beceri", "biliyor ama konuşmada kullanamıyor", AMBER_L, AMBER),
    ]
    body = ""
    x = 6
    for i, (a, b, f, s) in enumerate(items):
        body += box(x, 20, 150, 58, a, fill=f, stroke=s, sub=b)
        if i < 3:
            body += text(x + 160, 54, "+", 20, "middle", 700, GREY)
        x += 170
    body += arrow(345, 80, 345, 108)
    body += box(185, 110, 320, 46, "Doğru cevaplama olasılığı", sub="sorunun zorluğuyla karşılaştırılır")
    body += text(345, 178, "Her bileşenin bir tahmini ve bir belirsizliği vardır; az kanıt = geniş belirsizlik.", 10, "middle", 400, GREY, True)
    return svg(690, 186, body, "Öğrenme profilinin bileşenleri")


# ---------------------------------------------------------------- 5. öğrenen modeli sonuçları
def line_panel(x0, title, series, ymax=1.0):
    xs_lab = ["yerleşt.", "1", "5", "10", "40"]
    w, h = 300, 130
    body = text(x0, 14, title, 10.5, "start", 600)
    top = 24
    for g in [0, 0.5, 1.0]:
        y = top + h * (1 - g / ymax)
        body += f'<line x1="{x0 + 30}" y1="{y}" x2="{x0 + 30 + w - 40}" y2="{y}" stroke="{GREY_L}"/>' + text(x0 + 26, y + 4, f"%{int(g * 100)}", 9, "end", 400, GREY)
    step = (w - 60) / (len(xs_lab) - 1)
    for i, l in enumerate(xs_lab):
        body += text(x0 + 40 + i * step, top + h + 14, l, 9, "middle", 400, GREY)
    body += text(x0 + 40 + 2 * step, top + h + 27, "oturum", 9, "middle", 400, GREY)
    for name, vals, color in series:
        pts = " ".join(f"{x0 + 40 + i * step:.1f},{top + h * (1 - v / ymax):.1f}" for i, v in enumerate(vals))
        body += f'<polyline points="{pts}" fill="none" stroke="{color}" stroke-width="2.4"/>'
        for i, v in enumerate(vals):
            body += f'<circle cx="{x0 + 40 + i * step:.1f}" cy="{top + h * (1 - v / ymax):.1f}" r="3" fill="{color}"/>'
        last = vals[-1]
        body += text(x0 + 40 + 4 * step + 6, top + h * (1 - last / ymax) + 4, f"%{round(last * 100)}", 9.5, "start", 700, color)
    return body


def learner_results():
    body = line_panel(0, "Bildiği konuyu 'zayıf' gösterme (B1 öğrenci)", [("Bugün", [0.09, 0.12, 0.17, 0.20, 0.27], RED), ("Yeni", [0.0, 0.01, 0.0, 0.0, 0.0], TEAL)], 0.5)
    body += line_panel(370, "Bildiği konuyu 'sağlam' tanıma (B1 öğrenci)", [("Bugün", [0.0, 0.0, 0.01, 0.03, 0.14], RED), ("Yeni", [0.70, 0.73, 0.78, 0.83, 0.91], TEAL)])
    body += f'<rect x="200" y="182" width="12" height="4" fill="{RED}"/>' + text(216, 187, "bugünkü sistem", 10)
    body += f'<rect x="340" y="182" width="12" height="4" fill="{TEAL}"/>' + text(356, 187, "önerilen sistem", 10)
    return svg(720, 196, body, "Öğrenme profili simülasyon sonuçları")


# ---------------------------------------------------------------- 6. ızgara örneği
def grid_example():
    states = {
        "S": ("Sağlam", GREEN, "#fff"),
        "T": ("Tahmini sağlam", GREEN_L, GREEN),
        "G": ("Gelişiyor", AMBER_L, AMBER),
        "C": ("Çalışılacak", RED_L, RED),
        "H": ("Henüz ölçülmedi", GREY_L, GREY),
    }
    rows = [
        ("am / is / are", "STTT"),
        ("Geniş zaman", "SSGT"),
        ("Geçmiş zaman (düzensiz)", "SSSC"),
        ("Present perfect", "GHCH"),
        ("Karşılaştırma", "HHHH"),
    ]
    skills = ["Okuma", "Dinleme", "Yazma", "Konuşma"]
    body = ""
    cw, ch, x0, y0 = 96, 26, 190, 24
    for j, s in enumerate(skills):
        body += text(x0 + j * cw + cw / 2, 16, s, 10.5, "middle", 600)
    for i, (name, code) in enumerate(rows):
        y = y0 + i * (ch + 4)
        body += text(x0 - 10, y + 17, name, 10.5, "end")
        for j, c in enumerate(code):
            label, fill, ink = states[c]
            stroke = GREEN if c == "T" else fill
            dash = ' stroke-dasharray="3 2"' if c == "T" else ""
            body += f'<rect x="{x0 + j * cw + 2}" y="{y}" width="{cw - 4}" height="{ch}" rx="4" fill="{fill}" stroke="{stroke}"{dash}/>'
            body += text(x0 + j * cw + cw / 2, y + 17, label, 9, "middle", 600, ink)
    return svg(590, 182, body, "İlerleme ızgarası örneği")


# ---------------------------------------------------------------- 7. sıra karşılaştırması
def order_compare():
    cur = [("did ile soru", 19), ("Present perfect", 21), ("Geniş zaman", 27), ("Past simple (düzenli)", 38), ("was / were", 39), ("Düzensiz geçmiş", None), ("going to / will", None)]
    new = ["was / were", "Past simple (düzenli)", "Düzensiz geçmiş", "did ile soru", "going to → will", "Karşılaştırma", "should / must", "want to / like -ing", "Present perfect"]
    body = text(0, 14, "Bugün: A2 öğrencide konuların ilk ele alındığı oturum", 10.5, "start", 600)
    x0, w = 150, 220
    for k in [0, 10, 20, 30, 40]:
        x = x0 + w * k / 40
        body += f'<line x1="{x}" y1="24" x2="{x}" y2="{26 + len(cur) * 20}" stroke="{GREY_L}"/>' + text(x, 40 + len(cur) * 20, str(k), 9, "middle", 400, GREY)
    body += text(x0 + w / 2, 54 + len(cur) * 20, "oturum", 9, "middle", 400, GREY)
    for i, (name, s) in enumerate(cur):
        y = 36 + i * 20
        body += text(x0 - 8, y + 4, name, 10, "end")
        if s is None:
            body += text(x0 + w + 4, y + 4, "40 oturumda hiç", 9.5, "end", 600, RED)
        else:
            body += f'<circle cx="{x0 + w * s / 40:.1f}" cy="{y}" r="5" fill="{RED}"/>'
    body += text(410, 14, "Önerilen varsayılan yol (A2)", 10.5, "start", 600)
    for i, name in enumerate(new):
        y = 26 + i * 19
        body += f'<rect x="410" y="{y}" width="200" height="16" rx="4" fill="{TEAL_L}" stroke="{TEAL}"/>' + text(418, y + 12, f"{i + 1}. {name}", 9.5)
    body += text(410, 26 + len(new) * 19 + 14, "Ön koşul her zaman önce gelir.", 9.5, "start", 400, GREY, True)
    return svg(720, 230, body, "Konu sırası karşılaştırması")


# ---------------------------------------------------------------- 8. ön koşul grafiği
def prereq_graph():
    nodes = {
        "be": (20, 20, "am / is / are"),
        "ps": (20, 90, "Geniş zaman"),
        "hh": (420, 20, "have / has"),
        "pb": (220, 20, "was / were"),
        "psr": (220, 90, "Past simple (düzenli)"),
        "dd": (220, 160, "do / does"),
        "psi": (420, 90, "Düzensiz geçmiş"),
        "did": (420, 160, "did ile soru"),
        "pp": (610, 125, "Present perfect"),
    }
    edges = [("be", "pb"), ("ps", "psr"), ("psr", "psi"), ("psr", "did"), ("dd", "did"), ("psi", "pp"), ("hh", "pp"), ("ps", "dd")]
    W, H = 160, 40
    body = ""
    for a, b in edges:
        xa, ya, _ = nodes[a]
        xb, yb, _ = nodes[b]
        body += arrow(xa + W, ya + H / 2, xb - 2, yb + H / 2)
    for k, (x, y, lab) in nodes.items():
        f, s = (AMBER_L, AMBER) if k == "pp" else (TEAL_L, TEAL)
        body += box(x, y, W, H, lab, fill=f, stroke=s, size=10.5)
    return svg(780, 210, body, "Ön koşul grafiği örneği")


# ---------------------------------------------------------------- 9. oturum bileşimi
def session_bar():
    slots = [
        ("Odak", 3, TEAL, "yeni ya da devam eden konu"),
        ("Tekrar", 2, GREEN, "vadesi gelen konular, karışık"),
        ("Sonda", 1, AMBER, "şüpheli boşluğu başka beceride sınar"),
        ("Okuma / dinleme", 1, "#4f6db8", "anlamak için; bilinen kelimelerle"),
        ("Konuşma / yazma", 1, "#8a4fb8", "bir 'yapabilir' görevi"),
        ("Akıcılık", 1, GREY, "bildiği yapılar, hızlı tur"),
    ]
    body = ""
    x, unit, y = 6, 78, 8
    for name, n, c, desc in slots:
        w = unit * n
        body += f'<rect x="{x}" y="{y}" width="{w - 3}" height="34" rx="6" fill="{c}"/>'
        body += text(x + (w - 3) / 2, y + 21, f"{n}", 12, "middle", 700, "#fff")
        x += w
    for i, (name, n, c, desc) in enumerate(slots):
        yy = 62 + i * 19
        body += f'<rect x="6" y="{yy - 10}" width="12" height="12" rx="2" fill="{c}"/>'
        body += text(26, yy, name, 10.5, "start", 600) + text(150, yy, f"{n} etkinlik · {desc}", 10.5, "start", 400, INK)
    return svg(720, 62 + len(slots) * 19, body, "Bir oturumun bileşimi")


# ---------------------------------------------------------------- 10. okul konusu köprüsü
def school_flow():
    body = box(10, 60, 160, 50, "Okulun bu haftaki konusu", sub="programdan gelir, öğrenci onaylar")
    cases = [
        ("Öğrenmeye hazır", "o hafta ana konu olur", TEAL_L, TEAL),
        ("Ön koşulu eksik", "önce köprü: eksik konu, sonra okul konusu", AMBER_L, AMBER),
        ("Zaten sağlam", "kısa kontrol + tekrar; zaman boşa gitmez", GREEN_L, GREEN),
    ]
    for i, (a, b, f, s) in enumerate(cases):
        y = 6 + i * 58
        body += arrow(170, 85, 228, y + 25)
        body += box(230, y, 330, 48, a, fill=f, stroke=s, sub=b)
    return svg(580, 180, body, "Okul konusunun ele alınışı")


# ---------------------------------------------------------------- 11. değerlendirme hattı
def grading_flow():
    body = box(6, 30, 120, 50, "Öğrencinin cevabı")
    body += arrow(126, 55, 150, 55)
    body += box(152, 6, 170, 44, "Seçmeli / boşluk / dikte", sub="yerel ve anında", fill=GREY_L, stroke=GREY)
    body += box(152, 60, 170, 44, "Serbest cevap", sub="dil modeli 3 kez bakar")
    body += arrow(322, 82, 350, 82)
    body += box(352, 60, 160, 44, "Çoğunluk oyu", sub="en az 2/3'te bulunan hata")
    body += arrow(512, 82, 540, 70)
    body += arrow(322, 28, 540, 50)
    body += box(542, 34, 168, 56, "Öğrenme profili", sub="kanıt güveniyle ağırlıklı", fill=GREEN_L, stroke=GREEN)
    body += text(360, 130, "Kural: cevap varsayılan olarak doğrudur; üslup tercihi hata sayılmaz.", 10, "middle", 400, GREY, True)
    return svg(720, 140, body, "Değerlendirme hattı")


CSS = f"""
@page {{ size: A4; margin: 16mm 15mm 16mm 15mm; }}
* {{ box-sizing: border-box; }}
body {{ font-family: Inter, sans-serif; color: {INK}; font-size: 10.5pt; line-height: 1.5; margin: 0; }}
h1 {{ font-size: 26pt; line-height: 1.15; margin: 0 0 8px; color: {TEAL}; }}
h2 {{ font-size: 16pt; color: {TEAL}; margin: 0 0 8px; padding-bottom: 4px; border-bottom: 2px solid {TEAL_L}; }}
h3 {{ font-size: 12pt; margin: 14px 0 6px; }}
p {{ margin: 0 0 8px; }}
ul, ol {{ margin: 0 0 8px; padding-left: 18px; }}
li {{ margin-bottom: 3px; }}
.page {{ page-break-before: always; }}
.cover {{ height: 255mm; display: flex; flex-direction: column; justify-content: space-between; }}
.lead {{ font-size: 12.5pt; color: #374151; }}
.muted {{ color: {GREY}; }}
.small {{ font-size: 9pt; }}
.note {{ background: #f3f4f6; border-left: 4px solid {GREY}; padding: 8px 12px; border-radius: 4px; margin: 10px 0; }}
.key {{ background: {TEAL_L}; border-left: 4px solid {TEAL}; padding: 8px 12px; border-radius: 4px; margin: 10px 0; }}
.warn {{ background: {AMBER_L}; border-left: 4px solid {AMBER}; padding: 8px 12px; border-radius: 4px; margin: 10px 0; }}
.fig {{ margin: 10px 0 4px; break-inside: avoid; }}
.cap {{ font-size: 8.8pt; color: {GREY}; margin: 2px 0 10px; }}
table {{ border-collapse: collapse; width: 100%; margin: 6px 0 10px; font-size: 9.6pt; break-inside: avoid; }}
th, td {{ border: 1px solid {GREY_L}; padding: 5px 7px; text-align: left; vertical-align: top; }}
th {{ background: #f3f4f6; font-weight: 600; }}
.two {{ display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }}
.toc {{ padding-left: 26px; }}
.toc li {{ margin-bottom: 5px; }}
.pill {{ display: inline-block; padding: 1px 8px; border-radius: 999px; font-size: 8.5pt; font-weight: 600; }}
"""


def html():
    p = []
    p.append(f"""
<section class="cover">
  <div>
    <p class="muted small">Kaynak · Pedagoji sahibi ve danışman öğretmen için · 18 Kasım 2026</p>
    <h1>Kaynak nasıl çalışır?</h1>
    <p class="lead">Öğrenciyi tanımaktan konu seçmeye, hatayı bulmaktan ilerlemeyi ölçmeye kadar sistemin baştan sona sade anlatımı.</p>
    <div class="key"><b>Bu belge, onaylanan tasarımı anlatır.</b> Tasarım ekip tarafından 18.11.2026'da onaylandı; uygulama bu tasarıma göre yapılacak. Ayrıntılı gerekçeler ve kaynaklar: <i>docs/arastirma/olcme-ve-ogrenen-modeli.md</i> ve <i>docs/arastirma/mufredat-onerisi.md</i>.</div>
  </div>
  <div>
    <h3>İçindekiler</h3>
    <ol class="toc">
      <li>Kaynak ne yapar? Öğrencinin yolculuğu</li>
      <li>Seviye tespiti: az soruyla net sonuç</li>
      <li>Seviye üstü öğrenciler: kapsam kapısı</li>
      <li>Öğrenme profili: öğrenciyi tanımak</li>
      <li>Hatanın kaynağı: konu mu, beceri mi?</li>
      <li>Müfredat: ne, hangi sırayla, kime?</li>
      <li>Bir oturumun içi</li>
      <li>Okula giden ve gitmeyen öğrenci</li>
      <li>Cevaplar nasıl değerlendirilir?</li>
      <li>Sizden beklenenler</li>
      <li>Nasıl ölçeceğiz?</li>
      <li>Sözlük ve kaynaklar</li>
    </ol>
  </div>
  <p class="small muted">Grafiklerdeki sayılar sanal öğrencilerle yapılan simülasyonlardan gelir; yöntemleri karşılaştırmak içindir. Kesin değerler pilotta ölçülecektir.</p>
</section>
""")

    p.append(f"""
<section class="page">
<h2>1. Kaynak ne yapar?</h2>
<p>Kaynak, Türkçe konuşan A1–A2 düzeyindeki hazırlık öğrencileri için bir yapay zekâ İngilizce öğretmenidir. Asıl sorusu şudur: <b>Öğrenci bir hatayı neden yapıyor?</b> Konuyu mu bilmiyor, yoksa konuyu biliyor ama belli bir beceride (ör. konuşurken) kullanamıyor mu? Cevaba göre öğretim değişir.</p>
<p>Bunun için her cevap konu, beceri ve etkinlik türüyle etiketlenir. Aynı konu farklı becerilerde yeniden sorulur. Türkçeden kaynaklanan tipik hatalar (ör. "She happy", "I have car") baştan tanımlıdır.</p>
<h3>Öğrencinin yolculuğu</h3>
<div class="fig">{journey()}</div>
<p class="cap">Şekil 1. Öğrenci davetle girer, profilini doldurur, kısa bir seviye testi çözer. A2'nin üstündeyse kibarca bekleme listesine alınır; değilse her gün 15–20 dakikalık oturumlarla çalışır. Her cevap öğrenme profilini günceller; profil bir sonraki oturumu belirler.</p>
<h3>Beş temel ilke</h3>
<ol>
  <li><b>Tek ölçek.</b> Öğrencinin seviyesi, soruların ve konuların zorluğu aynı ölçekte ifade edilir. A1, A2, B1 bu ölçeğin üzerindeki işaretlerdir.</li>
  <li><b>Her tahminin bir belirsizliği vardır.</b> "Bilmiyoruz" ile "zayıf" farklı şeylerdir.</li>
  <li><b>Kanıt yoksa hüküm yok.</b> Bir konuya "zayıf" demek için o konuda öğrencinin gerçek cevapları gerekir.</li>
  <li><b>Tüm cevaplar birlikte tartılır.</b> Tek bir dikkatsizlik hatası karar değiştirmez.</li>
  <li><b>Sistem sınırlarını bilir.</b> Seviye üstü öğrenciye hizmet vermez; anadil konuşurunun doğru cümlesinde hata aramaz.</li>
</ol>
</section>
""")

    p.append(f"""
<section class="page">
<h2>2. Seviye tespiti: az soruyla net sonuç</h2>
<p>Eski test 14 sabit sorudan oluşuyordu ve 12'si A1 düzeyindeydi. Bu yüzden A2'nin üstündeki bir öğrenciyi ayıramıyordu: B2 düzeyindeki biri de anadil konuşuru da "A2" çıkıyordu.</p>
<h3>Yeni test nasıl çalışır?</h3>
<ol>
  <li><b>Kolay başlar.</b> İlk 1–2 soru güven vermek için kolaydır.</li>
  <li><b>Her cevaptan sonra olasılıkları günceller.</b> Sistem "bu öğrenci A1 mi, A2 mi, A2 üstü mü?" sorusu için üç olasılık tutar. Doğru cevap olasılıkları yukarı, yanlış cevap aşağı kaydırır; ama tek bir yanlış her şeyi silmez.</li>
  <li><b>Soruyu sınırda seçer.</b> Bir sonraki soru, kararı en çok netleştirecek sorudur; genellikle iki seviyenin sınırındaki bir sorudur.</li>
  <li><b>Karar netleşince durur.</b> Seviyelerden birinin olasılığı %95'i geçince test biter. Ortalama 14–19 soru, yaklaşık 8–10 dakika (en çok 25 soru).</li>
</ol>
<div class="fig">{trajectory(A2_EX, "Örnek 1 · A2 düzeyindeki bir öğrenci (15 soru, aradaki yanlışlara rağmen karar: A2)")}</div>
<p class="cap">Şekil 2. Her çubuk bir sorudan önceki durumu gösterir: gri A1, camgöbeği A2, turuncu A2 üstü olasılığı. Öğrenci B1 sorularında yanılır, A2 sorularının çoğunu bilir; olasılık yavaşça A2'de toplanır ve %95'i geçince test biter.</p>
<div class="fig">{trajectory(B2_EX, "Örnek 2 · Seviye üstü bir öğrenci (8 soru, karar: A2 üstü)", 520)}</div>
<p class="cap">Şekil 3. İkinci soruda yanılmasına rağmen sonraki B1 sorularını doğru cevaplayan öğrenci 8 soruda "A2 üstü" olarak belirlenir.</p>
</section>
""")

    p.append(f"""
<section class="page">
<h3>Eski test, "merdiven" yöntemi ve yeni test</h3>
<p>Merdiven yöntemi (doğru bildikçe bir üst seviyeye çıkmak, hata olunca o seviyede birkaç soru daha sormak) sezgisel olarak doğrudur ve 1970'lerden beri bilinir. Ancak yalnızca son birkaç cevaba baktığı için yanılabilir. Yeni test aynı sezgiyi istatistikle uygular ve bütün cevapları birlikte tartar.</p>
<div class="fig">{placement_compare()}</div>
<p class="cap">Şekil 4. 3000 sanal öğrenciyle simülasyon. "İlk gün": soruların zorluğu henüz uzman tahminiyle biliniyor. "Kalibrasyondan sonra": pilot verisiyle zorluklar düzeltildiğinde. Yanlış dışlama, aslında A2 olan bir öğrencinin "seviye üstü" sayılmasıdır; en pahalı hatadır.</p>
<h3>Soru bankası</h3>
<ul>
  <li>Bankada en az 150 soru olacak: pre-A1'den B2'ye kadar. <b>B1 ve B2 soruları yalnızca ölçmek içindir, öğretilmez.</b> Seviye üstü öğrenciyi ancak bu sorular ayırabilir.</li>
  <li>Soru türleri: boşluk doldurma, 4 şıklı seçme, dikte, dinle-seç ve <b>dinle-tekrar et</b> (cümleyi dinleyip sesli tekrar etmek). Tahmin şansı düşük ve kısmi puan verebilen türler daha çok bilgi taşır.</li>
  <li>Soruların taslağını dil modeli hazırlar; <b>pedagoji sahibi onaylar ve aynı seviyedeki soruları zorluğa göre sıralar.</b> Pilot cevapları geldikçe zorluklar veriyle düzeltilir.</li>
</ul>
<h3>Test bitince öğrenci ne görür?</h3>
<ul>
  <li>"Başlangıç seviyen: A2" ve ne kadar emin olduğumuz (ör. "%93 eminiz").</li>
  <li><b>Güçlü yanların</b> ve <b>netleştireceğimiz konular</b>.</li>
  <li>"Zayıf nokta" yalnızca öğrencinin o konuda gerçekten yanlış cevabı varsa gösterilir. Eski sistem her durumda, 14/14 yapan öğrenciye bile, 3 zayıf nokta gösteriyordu.</li>
</ul>
</section>
""")

    p.append(f"""
<section class="page">
<h2>3. Seviye üstü öğrenciler: kapsam kapısı</h2>
<p>Kaynak şu anda yalnızca A1–A2 için tasarlandı. A2'nin üstündeki birine zaten bildiği konuları çalıştırmak hem onun zamanını boşa harcar hem de sistemin güvenilirliğini zedeler.</p>
<table>
  <tr><th>Durum</th><th>Ne olur?</th></tr>
  <tr><td>Testte "A2 üstü" olasılığı ≥ %90</td><td>Öğrenci şu ekranı görür: <i>"İngilizcen şu an bizim seviyelerimizin üstünde görünüyor. Kaynak şimdilik A1–A2 öğrencileri için çalışıyor; sana zaten bildiğin konuları çalıştırmak istemiyoruz. B1 ve üstü için hazırlanıyoruz."</i> İki seçenek: <b>Hazır olunca bana haber ver</b> · <b>Sonucun yanlış olduğunu düşünüyorum</b></td></tr>
  <tr><td>Olasılık %60–90 arasında</td><td>Karar için 4–5 soruluk kısa bir uzatma yapılır, sonra karar verilir.</td></tr>
  <tr><td>Oturumlar ilerledikçe öğrenci A2'yi aşarsa</td><td>Genel seviye %95 olasılıkla B1'i geçer ve A2 konularının en az %90'ı sağlam olursa "A2'yi tamamladın" ekranı ve aynı bekleme listesi.</td></tr>
  <tr><td>Öğrenci itiraz ederse</td><td>7 gün sonra tek seferlik yeniden test hakkı ya da yönetim panelinden öğretmen kararı.</td></tr>
</table>
<div class="note"><b>Neden eşik bu kadar yüksek?</b> Gerçekte A2 olan bir öğrenciyi dışarıda bırakmak, sınırdaki bir B1 öğrenciye birkaç hafta A2 içeriği vermekten çok daha zararlıdır. Sınırdaki öğrenci hizmet almaya devam eder; oturumlar boyunca izlenir. Hedef: yanlış dışlama %2'nin altında.</div>
<p class="small muted">Konuşma sorusundaki performans kapı kararında yalnızca destekleyici kanıttır; tek başına karar vermez. Bekleme listesi için yeni kişisel veri toplanmaz; KVKK aydınlatma metnine bir cümle eklenir.</p>

<h2 style="margin-top:22px">4. Öğrenme profili: öğrenciyi tanımak</h2>
<p>Eski sistem her konu ve beceri için ayrı bir puan tutuyordu (yaklaşık 120 ayrı kutu). Kutular birbirinden habersizdi; güçlü bir öğrenciyi tanımak için yüzlerce doğru cevap gerekiyordu. Başlangıç puanı da "zayıf" bandındaydı: doğru cevap verilen konu bile kırmızı görünüyordu.</p>
<p>Yeni profil, satrançtaki Elo puanının gelişmiş bir hâline benzer. Her cevabın başarısını dört bileşenin toplamı açıklar:</p>
<div class="fig">{components()}</div>
<p class="cap">Şekil 5. Genel seviye yerleştirmeden gelir. Bu sayede B2 düzeyindeki bir öğrencinin hiç sorulmamış A1 konuları ilk günden "tahmini sağlam" görünür. Son bileşen ürünün ana sorusunu yanıtlar: "konuyu biliyor ama konuşurken kullanamıyor."</p>
</section>
""")

    p.append(f"""
<section class="page">
<h3>Izgarada ne görülür?</h3>
<div class="fig">{grid_example()}</div>
<p class="cap">Şekil 6. Kesikli çerçeveli hücreler "tahmini"dir: o hücrede doğrudan kanıt yoktur, genel seviyeden çıkarılmıştır. "Çalışılacak" demek için o konuda en az iki gerçek cevap gerekir.</p>
<table>
  <tr><th>Etiket</th><th>Anlamı</th></tr>
  <tr><td><span class="pill" style="background:{GREEN};color:#fff">Sağlam</span></td><td>Öğrenci bu konuyu bu beceride büyük olasılıkla (≥ %80) biliyor.</td></tr>
  <tr><td><span class="pill" style="background:{GREEN_L};color:{GREEN};border:1px dashed {GREEN}">Tahmini sağlam</span></td><td>Doğrudan sorulmadı ama genel seviyesi bunu gösteriyor. İlk fırsatta kısa bir kontrolle doğrulanır.</td></tr>
  <tr><td><span class="pill" style="background:{AMBER_L};color:{AMBER}">Gelişiyor</span></td><td>Kanıt yeterli, sonuç ikisinin arasında; öğrenci öğreniyor.</td></tr>
  <tr><td><span class="pill" style="background:{RED_L};color:{RED}">Çalışılacak</span></td><td>Gerçek cevaplar, konunun henüz oturmadığını güçlü biçimde (≥ %80) gösteriyor.</td></tr>
  <tr><td><span class="pill" style="background:{GREY_L};color:{GREY}">Henüz ölçülmedi</span></td><td>Bir şey söylemek için yeterli bilgi yok.</td></tr>
</table>
<h3>Simülasyonda fark</h3>
<div class="fig">{learner_results()}</div>
<p class="cap">Şekil 7. B1 düzeyindeki sanal öğrenciler (60 kişi). Eski sistem, öğrencinin bildiği konuların %27'sine kadarını "zayıf" gösteriyor ve 40 oturumda (pilotun tamamı) bildiklerinin ancak %14'ünü tanıyor. Yeni profil hiçbirini "zayıf" göstermiyor, bildiklerinin %70'ini ilk günden tanıyor.</p>
<p>Gerçek boşlukları olan A2 öğrencisinde de "çalışılacak" etiketlerinin isabeti %40–65'ten %95–98'e çıkıyor. Bunun bedeli: yeni profil "çalışılacak" demek için en az iki cevap beklediğinden, ilk 1–2 oturumda boşlukları biraz daha geç işaretliyor. Bunu bilerek seçtik; yanlış alarm öğrencinin güvenini sarsar.</p>
</section>
""")

    p.append(f"""
<section class="page">
<h2>5. Hatanın kaynağı: konu mu, beceri mi?</h2>
<p>Profilin iki bileşeni bu soruyu doğrudan yanıtlar:</p>
<table>
  <tr><th>Teşhis</th><th>Ne zaman?</th><th>Öğrenciye mesaj (örnek)</th></tr>
  <tr><td><b>Konu eksiği</b></td><td>Konu bileşeni, öğrencinin genel seviyesine göre belirgin biçimde düşük (≥ %90 olasılıkla) ve konuda en az 4 cevap var.</td><td>"Geçmiş zaman henüz oturmamış: tüm becerilerde toplam 3/9. Konuyu kısa adımlarla ele alacağız."</td></tr>
  <tr><td><b>Beceri eksiği</b></td><td>Konu × beceri bileşeni belirgin biçimde düşük, başka bir beceride aynı konu sağlam.</td><td>"Geçmiş zamanı biliyorsun: yazma etkinliklerinde 5/6 doğru. Zorlandığın yer konuşma: 1/4. Önümüzdeki oturumlarda geçmiş zamanı konuşarak çalışacağız."</td></tr>
</table>
<p>Gösterilen güven yüzdesi gerçek bir olasılıktır: "%90 eminiz" denen teşhislerin 10'da 9'unun doğru çıkması gerekir. Bunu pilotta öğretmen incelemeleriyle denetleyeceğiz.</p>
<div class="key"><b>Şüpheyi doğrulama:</b> Öğrenci bir konuda örneğin yazarken hata yaparsa, sistem sonraki oturumda aynı konuyu <b>başka bir beceride</b> sorar. Kaynağı en hızlı ayırmanın yolu budur. Eski sistemde, cevaplarının %90'ını doğru veren öğrencilerin hepsi pilot boyunca en az bir yanlış teşhis alıyordu; yeni yaklaşım tesadüfi hataları teşhise çevirmemek için tasarlandı.</div>

<h2 style="margin-top:20px">6. Müfredat: ne, hangi sırayla, kime?</h2>
<p>Eski planlayıcı konuları fiilen "Türkçeden kaynaklı hata riski"ne göre sıralıyordu. Bu yüzden bir A2 öğrencisine present perfect, past simple'dan 17 oturum önce geliyordu; geniş zaman bir A1 öğrencisine 40 oturumda hiç ana konu olmuyordu.</p>
<div class="fig">{order_compare()}</div>
<p class="cap">Şekil 8. Solda bugünkü planlayıcının gerçek davranışı (A2 öğrenci, 40 oturum). Sağda önerilen sıra.</p>
</section>
""")

    p.append(f"""
<section class="page">
<h3>Müfredatın üç katmanı</h3>
<table>
  <tr><th style="width:20%">Katman</th><th>Ne yapar?</th><th style="width:30%">Dayanak</th></tr>
  <tr><td><b>Kapsam</b><br><span class="muted small">ne öğretilir?</span></td><td>Dilbilgisi konuları, "yapabilir" hedefleri (ör. "Geçmişteki bir olayı anlatabilir"), kelime düzeyleri ve sesletim öncelikleri. Konu listesi uluslararası kaynaklarla karşılaştırılarak doğrulanır.</td><td>CEFR Tamamlayıcı Cilt; British Council–EAQUALS Core Inventory; English Grammar Profile</td></tr>
  <tr><td><b>Sıra</b><br><span class="muted small">hangi sırayla?</span></td><td>Ön koşul grafiği: bir konu, ön koşulları öğrenilmeden açılmaz. Konular "yapabilir" hedefleri etrafında 11 üniteye gruplanır (varsayılan yol).</td><td>Bilgi uzayı kuramı; edinim sıraları araştırmaları</td></tr>
  <tr><td><b>Seçim</b><br><span class="muted small">bu öğrenciye bugün ne?</span></td><td>Öğrenmeye hazır konular (ön koşulları tamam, kendisi henüz öğrenilmemiş) arasından; iletişimsel değer, yoldaki sıra, okul ve hedef dikkate alınarak. Öğrenciye 2–3 seçenek sunulur.</td><td>Ustalık öğrenmesi; seçim hakkının motivasyona etkisi</td></tr>
</table>
<div class="fig">{prereq_graph()}</div>
<p class="cap">Şekil 9. Ön koşul grafiğinden bir kesit. Present perfect, düzensiz geçmiş zaman ve have/has öğrenilmeden açılmaz. Okul bu konuyu erken işlerse sistem önce eksik ön koşulu tamamlar ("köprü").</p>
<div class="warn"><b>Türkçe kaynaklı hata riskinin yeni rolü:</b> Risk artık bir konunun <i>ne zaman</i> açılacağını belirlemez; <i>ne kadar tekrar</i> alacağını belirler. Örneğin üçüncü tekil -s ve a/an/the, araştırmalara göre ne zaman öğretilirse öğretilsin geç oturur. Bu konular erken açılır, uzun süre aralıklı tekrarla taşınır ve öğrencinin ilerlemesini kilitlemez.</div>
<div style="break-inside: avoid"><h3>Varsayılan yol (taslak, sizin onayınıza)</h3>
<table class="small">
  <tr><th>Ünite</th><th>"Yapabilir"</th><th>Konular</th></tr>
  <tr><td>A1-1 Kendini tanıt</td><td>Kendini ve başkalarını basitçe tanıtabilir</td><td>am/is/are · özne zamirleri · cümle sırası · a/an</td></tr>
  <tr><td>A1-2 Etrafındaki dünya</td><td>Çevresindeki nesneleri ve yerleri söyleyebilir</td><td>çoğul · there is/are · in/on/at (yer) · iyelik sıfatları · have/has</td></tr>
  <tr><td>A1-3 Günlük hayat</td><td>Günlük rutinini anlatabilir, basit sorular sorabilir</td><td>geniş zaman · 3. tekil -s · sıklık zarfları · in/on/at (zaman) · do/does · wh- soruları</td></tr>
  <tr><td>A1-4 Yapabildiklerin</td><td>Yeteneklerini söyleyebilir, basit alışveriş yapabilir</td><td>can · nesne zamirleri · some/any, much/many · the</td></tr>
  <tr><td>A1-5 Şu an</td><td>Şu anda olanları anlatabilir</td><td>present continuous (geniş zamanla karışık)</td></tr>
  <tr><td>A2-1 Geçmiş</td><td>Geçmişteki olayları anlatabilir</td><td>was/were · past simple (düzenli, düzensiz) · did ile soru</td></tr>
  <tr><td>A2-2 Planlar</td><td>Planlarını ve tahminlerini söyleyebilir</td><td>going to · will</td></tr>
  <tr><td>A2-3 … A2-6</td><td>Karşılaştırma · tavsiye · istekler · deneyimler</td><td>karşılaştırma · should/must/have to · want to / like -ing · present perfect (past simple ile karışık)</td></tr>
</table></div>
</section>
""")

    p.append(f"""
<section style="margin-top:18px">
<h2>7. Bir oturumun içi</h2>
<p>Bir oturum 9 etkinlik ve 15–20 dakikadır. Bileşimi araştırmalara dayanır: yeni konu önce tek başına, sonra karışabileceği konuyla karışık çalışılır; tekrarın zamanını unutma tahmini belirler; dört çalışma türü dengelenir.</p>
<div class="fig">{session_bar()}</div>
<p class="cap">Şekil 10. Kendi programını izleyen öğrencide okuma/dinleme, konuşma/yazma ve akıcılık her oturumda bulunur. Okul modunda bunlar daha seyrek olabilir, çünkü okul bu ihtiyacı kısmen karşılar.</p>
<table>
  <tr><th>Kural</th><th>Neden?</th></tr>
  <tr><td>Oturumda en çok 1 yeni konu açılır; aynı anda en çok 3 konu "çalışılıyor" durumunda olur.</td><td>Yığılmayı ve dağınıklığı önlemek için.</td></tr>
  <tr><td>Karışabilir çiftler (geniş zaman / şimdiki zaman, past simple / present perfect, a/an / the, he/she / his/her …) bir süre sonra karışık sorulur.</td><td>Karışık çalışma, alıştırma sırasında daha zor gelse de bir hafta sonraki testte bloklu çalışmadan daha iyi sonuç veriyor.</td></tr>
  <tr><td>Alıştırmalarda hedef başarı %70–85'tir.</td><td>Çok kolay soru öğretmez, çok zor soru yıldırır.</td></tr>
  <tr><td>Okuma ve dinleme metinlerinde öğrencinin bildiği kelime oranı A2'de en az %95, A1'de en az %98 olmalı; bu kodla denetlenir.</td><td>Metni anlamak için kelimelerin büyük çoğunluğunu bilmek gerekir.</td></tr>
  <tr><td>Kesin "sağlam" konulara tekrar vakti gelmeden soru sorulmaz.</td><td>Güçlü öğrencinin zamanı boşa gitmesin.</td></tr>
</table>
<h3>Sesletim önceliği</h3>
<p>Araştırmalar, anlaşılırlığı en çok etkileyen ses ayrımlarına öncelik verilmesini öneriyor. <b>th sesi anlaşılırlığı az etkiliyor</b>; bu yüzden düşük önceliğe alınıyor. w/v korunuyor. Türk öğrenciler için <i>ship–sheep</i>, <i>bad–bed</i> gibi ünlü ayrımları aday olarak eklenecek; kesin listeyi pedagoji sahibi belirler ve pilot verisiyle güncellenir.</p>

<h2 style="margin-top:18px">8. Okula giden ve gitmeyen öğrenci</h2>
<p>Başlangıçta öğrenciye "Hazırlık programında mısın?" diye sorulur.</p>
<div class="two">
<div><h3>Okul modu</h3>
<ul>
  <li>Pedagoji sahibi okulun haftalık programını bir kez sistemdeki konulara eşler.</li>
  <li>Haftanın okul konusu kendiliğinden gelir; öğrenci tek dokunuşla onaylar.</li>
  <li>Program eşlenmemişse haftalık soru sorulur; en olası 3 konu önerilir.</li>
</ul></div>
<div><h3>Kendi programım</h3>
<ul>
  <li>Öğrenci bir hedef seçer: günlük iletişim, okul/sınav ya da iş/seyahat.</li>
  <li>Yerleştirme sonucundan başlayıp varsayılan yolu kendisine göre izler.</li>
  <li>Haftalık hedef "yapabilir" diliyle verilir: "Bu hafta: hafta sonunu anlatabilmek."</li>
</ul></div>
</div>
<div class="fig">{school_flow()}</div>
<p class="cap">Şekil 11. Okul konusu üç duruma göre ele alınır. O hafta konu en az iki oturumda yer alır.</p>
</section>
""")

    p.append(f"""
<section class="page">
<h2>9. Cevaplar nasıl değerlendirilir?</h2>
<div class="fig">{grading_flow()}</div>
<p class="cap">Şekil 12. Seçmeli, boşluk doldurma ve dikte gibi etkinlikler anında ve yerel olarak puanlanır. Serbest yazma ve konuşmada dil modeli cevaba üç kez bakar; yalnızca en az ikisinin bulduğu hata sayılır.</p>
<ul>
  <li><b>Varsayılan: cevap doğrudur.</b> Hata, dikkatli bir İngilizce öğretmeninin standart İngilizcede yanlış sayacağı şeydir. "Daha doğal bir söyleyiş" hata değildir; istenirse öneri olarak gösterilir ama profile işlenmez.</li>
  <li>Dil modelleri hatası az olan metinde gereksiz düzeltme yapmaya eğilimlidir. Üç bakış ve çoğunluk oyu bunu bastırır.</li>
  <li><b>Kontrol seti:</b> Anadil konuşurlarının ve ileri düzey kişilerin cevaplarından oluşan yaklaşık 200 cevaplık bir setle sistemin "hatasız cevapta hata bulma" oranı ölçülür. Hedef: %2'nin altı.</li>
  <li>Öğrencinin doğru kullandığı A2 üstü yapılar ayrıca kaydedilir; kapsam kapısına destekleyici kanıt olur.</li>
  <li>Öğretmen inceleme kuyruğundaki kararlarınız, değerlendirmenin doğruluğunu ölçen altın veridir.</li>
</ul>

<h2 style="margin-top:20px">10. Sizden beklenenler</h2>
<table>
  <tr><th>İş</th><th>Kim</th><th>Tahmini emek</th></tr>
  <tr><td>Konu listesini Core Inventory ve English Grammar Profile ile karşılaştırmak; önerilen düzeltmeler (ör. wh- sorularının "be ile" ve "do ile" diye ikiye bölünmesi) ve eksik aday konular (emir kipi, this/that, iyelik 's, there was/were …) hakkında karar</td><td>Pedagoji sahibi + danışman öğretmen</td><td>1–2 gün</td></tr>
  <tr><td>Her konuya iletişimsel değer puanı (1–3) ve ünite; varsayılan yolun onayı</td><td>Pedagoji sahibi</td><td>yarım gün</td></tr>
  <tr><td>Yerleştirme bankası: dil modelinin hazırladığı yaklaşık 150 sorunun onayı ve aynı seviyedeki soruların zorluğa göre sıralanması (B1/B2 dahil)</td><td>Pedagoji sahibi</td><td>2–3 gün</td></tr>
  <tr><td>Pilot okulun haftalık programının (kur planı, ders kitabı) konulara eşlenmesi</td><td>Pedagoji sahibi</td><td>yarım gün</td></tr>
  <tr><td>Sesletim listesi: ünlü ayrımları adaylarının onayı</td><td>Pedagoji sahibi</td><td>1 saat</td></tr>
  <tr><td>Kontrol seti: anadil ve ileri düzey örnek cevapların yazılması ya da onayı</td><td>Danışman öğretmen</td><td>yarım gün</td></tr>
  <tr><td>Kapı ve yeni ekran metinlerinin dil ve üslup kontrolü</td><td>Pedagoji sahibi</td><td>1 saat</td></tr>
  <tr><td>Pilot boyunca öğretmen inceleme kuyruğu; kapıdan geçemeyenlerden bir örneklemle kısa görüşme</td><td>Danışman öğretmen</td><td>haftada 1–2 saat</td></tr>
</table>
</section>
""")

    p.append(f"""
<section class="page">
<h2>11. Nasıl ölçeceğiz?</h2>
<table>
  <tr><th>Bileşen</th><th>Pilot öncesi</th><th>Pilot boyunca</th></tr>
  <tr><td>Seviye testi</td><td>Seviyesi bilinen 12–15 kişi (en az 3 B1/B2 ve 2 anadil konuşuru): hepsi doğru sınıflanmalı; hiçbir A2 dışarıda kalmamalı.</td><td>Pedagoji sahibinin değerlendirmesiyle uyum; 10 kişide test–tekrar test tutarlılığı.</td></tr>
  <tr><td>Öğrenme profili</td><td>Simülasyon: güçlü öğrencide yanlış "zayıf" = 0; A2 öğrencide gerçek boşlukların en az %60'ı 20 oturumda bulunmalı, isabet ≥ %90.</td><td>Sonraki cevabı tahmin etme başarısı (haftalık); teşhislerin öğretmen kararıyla uyumu ≥ %80; "Bence değil" oranı.</td></tr>
  <tr><td>Müfredat</td><td>Simülasyon: ön koşul ihlali 0; açık konuların hepsi 40 oturumda en az bir kez ele alınmalı; köprü çalışmalı.</td><td>Konu başına öğrenme eğrileri; 48 saat sonraki tekrar başarısı; haftada sağlamlaşan konu sayısı.</td></tr>
  <tr><td>Değerlendirme</td><td>Kontrol setinde "hatasız cevapta hata bulma" ≤ %2.</td><td>Öğretmen kuyruğunda yanlış hata oranı.</td></tr>
</table>
<div class="note"><b>Öğrenme eğrisi nedir?</b> Bir konuda öğrencilerin hata oranı, o konuyu çalıştıkça düzgünce azalmalıdır. Eğri düz ya da dalgalıysa konu muhtemelen iki ayrı şeyi karıştırıyordur (bölünmeli) ya da gereksiz ayrıntıdır (birleştirilmeli). Bu, konu listesini veriyle iyileştirmenin bilimsel yoludur.</div>

<h2 style="margin-top:20px">12. Sözlük</h2>
<table class="small">
  <tr><td style="width:28%"><b>Uyarlamalı test</b></td><td>Her soruyu önceki cevaplara göre seçen test. Herkese aynı soruları sormaz.</td></tr>
  <tr><td><b>Kalibrasyon</b></td><td>Soruların ve konuların zorluğunu gerçek öğrenci cevaplarıyla düzeltme.</td></tr>
  <tr><td><b>Belirsizlik</b></td><td>Bir tahminin ne kadar güvenilir olduğu. Az kanıt = geniş belirsizlik.</td></tr>
  <tr><td><b>Ön koşul</b></td><td>Bir konuyu öğrenmeden önce bilinmesi gereken konu.</td></tr>
  <tr><td><b>Öğrenmeye hazır konu</b></td><td>Ön koşulları tamam, kendisi henüz öğrenilmemiş konu.</td></tr>
  <tr><td><b>Karışık çalışma</b></td><td>Birbirine karışan konuları aynı alıştırmada birlikte çalışmak (interleaving).</td></tr>
  <tr><td><b>Aralıklı tekrar</b></td><td>Bir konuyu, unutulmaya başlayacağı zamana yakın yeniden sormak.</td></tr>
  <tr><td><b>"Yapabilir" ifadesi</b></td><td>CEFR'in seviye tanımı: öğrencinin dille yapabildiği iş (ör. "Günlük rutinini anlatabilir").</td></tr>
  <tr><td><b>L1 riski</b></td><td>Bir konunun Türkçeden kaynaklı hataya ne kadar açık olduğu (0–2).</td></tr>
</table>
<h3>Başlıca kaynaklar</h3>
<p class="small">Council of Europe (2020), CEFR Companion Volume · North, Ortega &amp; Sheehan (2010), Core Inventory for General English · O'Keeffe &amp; Mark (2017), English Grammar Profile · Eggen &amp; Straetmans (2000), üç kategorili uyarlamalı sınıflama · Weiss (1973), stradaptive test · Settles vd. (2020), Duolingo English Test · Pelánek (2016), eğitimde Elo · Glickman (1999), Glicko · Herbrich vd. (2006), TrueSkill · Pardos &amp; Heffernan (2010) · Wilson vd. (2016) · Goldschneider &amp; DeKeyser (2001), edinim sırası · Nakata &amp; Suzuki (2019), karışık çalışma · Kim &amp; Webb (2022), aralıklı tekrar · Nation (2007), dört çalışma türü · Laufer &amp; Ravenhorst-Kalovski (2010), kelime kapsamı · Munro &amp; Derwing (2006), işlevsel yük · Jenkins (2000) · Kulik vd. (1990), ustalık öğrenmesi · Patall vd. (2008), seçim hakkı · Goto vd. (2026), dil modellerinde aşırı düzeltme · Koedinger vd. (2012), öğrenme eğrileri. Tam künyeler araştırma belgelerindedir.</p>
</section>
""")
    return f'<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Kaynak nasıl çalışır?</title><style>{CSS}</style></head><body>{"".join(p)}</body></html>'


if __name__ == "__main__":
    OUT.write_text(html(), encoding="utf-8")
    print(f"yazıldı: {OUT}")
