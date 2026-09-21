import os, json
from playwright.sync_api import sync_playwright
URL = os.environ.get('TEST_URL', 'http://127.0.0.1:18959/?test=1')

BODY = r'''() => {
  const bots = window.__bots;
  const rows = [];
  bots.forEach((g, i) => {
    let meshes = 0, vis = 0, skinned = 0, mats = [];
    g.traverse(o => {
      if (o.isMesh) {
        meshes++; if (o.visible) vis++;
        if (o.isSkinnedMesh) skinned++;
        const m = Array.isArray(o.material) ? o.material[0] : o.material;
        if (m) mats.push((m.type || '?') + (m.map ? '+tex' : '') + ' op=' + m.opacity + ' vis=' + m.visible);
      }
    });
    rows.push(i + ': kids=' + g.children.length + ' meshes=' + meshes + ' vis=' + vis +
              ' skinned=' + skinned + ' groupVis=' + g.visible +
              ' pos=[' + g.position.x.toFixed(1) + ',' + g.position.z.toFixed(1) + ']');
    if (mats.length) rows.push('    mats: ' + mats.slice(0, 4).join(' | '));
  });
  const st = Game.state();
  // Are the bot meshes inside the camera frustum / behind the player?
  const T = window.THREE;
  return rows.join('\n') + '\nCAM: x=' + st.x.toFixed(1) + ' z=' + st.z.toFixed(1) +
         ' yaw=' + st.yaw.toFixed(2) + ' alive=' + st.alive;
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
    page.wait_for_timeout(5000)
    print(page.evaluate(BODY))
    print('ERRORS:', errors[:6])
    browser.close()
