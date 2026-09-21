import os, sys, json
from playwright.sync_api import sync_playwright
URL = os.environ.get('TEST_URL', 'http://127.0.0.1:18959/?test=1')
shot = sys.argv[1] if len(sys.argv) > 1 else 'bot-close'

BODY = r'''() => {
  const T = window.THREE;
  const g = window.__bots[2];
  const box = new T.Box3().setFromObject(g);
  const st = Game.state();
  return {box: [[box.min.x,box.min.y,box.min.z],[box.max.x,box.max.y,box.max.z]].map(a=>a.map(v=>+v.toFixed(2))),
          dist: Math.hypot(st.x-box.getCenter(new T.Vector3()).x, st.z-box.getCenter(new T.Vector3()).z)};
}'''

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
    # Aim at bot 2 (directly ahead) and move closer
    page.evaluate('Game.test.aim(2)')
    page.wait_for_timeout(800)
    print(json.dumps(page.evaluate(BODY), indent=1))
    page.screenshot(path=os.path.join(os.path.dirname(__file__), 'shots', shot + '.png'))
    print('ERRORS:', errors[:5])
    browser.close()
