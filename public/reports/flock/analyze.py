"""Run the pre-registered specifications S1-S5 from docs/flock/METHODOLOGY.md
against snapshots/flock_snapshot.json. Writes analysis_results.json.

No specification choices here deviate from the methodology committed at
f093c5df before this module was written.
"""
import json
from itertools import permutations
from pathlib import Path

import numpy as np
import pandas as pd
import statsmodels.formula.api as smf

HERE = Path(__file__).parent
PANEL_END = "2026-06"
PANEL_START = "2022-01"

CITIES = ["sf", "oakland", "austin", "denver", "chicago", "nyc", "seattle"]

# Census Vintage-2023 city population estimates (July 1, 2023), held constant.
POP = {"sf": 808_988, "oakland": 436_504, "austin": 979_882, "denver": 716_577,
       "chicago": 2_664_452, "nyc": 8_258_035, "seattle": 755_078}

# Pre-registered treatment paths (city Flock network active months, inclusive).
EVENTS = {
    "sf":      {"on": "2024-04", "off": None},
    "oakland": {"on": "2024-04", "off": None},
    "austin":  {"on": "2024-02", "off": "2025-06"},  # active through 2025-06
    "denver":  {"on": "2024-04", "off": "2026-03"},  # active through 2026-03
}


def months_range(a, b):
    return [str(p) for p in pd.period_range(a, b, freq="M")]


MONTHS = months_range(PANEL_START, PANEL_END)


def load_panel():
    snap = json.load(open(HERE / "snapshots" / "flock_snapshot.json"))
    s = snap["series"]
    rows = []
    for c in CITIES:
        series = s[f"{c}_mvt"]
        for m in MONTHS:
            n = series.get(m)
            if n is None:
                raise ValueError(f"missing {c} {m}")
            rows.append({"city": c, "month": m, "n": n})
    df = pd.DataFrame(rows)
    df["rate"] = df["n"] / df["city"].map(POP) * 100_000
    df["logn"] = np.log(df["n"])
    return df, snap


def flock_active(city, month):
    ev = EVENTS.get(city)
    if not ev:
        return 0
    if month < ev["on"]:
        return 0
    if ev["off"] and month > ev["off"]:
        return 0
    return 1


def spec2_prepost(df):
    """S2: 12-mo pre vs months 7-18 post for ON; for OFF, all available post."""
    out = {}

    def window_mean(city, months):
        sub = df[(df.city == city) & (df.month.isin(months))]
        return float(sub.n.mean()), len(sub)

    def rel_months(anchor, lo, hi):
        p = pd.Period(anchor, freq="M")
        return [str(p + k) for k in range(lo, hi + 1)]

    for city, ev in EVENTS.items():
        e = {}
        pre = rel_months(ev["on"], -12, -1)
        post = [m for m in rel_months(ev["on"], 7, 18) if m <= PANEL_END]
        pre_m, _ = window_mean(city, pre)
        post_m, npost = window_mean(city, post)
        ctrl = {}
        for cc in ["chicago", "nyc", "seattle"]:
            c_pre, _ = window_mean(cc, pre)
            c_post, _ = window_mean(cc, post)
            ctrl[cc] = round((c_post / c_pre - 1) * 100, 1)
        e["on"] = {"pre_mean": round(pre_m, 1), "post_mean": round(post_m, 1),
                   "post_months_used": npost,
                   "pct_change": round((post_m / pre_m - 1) * 100, 1),
                   "controls_pct_change": ctrl}
        if ev["off"]:
            off_first = str(pd.Period(ev["off"], freq="M") + 1)
            pre = rel_months(off_first, -12, -1)
            post = [m for m in months_range(off_first, PANEL_END)]
            pre_m, _ = window_mean(city, pre)
            post_m, npost = window_mean(city, post)
            ctrl = {}
            for cc in ["chicago", "nyc", "seattle"]:
                c_pre, _ = window_mean(cc, pre)
                c_post, _ = window_mean(cc, post)
                ctrl[cc] = round((c_post / c_pre - 1) * 100, 1)
            e["off"] = {"pre_mean": round(pre_m, 1), "post_mean": round(post_m, 1),
                        "post_months_used": npost,
                        "pct_change": round((post_m / pre_m - 1) * 100, 1),
                        "controls_pct_change": ctrl}
        out[city] = e
    return out


def did(df, treated_paths=None, cities=None, outcome="logn"):
    """S3 DiD. treated_paths maps city->path-city whose EVENTS timing it inherits."""
    d = df if cities is None else df[df.city.isin(cities)].copy()
    if treated_paths is None:
        d = d.assign(active=[flock_active(c, m) for c, m in zip(d.city, d.month)])
    else:
        d = d.assign(active=[
            flock_active(treated_paths.get(c, "__none__"), m)
            for c, m in zip(d.city, d.month)])
    m = smf.ols(f"{outcome} ~ active + C(city) + C(month)", data=d).fit(
        cov_type="cluster", cov_kwds={"groups": d["city"]})
    return float(m.params["active"]), float(m.bse["active"]), m


