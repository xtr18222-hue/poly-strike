import os, json
from playwright.sync_api import sync_playwright
URL = os.environ.get('TEST_URL', 'http://127.0.0.1:18959/?test=1')

with sync_playwright() as p:
    browser = p.chromium.launch(channel='msedge', headless=True)
    page = browser.new_page(viewport={'width': 1280, 'height': 800})
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)[:150]))
    page.goto(URL)
    page.wait_for_timeout(2500)
    for _ in range(60):
        if page.evaluate('window.PolyAsset && PolyAsset.progress().soldier'):
            break
        page.wait_for_timeout(300)
    page.locator('#start').click()
    page.wait_for_function('window.Game && Game.state().running')
    page.wait_for_timeout(4000)
    # Place bot 2 10m ahead of the camera, aim at its head
    page.evaluate('Game.test.bot(2, 0, 24)')
    page.wait_for_timeout(600)
    page.evaluate('Game.test.aim(2)')
    page.wait_for_timeout(1200)
    st = page.evaluate('Game.state()')
    print('cam', round(st['x'],1), round(st['z'],1), 'yaw', round(st['yaw'],2))
    page.screenshot(path=os.path.join(os.path.dirname(__file__), 'shots', 'bot-near.png'))
    print('ERRORS:', errors[:5])
    browser.close()
