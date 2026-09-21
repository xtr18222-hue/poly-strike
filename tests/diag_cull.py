import os, json
from playwright.sync_api import sync_playwright
URL = os.environ.get('TEST_URL', 'http://127.0.0.1:18959/?test=1')

BODY = r'''() => {
  const T = window.THREE;
  const g = window.__bots[0];
  const st = Game.state();
  const out = {};
  let mesh = null;
  g.traverse(o => { if (o.isMesh) mesh = o; });
  out.mesh = mesh ? {
    frustumCulled: mesh.frustumCulled,
    renderOrder: mesh.renderOrder,
    visible: mesh.visible,
    layers: mesh.layers.mask,
    geoBB: mesh.geometry.boundingBox ? [
      [mesh.geometry.boundingBox.min.x, mesh.geometry.boundingBox.min.y, mesh.geometry.boundingBox.min.z],
      [mesh.geometry.boundingBox.max.x, mesh.geometry.boundingBox.max.y, mesh.geometry.boundingBox.max.z]] : null,
    boundingSphere: mesh.geometry.boundingSphere ? {
      center: [mesh.geometry.boundingSphere.center.x, mesh.geometry.boundingSphere.center.y, mesh.geometry.boundingSphere.center.z],
      radius: mesh.geometry.boundingSphere.radius} : null,
    worldMatrixOk: !mesh.matrixWorld.elements.some(v => Number.isNaN(v)),
    pos: [mesh.worldPosition ? 0 : 0],
  } : null;
  if (mesh) {
    const wp = new T.Vector3(); mesh.getWorldPosition(wp);
    out.mesh.worldPos = [wp.x, wp.y, wp.z];
  }
  // Raycast from camera toward bot center
  out.raycast = (() => {
    const rc = new T.Raycaster();
    const origin = new T.Vector3(st.x, st.y + 0.1, st.z);
    const target = new T.Vector3(g.position.x, 0.96, g.position.z);
    const dir = target.clone().sub(origin).normalize();
    rc.set(origin, dir);
    rc.far = 200;
    const arena = window.__arena;
    const meshes = [...(arena ? arena.hitMeshes : []), ...window.__bots];
    const hits = rc.intersectObjects(meshes, true);
    return hits.slice(0, 4).map(h => ({
      dist: +h.distance.toFixed(2),
      name: h.object.type + (h.object.userData.botId !== undefined ? ' BOT' + h.object.userData.botId : ' scenery'),
    }));
  })();
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