def permutation_inference(df, cities=None):
    """Reassign the 4 observed treatment paths across the panel cities."""
    cities = cities or CITIES
    beta_obs, se, _ = did(df, cities=cities)
    paths = ["sf", "oakland", "austin", "denver"]
    betas = []
    for assign in permutations(cities, len(paths)):
        mapping = {city: path for city, path in zip(assign, paths)}
        b, _, _ = did(df, treated_paths=mapping, cities=cities)
        betas.append(b)
    betas = np.array(betas)
    p = float(np.mean(np.abs(betas) >= abs(beta_obs) - 1e-12))
    return {"beta": round(beta_obs, 4), "se_cluster": round(se, 4),
            "pct_effect": round((np.exp(beta_obs) - 1) * 100, 1),
            "n_permutations": len(betas), "perm_p_two_sided": round(p, 4)}


def event_study(df, city, event_month, k_lo=-12, k_hi=12, controls=("chicago", "nyc", "seattle")):
    """S4: single treated city vs controls; coefficients relative to k=-1."""
    d = df[df.city.isin([city, *controls])].copy()
    e = pd.Period(event_month, freq="M")
    d["k"] = [(pd.Period(m, freq="M") - e).n if c == city else None
              for c, m in zip(d.city, d.month)]
    d["kb"] = d["k"].clip(lower=k_lo, upper=k_hi)
    dummies = {}
    for k in range(k_lo, k_hi + 1):
        if k == -1:
            continue
        col = f"ev_{'m' if k < 0 else 'p'}{abs(k)}"
        d[col] = ((d.city == city) & (d.kb == k)).astype(int)
        dummies[k] = col
    rhs = " + ".join(dummies.values())
    m = smf.ols(f"logn ~ {rhs} + C(city) + C(month)", data=d).fit()
    coefs = {}
    for k, col in dummies.items():
        if d[col].sum() > 0:
            coefs[k] = {"b": round(float(m.params[col]), 4),
                        "se": round(float(m.bse[col]), 4)}
    coefs[-1] = {"b": 0.0, "se": 0.0}
    return coefs


def spec2_no_ramp(df):
    """Robustness: S2 ON comparison with post = months 1..12 (no 6-month ramp skip)."""
    out = {}
    for city, ev in EVENTS.items():
        p = pd.Period(ev["on"], freq="M")
        pre = [str(p + k) for k in range(-12, 0)]
        post = [str(p + k) for k in range(1, 13) if str(p + k) <= PANEL_END]
        pre_m = float(df[(df.city == city) & (df.month.isin(pre))].n.mean())
        post_m = float(df[(df.city == city) & (df.month.isin(post))].n.mean())
        ctrl = {}
        for cc in ["chicago", "nyc", "seattle"]:
            c_pre = float(df[(df.city == cc) & (df.month.isin(pre))].n.mean())
            c_post = float(df[(df.city == cc) & (df.month.isin(post))].n.mean())
            ctrl[cc] = round((c_post / c_pre - 1) * 100, 1)
        out[city] = {"pre_mean": round(pre_m, 1), "post_mean": round(post_m, 1),
                     "pct_change": round((post_m / pre_m - 1) * 100, 1), "controls_pct_change": ctrl}
    return out


def denver_on_sensitivity(df):
    """Robustness: Denver ON month shifted to 2024-02 and 2024-06 (flagged +/- 2 months)."""
    out = {}
    base = EVENTS["denver"]["on"]
    for on in ("2024-02", "2024-06"):
        EVENTS["denver"]["on"] = on
        s2 = spec2_prepost(df)["denver"]["on"]
        did_res = permutation_inference(df)
        out[on] = {"s2_pct_change": s2["pct_change"], "s2_controls": s2["controls_pct_change"],
                   "s3_pct_effect": did_res["pct_effect"], "s3_perm_p": did_res["perm_p_two_sided"]}
    EVENTS["denver"]["on"] = base
    return out


def austin_on_sensitivity(df):
    """Robustness: Austin ON month moved to 2024-04 (first cameras live 2024-03-29)."""
    base = EVENTS["austin"]["on"]
    EVENTS["austin"]["on"] = "2024-04"
    s2 = spec2_prepost(df)["austin"]["on"]
    EVENTS["austin"]["on"] = base
    return {"2024-04": {"s2_pct_change": s2["pct_change"], "s2_controls": s2["controls_pct_change"]}}


def winsorized_panel(df):
    """Robustness: winsorize each city's monthly counts at its p1/p99 before the S3 model."""
    d = df.copy()
    for c in CITIES:
        s = d.loc[d.city == c, "n"]
        lo, hi = s.quantile(0.01), s.quantile(0.99)
        d.loc[d.city == c, "n"] = s.clip(lo, hi)
    d["logn"] = np.log(d["n"])
    return d


