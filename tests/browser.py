import os, json
from playwright.sync_api import sync_playwright
URL = os.environ.get('TEST_URL', 'http://127.0.0.1:18957/')
with sync_playwright() as p:
    browser = p.chromium.launch(channel='msedge', headless=True)
    page = browser.new_page(viewport={'width':1280,'height':800})
    errors=[]
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(URL)
    assert page.locator('#start').count()==1, 'Playable title screen missing'
    page.locator('#start').click()
    page.wait_for_function('window.Game && Game.state().running')
    page.wait_for_timeout(500)
    assert page.evaluate('Game.state().frames') > 1
    assert not errors, errors
    print(json.dumps(page.evaluate('Game.state()'), indent=2))
    browser.close()
