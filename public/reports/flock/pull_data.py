"""Pull monthly motor-vehicle-theft series and Flock payment rows for the
Flock ALPR report (docs/flock/METHODOLOGY.md, pre-registered).

Writes JSON snapshots to scripts/analysis/flock/snapshots/ with retrieval
timestamps. All queries are citywide monthly aggregates by occurrence date.
"""
import json
import time
import urllib.parse
from datetime import datetime, timezone
from pathlib import Path

import requests

OUT = Path(__file__).parent / "snapshots"
OUT.mkdir(exist_ok=True)

PANEL_START = "2022-01-01"
UA = {"User-Agent": "TransparentCity-flock-report/0.1 (adam@planet10b.com)"}


def get(url, params, tries=4):
    for i in range(tries):
        r = requests.get(url, params=params, headers=UA, timeout=90)
        if r.status_code == 200:
            return r.json()
        time.sleep(3 * (i + 1))
    r.raise_for_status()


def socrata_monthly(domain, dataset, date_field, where):
    """Monthly counts via SoQL date_trunc_ym."""
    url = f"https://{domain}/resource/{dataset}.json"
    params = {
        "$select": f"date_trunc_ym({date_field}) as month, count(*) as n",
        "$where": f"({where}) AND {date_field} >= '{PANEL_START}T00:00:00'",
        "$group": "month",
        "$order": "month",
        "$limit": "200",
    }
    rows = get(url, params)
    return {r["month"][:7]: int(r["n"]) for r in rows if r.get("month")}


def arcgis_monthly_denver():
    """Denver auto-theft monthly counts via ArcGIS groupBy on extracted year/month."""
    url = ("https://services1.arcgis.com/zdB7qR0BtYrg0Xpl/arcgis/rest/services/"
           "ODC_CRIME_OFFENSES_P/FeatureServer/324/query")
    params = {
        "where": ("OFFENSE_CATEGORY_ID='auto-theft' AND "
                  f"FIRST_OCCURRENCE_DATE >= DATE '{PANEL_START}'"),
        "groupByFieldsForStatistics": "EXTRACT(YEAR FROM FIRST_OCCURRENCE_DATE), EXTRACT(MONTH FROM FIRST_OCCURRENCE_DATE)",
        "outStatistics": json.dumps([{"statisticType": "count",
                                      "onStatisticField": "OBJECTID",
                                      "outStatisticFieldName": "n"}]),
        "returnGeometry": "false",
        "f": "json",
    }
    r = requests.get(url, params=params, headers=UA, timeout=120)
    r.raise_for_status()
    data = r.json()
    if "error" in data:
        raise RuntimeError(data["error"])
    out = {}
    for f in data["features"]:
        a = f["attributes"]
        y = int(a["EXPR_1"]); m = int(a["EXPR_2"]); n = int(a["n"])
        out[f"{y:04d}-{m:02d}"] = n
    return out


def socrata_rows(domain, dataset, where, select="*", order=None, limit=5000):
    url = f"https://{domain}/resource/{dataset}.json"
    params = {"$select": select, "$where": where, "$limit": str(limit)}
    if order:
        params["$order"] = order
    return get(url, params)


def main():
    snapshot = {"retrieved_utc": datetime.now(timezone.utc).isoformat(),
                "panel_start": PANEL_START, "series": {}, "payments": {}}

    s = snapshot["series"]
    print("SF MVT...")
    s["sf_mvt"] = socrata_monthly("data.sfgov.org", "wg3w-h783", "incident_date",
                                  "incident_category='Motor Vehicle Theft'")
    print("SF recovered...")
    s["sf_recovered"] = socrata_monthly("data.sfgov.org", "wg3w-h783", "incident_date",
                                        "incident_category='Recovered Vehicle'")
    print("Chicago MVT...")
    s["chicago_mvt"] = socrata_monthly("data.cityofchicago.org", "ijzp-q8t2", "date",
                                       "primary_type='MOTOR VEHICLE THEFT'")
    print("Austin MVT...")
    s["austin_mvt"] = socrata_monthly("data.austintexas.gov", "fdj4-gpfu", "occ_date",
                                      "crime_type='AUTO THEFT'")
    print("Oakland MVT...")
    s["oakland_mvt"] = socrata_monthly("data.oaklandca.gov", "ppgh-7dqv", "datetime",
                                       "crimetype='STOLEN VEHICLE'")
    print("Oakland recovered...")
    s["oakland_recovered"] = socrata_monthly(
        "data.oaklandca.gov", "ppgh-7dqv", "datetime",
        "crimetype in('STOLEN AND RECOVERED VEHICLE','RECOVERED VEHICLE - OAKLAND STOLEN')")
    print("NYC historic MVT...")
    nyc_hist = socrata_monthly("data.cityofnewyork.us", "qgea-i56i", "cmplnt_fr_dt",
                               "ofns_desc='GRAND LARCENY OF MOTOR VEHICLE'")
    print("NYC YTD MVT...")
    nyc_ytd = socrata_monthly("data.cityofnewyork.us", "5uac-w243", "cmplnt_fr_dt",
                              "ofns_desc='GRAND LARCENY OF MOTOR VEHICLE'")
    nyc = {k: v for k, v in nyc_hist.items() if k <= "2025-12"}
    for k, v in nyc_ytd.items():
        if k >= "2026-01":
            nyc[k] = v
    s["nyc_mvt"] = nyc
    print("Seattle MVT...")
    s["seattle_mvt"] = socrata_monthly("data.seattle.gov", "tazs-3rd5", "offense_date",
                                       "nibrs_offense_code='240'")
    print("Denver MVT (ArcGIS)...")
    s["denver_mvt"] = arcgis_monthly_denver()

    p = snapshot["payments"]
    print("SF Flock payments...")
    p["sf_vouchers"] = socrata_rows(
        "data.sfgov.org", "n9pm-xkyq",
        "upper(vendor) like '%FLOCK%'", order="fiscal_year")
    print("SF Flock contracts...")
    p["sf_contracts"] = socrata_rows(
        "data.sfgov.org", "cqi5-hm2d",
        "upper(prime_contractor) like '%FLOCK%'")
    print("Denver Flock payments...")
    p["denver_checkbook"] = socrata_rows(
        "data.colorado.gov", "wnau-xrqi",
        "upper(payee) like '%FLOCK%'", order="paymentdate")
    print("Chicago Flock check (expect empty)...")
    p["chicago_check"] = socrata_rows(
        "data.cityofchicago.org", "s4vu-giwb",
        "upper(vendor_name) like '%FLOCK SAFETY%' OR upper(vendor_name) like '%FLOCK GROUP%'")

    out_path = OUT / "flock_snapshot.json"
    out_path.write_text(json.dumps(snapshot, indent=1))
    for name, series in s.items():
        months = sorted(series)
        print(f"{name}: {len(series)} months  {months[0] if months else '-'} .. {months[-1] if months else '-'}")
    for name, rows in p.items():
        print(f"{name}: {len(rows)} rows")
    print(f"wrote {out_path}")


if __name__ == "__main__":
    main()
