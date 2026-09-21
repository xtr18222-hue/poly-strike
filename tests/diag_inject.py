import os, json
from playwright.sync_api import sync_playwright
URL = os.environ.get('TEST_URL', 'http://127.0.0.1:18959/?test=1')

# Isolation test: inject a 2m magenta box into the SAME scene the game renders,
# at the bot's position. If it draws, the render pipeline is fine and the
# problem is the Soldier asset itself.
SETUP = r'''() => {
  const T = window.THREE;
  const g = window.__bots[0];
  // The game's `scene` is the bot group's parent chain root.
  let root = g;
  while (root.parent) root = root.parent;
  const box = new T.Mesh(
    new T.BoxGeometry(1.6, 2.2, 0.8),
    new T.MeshBasicMaterial({color: 0xff00ff}));
  box.position.set(g.position.x, 1.1, g.position.z);
  root.add(box);
  return {sceneType: root.type, boxPos: [box.position.x, box.position.y, box.position.z]};
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
    page.evaluate('Game.test.fixture("target")')
    page.wait_for_timeout(1500)
    print(json.dumps(page.evaluate(SETUP)))
    page.wait_for_timeout(600)
    page.locator('#game').screenshot(
        path=os.path.join(os.path.dirname(__file__), 'shots', 'bot-box.png'))
    print('ERRORS:', errors[:5])
    browser.close()
