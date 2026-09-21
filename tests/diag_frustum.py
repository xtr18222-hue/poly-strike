import os, json
from playwright.sync_api import sync_playwright
URL = os.environ.get('TEST_URL', 'http://127.0.0.1:18959/?test=1')

# Frustum + projected-screen-position test: is the bot actually inside the
# camera's view volume, and where on screen does it land?
BODY = r'''() => {
  const T = window.THREE;
  const g = window.__bots[0];
  const st = Game.state();
  // Rebuild a frustum from the live camera
  const cam = null;
  // game.js keeps cam private; reconstruct from state (camera state is
  // authoritative in Game.state()).
  const out = {};
  out.camState = {x: st.x, y: st.y, z: st.z, yaw: st.yaw, pitch: st.pitch};
  out.botGroupPos = [g.position.x, g.position.y, g.position.z];
  const box = new T.Box3().setFromObject(g);
  out.box = [[box.min.x, box.min.y, box.min.z], [box.max.x, box.max.y, box.max.z]];
  out.distance = Math.hypot(st.x - g.position.x, st.z - g.position.z);
  // Ray from camera to bot center: does it hit the bot first, or scenery?
  return out;
}'''

with sync_playwright() as p:
    browser = p.chromium.launch(channel='msedge', headless=True)
    page = browser.new_page(viewport={'width': 1280, 'height': 800})
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
    print(json.dumps(page.evaluate(BODY), indent=1))
    print('ERRORS:', errors[:5])
    browser.close()
