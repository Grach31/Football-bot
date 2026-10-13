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

rel = api("v2.1/films/releases", year=2026, month="OCTOBER", page=1)
items = rel.get("releases", [])
note(f"releases: keys={list(rel.keys())} total={rel.get('total')} on_page={len(items)}")
dates = sorted({str(r.get('releaseDate')) for r in items})
note(f"release dates: {dates[:20]}")
for r in items[:3]:
    note("sample release: " + json.dumps(r, ensure_ascii=False)[:300])
for r in items[:4]:
    src = api(f"v2.2/films/{r['filmId']}/external_sources", page=1)
    note(f"sources {r.get('nameRu')}: " + json.dumps([i.get('platform') for i in src.get('items', [])], ensure_ascii=False))
pop = api("v2.2/films/collections", type="TOP_POPULAR_ALL", page=1)
note(f"popular: total={pop.get('total')} types={[i.get('type') for i in pop.get('items', [])][:20]}")
