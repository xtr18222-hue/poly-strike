import os, json
from playwright.sync_api import sync_playwright
URL = os.environ.get('TEST_URL', 'http://127.0.0.1:18959/?test=1')

BODY = r'''() => {
  const T = window.THREE;
  const g0 = window.__bots[0];
  const out = {};
  // world-space bounding box of bot 0
  const box = new T.Box3().setFromObject(g0);
  out.worldBox = {min: [box.min.x, box.min.y, box.min.z].map(v => +v.toFixed(2)),
                  max: [box.max.x, box.max.y, box.max.z].map(v => +v.toFixed(2)),
                  empty: box.isEmpty()};
  // local-space box of the child rig
  const child = g0.children[0];
  const lbox = new T.Box3().setFromObject(child);
  out.childType = child.type;
  out.childPos = [child.position.x, child.position.y, child.position.z].map(v => +v.toFixed(2));
  out.childBox = {min: [lbox.min.x, lbox.min.y, lbox.min.z].map(v => +v.toFixed(2)),
                  max: [lbox.max.x, lbox.max.y, lbox.max.z].map(v => +v.toFixed(2))};
  // Camera frustum test
  const fr = new T.Frustum();
  const cam = null;
  out.cameraPos = null;
  return out;
}'''

with sync_playwright() as p:
    browser = p.chromium.launch(channel='msedge', headless=True)
    page = browser.new_page(viewport={'width': 1280, 'height': 800})
    page.goto(URL)
    page.wait_for_timeout(2500)
    for _ in range(60):
        if page.evaluate('window.PolyAsset && PolyAsset.progress().soldier'):
            break
        page.wait_for_timeout(300)
    page.locator('#start').click()
    page.wait_for_function('window.Game && Game.state().running')
    page.wait_for_timeout(5000)
    print(json.dumps(page.evaluate(BODY), indent=1))
    browser.close()