def main():
    df, snap = load_panel()
    res = {"panel": {"start": PANEL_START, "end": PANEL_END,
                     "retrieved_utc": snap["retrieved_utc"],
                     "populations": POP, "events": EVENTS},
           "series": {}, "s2_prepost": {}, "s3_did": {}, "s4_event_studies": {},
           "s5_recoveries": {}, "payments": {}}

    # S1 series (raw + per-100k) for charting, including secondary series.
    for c in CITIES:
        sub = df[df.city == c].sort_values("month")
        res["series"][c] = {"months": list(sub.month), "n": [int(x) for x in sub.n],
                            "rate": [round(float(x), 2) for x in sub.rate]}
    for key in ["sf_recovered", "oakland_recovered"]:
        ser = snap["series"][key]
        res["series"][key] = {"months": MONTHS, "n": [ser.get(m, 0) for m in MONTHS]}

    res["s2_prepost"] = spec2_prepost(df)

    res["s3_did"]["primary"] = permutation_inference(df)
    res["s3_did"]["levels"] = did(df, outcome="n")[0]
    # robustness variants
    base_events = json.loads(json.dumps(EVENTS))
    EVENTS["sf"]["on"] = "2024-07"
    res["s3_did"]["sf_on_2024_07"] = permutation_inference(df)
    EVENTS["sf"]["on"] = base_events["sf"]["on"]
    no_austin = [c for c in CITIES if c != "austin"]
    res["s3_did"]["excl_austin"] = permutation_inference(df, cities=no_austin)
    no_denver = [c for c in CITIES if c != "denver"]
    res["s3_did"]["excl_denver"] = permutation_inference(df, cities=no_denver)
    res["s3_did"]["winsorized"] = permutation_inference(winsorized_panel(df))
    res["s3_did"]["levels_note"] = "coefficient in thefts per month, OLS with city and month fixed effects"
    res["s2_no_ramp"] = spec2_no_ramp(df)
    res["denver_on_sensitivity"] = denver_on_sensitivity(df)
    res["austin_on_sensitivity"] = austin_on_sensitivity(df)

    res["s4_event_studies"]["sf_on"] = event_study(df, "sf", "2024-04", k_hi=24)
    res["s4_event_studies"]["oakland_on"] = event_study(df, "oakland", "2024-04", k_hi=24)
    res["s4_event_studies"]["austin_off"] = event_study(df, "austin", "2025-07", k_hi=11)
    res["s4_event_studies"]["denver_off"] = event_study(df, "denver", "2026-04", k_hi=2)

    # S5 recoveries
    for c in ["sf", "oakland"]:
        theft = res["series"][c]["n"]
        rec = res["series"][f"{c}_recovered"]["n"]
        ratio = [round(r / t, 3) if t else None for r, t in zip(rec, theft)]
        res["s5_recoveries"][c] = {"months": MONTHS, "recovered": rec, "ratio": ratio}

    # Payments rollups (exclude the unrelated 2007 'KATHERINE FLOCK' voucher).
    sfv = [r for r in snap["payments"]["sf_vouchers"] if r["vendor"] == "FLOCK SAFETY"]
    res["payments"]["sf_total_paid"] = round(sum(float(r["vouchers_paid"]) for r in sfv), 2)
    res["payments"]["sf_by_fy"] = {}
    for r in sfv:
        fy = r["fiscal_year"]
        res["payments"]["sf_by_fy"][fy] = round(
            res["payments"]["sf_by_fy"].get(fy, 0) + float(r["vouchers_paid"]), 2)
    res["payments"]["sf_contracts"] = [
        {"title": r["contract_title"], "agreed": float(r["agreed_amt"]),
         "paid": float(r["pmt_amt"]), "start": r["term_start_date"][:10],
         "end": r["term_end_date"][:10]} for r in snap["payments"]["sf_contracts"]]
    dv = snap["payments"]["denver_checkbook"]
    res["payments"]["denver_total"] = round(sum(float(r["amount"]) for r in dv), 2)
    res["payments"]["denver_rows"] = [
        {"date": r["paymentdate"][:10], "amount": float(r["amount"])} for r in dv]
    res["payments"]["chicago_flock_rows"] = len(snap["payments"]["chicago_check"])

    out = HERE / "analysis_results.json"
    out.write_text(json.dumps(res, indent=1))
    print(json.dumps({k: res["s3_did"][k] for k in res["s3_did"] if k != "levels"}, indent=1))
    print("S2:", json.dumps(res["s2_prepost"], indent=1))
    print("payments:", json.dumps({k: v for k, v in res["payments"].items()
                                   if k in ("sf_total_paid", "denver_total", "chicago_flock_rows", "sf_by_fy")}))
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
