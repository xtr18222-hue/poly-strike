import os, json
from playwright.sync_api import sync_playwright
URL = os.environ.get('TEST_URL', 'http://127.0.0.1:18959/?test=1')

# Point-blank: stand the camera 2m from bot0, aimed at it. A 1.9m rig at 2m with
# 75deg vfov fills roughly the whole vertical screen. Nothing subtle about it.
SETUP = r'''() => {
  const g = window.__bots[0];
  // move bot0 to 2m in front of the spawn camera and lock the view on it
  Game.test.bot(0, 0, 36);
  return {botPos: [g.position.x, g.position.z]};
}'''

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
    print(json.dumps(page.evaluate(SETUP)))
    # camera starts at (0,34) yaw 0 looking -Z, so a bot at (0,36) is BEHIND.
    # face it instead: yaw=PI looks +Z.
    page.evaluate('Game.test.place(0, 34); ')
    page.wait_for_timeout(300)
    page.screenshot(path=os.path.join(os.path.dirname(__file__), 'shots', 'bot-pointblank.png'))
    print('ERRORS:', errors[:5])
    browser.close()
