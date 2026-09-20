"""Load tests/fit.html and print the fitted-weapon report from assets.js."""
import json, os
from playwright.sync_api import sync_playwright

URL = 'http://127.0.0.1:18959/'

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append('page: ' + str(e)))
    pg.on('console', lambda m: errs.append('console: ' + m.text) if m.type == 'error' else None)
    pg.goto(URL + 'tests/fit.html', wait_until='load')
    for _ in range(60):
        pg.wait_for_timeout(500)
        if pg.evaluate('window.__fitResult && window.__fitResult.done'):
            break
    res = pg.evaluate('window.__fitResult')
    res['page_errors'] = errs
    print(json.dumps(res, indent=1))
    b.close()
