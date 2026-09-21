import os, sys, json
from playwright.sync_api import sync_playwright
URL = os.environ.get('TEST_URL', 'http://127.0.0.1:18959/?test=1')
shot = sys.argv[1] if len(sys.argv) > 1 else 'bot-pix'

# Screenshot only the game canvas region (element-level screenshot, composites
# the real drawn framebuffer without HUD overlay), then analyse pixels offline.
with sync_playwright() as p:
    browser = p.chromium.launch(channel='msedge', headless=True)
    page = browser.new_page(viewport={'width': 1280, 'height': 800}, device_scale_factor=1)
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)[:200]))
    page.goto(URL)
    page.wait_for_timeout(2500)
    for _ in range(60):
        if page.evaluate('window.PolyAsset && PolyAsset.progress().soldier'):
            break
        page.wait_for_timeout(300)
    page.locator('#start').click()
    page.wait_for_function('window.Game && Game.state().running')
    page.wait_for_timeout(4000)
    page.evaluate('Game.test.fixture("target")')
    page.wait_for_timeout(1500)
    el = page.locator('#game')
    el.screenshot(path=os.path.join(os.path.dirname(__file__), 'shots', shot + '.png'))
    box = el.bounding_box()
    print('canvas box:', json.dumps({k: round(v, 1) for k, v in box.items()}))
    print('ERRORS:', errors[:5])
    browser.close()
