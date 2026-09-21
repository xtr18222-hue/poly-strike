import os, json
from playwright.sync_api import sync_playwright
URL = os.environ.get('TEST_URL', 'http://127.0.0.1:18959/?test=1')

# Find the actual render root: inject a magenta box into every candidate scene.
SETUP = r'''() => {
  const T = window.THREE;
  const out = {};
  const g0 = window.__bots[0];
  // Walk up from bot0
  let root = g0;
  while (root.parent) root = root.parent;
  out.botRootType = root.type;
  out.botRootChildren = root.children.length;
  out.bot0ParentChain = (() => {
    const chain = [];
    let n = g0;
    while (n) { chain.push(n.type); n = n.parent; }
    return chain;
  })();
  // Does the root look like a THREE.Scene?
  out.rootIsScene = root.isScene === true;
  out.rootBackground = root.background ? (root.background.getHexString ? '#' + root.background.getHexString() : 'non-color') : null;
  // Inject into the root AND check renderer
  out.injected = (() => {
    const box = new T.Mesh(new T.BoxGeometry(2, 2.4, 1),
      new T.MeshBasicMaterial({color: 0xff00ff}));
    box.position.set(g0.position.x, 1.2, g0.position.z);
    root.add(box);
    return true;
  })();
  return out;
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
    print(json.dumps(page.evaluate(SETUP), indent=1))
    print('ERRORS:', errors[:5])
    browser.close()
