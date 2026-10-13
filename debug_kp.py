"""Диагностика Kinopoisk API: выводит в аннотации GitHub, что отдаёт API."""
import json, os, urllib.request, urllib.parse

def note(msg):
    print(f"::warning::{msg}")

def api(path, **params):
    url = f"https://kinopoiskapiunofficial.tech/api/{path}" + (f"?{urllib.parse.urlencode(params)}" if params else "")
    req = urllib.request.Request(url, headers={"X-API-KEY": os.environ["KINOPOISK_TOKEN"]})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        note(f"{path}: HTTP {e.code} {e.read().decode(errors='replace')[:200]}")
        return {}

pop = api("v2.2/films/collections", type="TOP_POPULAR_ALL", page=1)
items = pop.get("items", [])
note("sample popular: " + json.dumps(items[0], ensure_ascii=False)[:400])
for f in items[:6]:
    src = api(f"v2.2/films/{f['kinopoiskId']}/external_sources", page=1)
    note(f"sources {f.get('nameRu')} ({f.get('year')},{f.get('type')}): " + json.dumps([i.get('platform') for i in src.get('items', [])], ensure_ascii=False))
ser = [f for f in items if f.get("type") == "TV_SERIES"][:2]
for f in ser:
    s = api(f"v2.2/films/{f['kinopoiskId']}/seasons")
    last = (s.get("items") or [{}])[-1]
    eps = last.get("episodes", [])[-3:]
    note(f"seasons {f.get('nameRu')}: total={s.get('total')} last={json.dumps(eps, ensure_ascii=False)[:300]}")
years = {}
for page in (1, 2, 3):
    for f in api("v2.2/films/collections", type="TOP_POPULAR_ALL", page=page).get("items", []):
        years[f.get("year")] = years.get(f.get("year"), 0) + 1
note(f"popular years (3 pages): {years}")
