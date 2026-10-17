import json, urllib.request, urllib.parse
UA = {"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
      "Accept": "application/json,text/html,*/*", "Accept-Language": "ru-RU,ru"}
def get(url):
    try:
        r = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=25)
        b = r.read()
        return r.status, b
    except Exception as e:
        return getattr(e, "code", str(e)), b""
q = urllib.parse.quote("свитер женский вязаный")
for v in ["v4", "v5", "v7", "v9", "v13", "v14", "v18"]:
    s, b = get(f"https://search.wb.ru/exactmatch/ru/common/{v}/search?ab_testing=false&appType=1&curr=rub&dest=-1257786&query={q}&resultset=catalog&sort=popular&spp=30")
    print("WB search", v, s, len(b), b[:300])
for u in ["https://card.wb.ru/cards/v2/detail?appType=1&curr=rub&dest=-1257786&nm=1267284838",
          "https://card.wb.ru/cards/v4/detail?appType=1&curr=rub&dest=-1257786&nm=1267284838",
          "https://www.lamoda.ru/p/MP002XW1O8XY/",
          "https://www.lamoda.ru/catalogsearch/result/?q=%D1%81%D0%B2%D0%B8%D1%82%D0%B5%D1%80",
          "https://limestore.com/ru_ru/catalog/zhenshchinam-trikotazh",
          "https://api.ipify.org?format=json"]:
    s, b = get(u)
    print(u, s, len(b), b[:300])
