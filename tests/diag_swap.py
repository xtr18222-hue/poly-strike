import os, json
from playwright.sync_api import sync_playwright
URL = os.environ.get('TEST_URL', 'http://127.0.0.1:18959/?test=1')

# Isolate: swap the Soldier's material for a flat magenta basic material. If it
# appears, the geometry/transform path is fine and the fault is the material
# (texture/standard-material). If it stays invisible, the geometry is bad.
SETUP = r'''() => {
  const T = window.THREE;
  const g = window.__bots[0];
  const out = {};
  let mesh = null;
  g.traverse(o => { if (o.isMesh) mesh = o; });
  if (!mesh) { out.err = 'no mesh'; return out; }
  out.before = {
    bb: mesh.geometry.boundingBox ? [mesh.geometry.boundingBox.min.y, mesh.geometry.boundingBox.max.y] : null,
    sph: mesh.geometry.boundingSphere ? mesh.geometry.boundingSphere.radius : null,
  };
  const wp = new T.Vector3(); mesh.getWorldPosition(wp);
  out.worldPos = [wp.x, wp.y, wp.z];
  mesh.material = new T.MeshBasicMaterial({color: 0xff00ff});
  out.swapped = true;
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
    page.wait_for_timeout(600)
    page.locator('#game').screenshot(
        path=os.path.join(os.path.dirname(__file__), 'shots', 'bot-swap.png'))
    print('ERRORS:', errors[:5])
    browser.close()
