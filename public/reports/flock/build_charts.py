"""Build theme-aware inline-SVG figures for the Flock report from
analysis_results.json. Emits charts_fragment.html plus a small JSON of
supplementary numbers (Austin clean off-window, disclosed as post-hoc).
"""
import json
from pathlib import Path

import pandas as pd

HERE = Path(__file__).parent
R = json.load(open(HERE / "analysis_results.json"))
MONTHS = R["series"]["sf"]["months"]
NAMES = {"sf": "San Francisco", "oakland": "Oakland", "austin": "Austin",
         "denver": "Denver", "chicago": "Chicago", "nyc": "New York City",
         "seattle": "Seattle"}


def x_of(i, n, w, pad_l, pad_r):
    return pad_l + i * (w - pad_l - pad_r) / max(n - 1, 1)


def y_of(v, vmax, h, pad_t, pad_b):
    return pad_t + (1 - v / vmax) * (h - pad_t - pad_b)


def nice_max(v):
    for step in [5, 10, 20, 25, 50, 100, 150, 200, 250, 300, 400, 500]:
        if v <= step * 4:
            return step * 4
    return ((int(v) // 500) + 1) * 500


def month_index(m):
    return MONTHS.index(m)


def year_ticks(w, h, pad_l, pad_r, pad_t, pad_b, n):
    out = []
    for i, m in enumerate(MONTHS):
        if m.endswith("-01"):
            x = x_of(i, n, w, pad_l, pad_r)
            out.append(f'<line class="tick" x1="{x:.1f}" y1="{h-pad_b}" x2="{x:.1f}" y2="{h-pad_b+4}"/>'
                       f'<text class="ax" x="{x:.1f}" y="{h-pad_b+16}" text-anchor="middle">{m[:4]}</text>')
    return "".join(out)


def rate_chart(city, w=460, h=210):
    ser = R["series"][city]["rate"]
    n = len(ser)
    vmax = nice_max(max(ser))
    pad_l, pad_r, pad_t, pad_b = 40, 12, 30, 26
    ev = R["panel"]["events"].get(city)
    bands = ""
    if ev:
        i0 = month_index(ev["on"])
        i1 = month_index(ev["off"]) if ev["off"] else n - 1
        x0 = x_of(i0, n, w, pad_l, pad_r)
        x1 = x_of(i1, n, w, pad_l, pad_r)
        bands = f'<rect class="band" x="{x0:.1f}" y="{pad_t}" width="{x1-x0:.1f}" height="{h-pad_t-pad_b}"/>'
    grid, labels = "", ""
    for g in range(0, vmax + 1, vmax // 4):
        y = y_of(g, vmax, h, pad_t, pad_b)
        grid += f'<line class="grid" x1="{pad_l}" y1="{y:.1f}" x2="{w-pad_r}" y2="{y:.1f}"/>'
        labels += f'<text class="ax" x="{pad_l-5}" y="{y+3:.1f}" text-anchor="end">{g}</text>'
    pts = " ".join(f"{x_of(i, n, w, pad_l, pad_r):.1f},{y_of(v, vmax, h, pad_t, pad_b):.1f}"
                   for i, v in enumerate(ser))
    treated = city in R["panel"]["events"]
    cls = "ln treated" if treated else "ln control"
    role = ""
    if ev:
        role = ('<tspan class="rolet">  Flock on, then off</tspan>' if ev["off"]
                else '<tspan class="rolet">  Flock on</tspan>')
    return (f'<svg viewBox="0 0 {w} {h}" role="img" aria-label="Monthly motor vehicle thefts per 100,000 residents, {NAMES[city]}">'
            f'{bands}{grid}'
            f'<text class="ttl" x="{pad_l}" y="15">{NAMES[city]}{role}</text>'
            f'{labels}{year_ticks(w, h, pad_l, pad_r, pad_t, pad_b, n)}'
            f'<polyline class="{cls}" points="{pts}"/></svg>')


def event_study_chart(key, title, w=880, h=280):
    es = R["s4_event_studies"][key]
    ks = sorted(int(k) for k in es.keys())
    vmax = max(abs(es[str(k)]["b"]) + 1.96 * es[str(k)]["se"] for k in ks)
    vmax = max(vmax, 0.3)
    pad_l, pad_r, pad_t, pad_b = 46, 10, 28, 26
    n = len(ks)

    def xk(i):
        return pad_l + i * (w - pad_l - pad_r) / (n - 1)

    def yv(v):
        return pad_t + (1 - (v + vmax) / (2 * vmax)) * (h - pad_t - pad_b)

    parts = [f'<line class="zero" x1="{pad_l}" y1="{yv(0):.1f}" x2="{w-pad_r}" y2="{yv(0):.1f}"/>']
    i0 = ks.index(0) if 0 in ks else None
    if i0 is not None:
        parts.append(f'<line class="evline" x1="{xk(i0):.1f}" y1="{pad_t}" x2="{xk(i0):.1f}" y2="{h-pad_b}"/>')
    for g in (-0.5, 0.5):
        if abs(g) < vmax:
            parts.append(f'<text class="ax" x="{pad_l-5}" y="{yv(g)+3:.1f}" text-anchor="end">{int(g*100):+d}%</text>')
    parts.append(f'<text class="ax" x="{pad_l-5}" y="{yv(0)+3:.1f}" text-anchor="end">0</text>')
    for i, k in enumerate(ks):
        b = es[str(k)]["b"]; se = es[str(k)]["se"]
        x = xk(i)
        parts.append(f'<line class="ci" x1="{x:.1f}" y1="{yv(b-1.96*se):.1f}" x2="{x:.1f}" y2="{yv(b+1.96*se):.1f}"/>')
        parts.append(f'<circle class="pt" cx="{x:.1f}" cy="{yv(b):.1f}" r="2.6"/>')
        if k % 6 == 0:
            parts.append(f'<text class="ax" x="{x:.1f}" y="{h-pad_b+16}" text-anchor="middle">{k:+d}</text>')
    return (f'<svg viewBox="0 0 {w} {h}" role="img" aria-label="Event study: {title}">'
            f'<text class="ttl" x="{pad_l}" y="15">{title}</text>'
            + "".join(parts)
            + f'<text class="ax" x="{(w)/2:.0f}" y="{h-2}" text-anchor="middle">months relative to the event. Log points against month −1. Whiskers show ±1.96 SE, unadjusted.</text></svg>')


def recovery_chart(w=880, h=260):
    theft = R["series"]["sf"]["n"]
    rec = R["series"]["sf_recovered"]["n"]
    n = len(MONTHS)
    vmax = nice_max(max(max(theft), max(rec)))
    pad_l, pad_r, pad_t, pad_b = 46, 10, 28, 24
    i0 = month_index("2024-04")
    x0 = x_of(i0, n, w, pad_l, pad_r)
    band = f'<rect class="band" x="{x0:.1f}" y="{pad_t}" width="{w-pad_r-x0:.1f}" height="{h-pad_t-pad_b}"/>'
    grid, labels = "", ""
    for g in range(0, vmax + 1, vmax // 4):
        y = y_of(g, vmax, h, pad_t, pad_b)
        grid += f'<line class="grid" x1="{pad_l}" y1="{y:.1f}" x2="{w-pad_r}" y2="{y:.1f}"/>'
        labels += f'<text class="ax" x="{pad_l-5}" y="{y+3:.1f}" text-anchor="end">{g}</text>'
    p1 = " ".join(f"{x_of(i,n,w,pad_l,pad_r):.1f},{y_of(v,vmax,h,pad_t,pad_b):.1f}" for i, v in enumerate(theft))
    p2 = " ".join(f"{x_of(i,n,w,pad_l,pad_r):.1f},{y_of(v,vmax,h,pad_t,pad_b):.1f}" for i, v in enumerate(rec))
    return (f'<svg viewBox="0 0 {w} {h}" role="img" aria-label="San Francisco monthly motor vehicle thefts and recovered vehicles">'
            f'{band}{grid}<text class="ttl" x="{pad_l}" y="15">San Francisco: thefts and recovered vehicles by month</text>{labels}'
            f'{year_ticks(w, h, pad_l, pad_r, pad_t, pad_b, n)}'
            f'<polyline class="ln treated" points="{p1}"/><polyline class="ln rec" points="{p2}"/>'
            f'<text class="lgd treated-t" x="{w-pad_r}" y="{pad_t+12}" text-anchor="end">thefts</text>'
            f'<text class="lgd rec-t" x="{w-pad_r}" y="{pad_t+26}" text-anchor="end">recovered</text></svg>')


def near_far_chart(w=880, h=260):
    """S6: monthly thefts near (<=250m) vs far (>=500m) from mapped cameras,
    indexed to each band's mean over the 12 months before 2024-04."""
    B = json.load(open(HERE / "snapshots" / "block_supplement.json"))
    months = [m for m in MONTHS if m >= "2022-01"]
    def series(key):
        raw = B[key]
        pre = [raw.get(m, 0) for m in months if "2023-04" <= m <= "2024-03"]
        base = sum(pre) / len(pre)
        return [round(raw.get(m, 0) / base * 100, 1) for m in months]
    near = series("near_monthly"); far = series("far_monthly")
    n = len(months); vmax = nice_max(max(max(near), max(far)))
    pad_l, pad_r, pad_t, pad_b = 46, 10, 30, 26
    i0 = months.index("2024-04")
    x0 = x_of(i0, n, w, pad_l, pad_r)
    band = f'<rect class="band" x="{x0:.1f}" y="{pad_t}" width="{w-pad_r-x0:.1f}" height="{h-pad_t-pad_b}"/>'
    grid = labels = ""
    for g in range(0, vmax + 1, vmax // 4):
        y = y_of(g, vmax, h, pad_t, pad_b)
        grid += f'<line class="grid" x1="{pad_l}" y1="{y:.1f}" x2="{w-pad_r}" y2="{y:.1f}"/>'
        labels += f'<text class="ax" x="{pad_l-5}" y="{y+3:.1f}" text-anchor="end">{g}</text>'
    p1 = " ".join(f"{x_of(i,n,w,pad_l,pad_r):.1f},{y_of(v,vmax,h,pad_t,pad_b):.1f}" for i, v in enumerate(near))
    p2 = " ".join(f"{x_of(i,n,w,pad_l,pad_r):.1f},{y_of(v,vmax,h,pad_t,pad_b):.1f}" for i, v in enumerate(far))
    ticks = ""
    for i, m in enumerate(months):
        if m.endswith("-01"):
            x = x_of(i, n, w, pad_l, pad_r)
            ticks += (f'<line class="tick" x1="{x:.1f}" y1="{h-pad_b}" x2="{x:.1f}" y2="{h-pad_b+4}"/>'
                      f'<text class="ax" x="{x:.1f}" y="{h-pad_b+16}" text-anchor="middle">{m[:4]}</text>')
    return (f'<svg viewBox="0 0 {w} {h}" role="img" aria-label="SF thefts near vs far from Flock cameras, indexed">'
            f'{band}{grid}<text class="ttl" x="{pad_l}" y="15">San Francisco: thefts on blocks near cameras vs far from them (index, pre-period = 100)</text>'
            f'{labels}{ticks}'
            f'<polyline class="ln treated" points="{p1}"/><polyline class="ln control" points="{p2}"/>'
            f'<text class="lgd treated-t" x="{w-pad_r}" y="{pad_t+12}" text-anchor="end">within 250 m of a camera</text>'
            f'<text class="lgd" x="{w-pad_r}" y="{pad_t+26}" text-anchor="end" fill="var(--ctrl)">500 m or more from every camera</text></svg>')


def dumbbell_chart(w=880):
    """S6: neighborhood before/after dumbbells, 2023 vs 2025 theft counts."""
    B = json.load(open(HERE / "snapshots" / "block_supplement.json"))
    rows = []
    for hname, ys in B["neighborhood_by_year"].items():
        y23, y25 = ys.get("2023", 0), ys.get("2025", 0)
        if y23 >= 200:
            rows.append((hname, y23, y25))
    rows.sort(key=lambda r: -r[1])
    rh = 30; pad_t = 34; pad_b = 28; pad_l = 218; pad_r = 70
    h = pad_t + pad_b + rh * len(rows)
    vmax = nice_max(max(r[1] for r in rows))
    def x(v):
        return pad_l + v / vmax * (w - pad_l - pad_r)
    parts = []
    for g in range(0, vmax + 1, vmax // 4):
        parts.append(f'<line class="grid" x1="{x(g):.1f}" y1="{pad_t-6}" x2="{x(g):.1f}" y2="{h-pad_b}"/>')
        parts.append(f'<text class="ax" x="{x(g):.1f}" y="{h-pad_b+14}" text-anchor="middle">{g}</text>')
    for i, (hname, y23, y25) in enumerate(rows):
        cy = pad_t + i * rh + rh / 2
        parts.append(f'<text class="ax" x="{pad_l-8}" y="{cy+3:.1f}" text-anchor="end">{hname}</text>')
        parts.append(f'<line class="db" x1="{x(y25):.1f}" y1="{cy:.1f}" x2="{x(y23):.1f}" y2="{cy:.1f}"/>')
        parts.append(f'<circle class="db-before" cx="{x(y23):.1f}" cy="{cy:.1f}" r="4"/>')
        parts.append(f'<circle class="db-after" cx="{x(y25):.1f}" cy="{cy:.1f}" r="4"/>')
        pct = round((y25 / y23 - 1) * 100)
        parts.append(f'<text class="ax" x="{x(y23)+10:.1f}" y="{cy+3:.1f}">{pct}%</text>')
    parts.append(f'<text class="ttl" x="{pad_l}" y="15">Motor vehicle thefts by neighborhood: 2023 (gray) to 2025 (purple)</text>')
    return (f'<svg viewBox="0 0 {w} {h}" role="img" aria-label="SF neighborhoods, thefts 2023 vs 2025">'
            + "".join(parts) + '</svg>')


def change_bars(w=880):
    """S2 headline: 12-month change after the 2024-04 deployment window,
    Flock cities vs comparison cities (identical calendar windows)."""
    s2 = R["s2_prepost"]
    rows = [("San Francisco (400 cameras)", s2["sf"]["on"]["pct_change"], True),
            ("Oakland (290 city + 190 CHP)", s2["oakland"]["on"]["pct_change"], True),
            ("Denver (110 cameras)", s2["denver"]["on"]["pct_change"], True),
            ("Austin (~40 cameras)", s2["austin"]["on"]["pct_change"], True),
            ("Chicago (no Flock)", s2["sf"]["on"]["controls_pct_change"]["chicago"], False),
            ("Seattle (no Flock)", s2["sf"]["on"]["controls_pct_change"]["seattle"], False),
            ("New York City (no Flock)", s2["sf"]["on"]["controls_pct_change"]["nyc"], False)]
    rh = 34; pad_t = 30; pad_b = 26; pad_l = 232; pad_r = 70
    h = pad_t + pad_b + rh * len(rows)
    vmax = 60
    def x(v):
        return pad_l + (abs(v) / vmax) * (w - pad_l - pad_r)
    parts = [f'<text class="ttl" x="{pad_l}" y="15">Change in monthly vehicle theft, 12 months before deployment vs months 7 to 18 after</text>']
    for g in (0, 20, 40, 60):
        parts.append(f'<line class="grid" x1="{x(g):.1f}" y1="{pad_t-4}" x2="{x(g):.1f}" y2="{h-pad_b}"/>')
        parts.append(f'<text class="ax" x="{x(g):.1f}" y="{h-pad_b+14}" text-anchor="middle">{"" if g==0 else "−"}{g}%</text>')
    for i, (label, v, treated) in enumerate(rows):
        cy = pad_t + i * rh
        cls = "bar treated" if treated else "bar control"
        parts.append(f'<text class="ax" x="{pad_l-10}" y="{cy+rh/2+4:.1f}" text-anchor="end">{label}</text>')
        parts.append(f'<rect class="{cls}" x="{pad_l}" y="{cy+7:.1f}" width="{x(v)-pad_l:.1f}" height="{rh-14}" rx="3"/>')
        parts.append(f'<text class="bv" x="{x(v)+8:.1f}" y="{cy+rh/2+4:.1f}">{v:+.1f}%</text>')
    return (f'<svg viewBox="0 0 {w} {h}" role="img" aria-label="Change in vehicle theft after deployment, Flock cities vs comparisons">'
            + "".join(parts) + "</svg>")


def austin_clean_window():
    """Post-hoc supplement: Austin 2025-07..2026-01 (city network off, before
    Texas DPS Flock installs on 2026-02-02) vs. prior 12 months, with controls."""
    ser = {c: dict(zip(MONTHS, R["series"][c]["n"])) for c in NAMES}
    pre = [str(p) for p in pd.period_range("2024-07", "2025-06", freq="M")]
    post = [str(p) for p in pd.period_range("2025-07", "2026-01", freq="M")]
    out = {}
    for c in ["austin", "chicago", "nyc", "seattle"]:
        pm = sum(ser[c][m] for m in pre) / len(pre)
        qm = sum(ser[c][m] for m in post) / len(post)
        out[c] = {"pre_mean": round(pm, 1), "post_mean": round(qm, 1),
                  "pct": round((qm / pm - 1) * 100, 1)}
    return out


def main():
    frag = []
    frag.append('<div class="grid7">')
    for c in ["sf", "oakland", "austin", "denver", "chicago", "nyc", "seattle"]:
        frag.append(f'<div class="cell">{rate_chart(c)}</div>')
    frag.append("</div>")
    frag.append('<div class="figwrap" id="fig-es-sf">' + event_study_chart("sf_on", "San Francisco: network on (2024-04)") + "</div>")
    frag.append('<div class="figwrap" id="fig-es-oak">' + event_study_chart("oakland_on", "Oakland: network on (2024-04)") + "</div>")
    frag.append('<div class="figwrap" id="fig-es-aus">' + event_study_chart("austin_off", "Austin: network off (2025-07)") + "</div>")
    frag.append('<div class="figwrap" id="fig-es-den">' + event_study_chart("denver_off", "Denver: network off (2026-04)") + "</div>")
    frag.append('<div class="figwrap" id="fig-rec">' + recovery_chart() + "</div>")
    frag.append('<div class="figwrap" id="fig-bars">' + change_bars() + "</div>")
    frag.append('<div class="figwrap" id="fig-nearfar">' + near_far_chart() + "</div>")
    frag.append('<div class="figwrap" id="fig-dumbbell">' + dumbbell_chart() + "</div>")
    (HERE / "charts_fragment.html").write_text("\n".join(frag))
    supp = {"austin_clean_off_window": austin_clean_window()}
    (HERE / "supplement.json").write_text(json.dumps(supp, indent=1))
    print(json.dumps(supp, indent=1))
    print("wrote charts_fragment.html")


if __name__ == "__main__":
    main()
