import os, json
from playwright.sync_api import sync_playwright
URL = os.environ.get('TEST_URL', 'http://127.0.0.1:18959/?test=1')

BODY = r'''() => {
  const out = {};
  const g = window.__bots[0];
  let mesh = null;
  g.traverse(o => { if (o.isMesh) mesh = o; });
  if (!mesh) { out.err = 'no mesh'; return out; }
  const m = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  out.mat = {
    type: m.type,
    visible: m.visible,
    opacity: m.opacity,
    transparent: m.transparent,
    depthWrite: m.depthWrite,
    color: m.color ? '#' + m.color.getHexString() : null,
    map: m.map ? {ok: true, w: m.map.image ? (m.map.image.width || m.map.image.videoWidth || '?') : null,
                  h: m.map.image ? (m.map.image.height || m.map.image.videoHeight || '?') : null} : null,
    side: m.side,
  };
  out.geo = {
    verts: mesh.geometry.attributes.position ? mesh.geometry.attributes.position.count : 0,
    indices: mesh.geometry.index ? mesh.geometry.index.count : 0,
    boundingSphere: mesh.geometry.boundingSphere ? mesh.geometry.boundingSphere.radius : null,
    boundingBox: mesh.geometry.boundingBox ? [
      mesh.geometry.boundingBox.min.y, mesh.geometry.boundingBox.max.y] : null,
  };
  out.meshScale = [mesh.scale.x, mesh.scale.y, mesh.scale.z];
  out.parentScale = mesh.parent ? [mesh.parent.scale.x, mesh.parent.scale.y, mesh.parent.scale.z] : null;
  out.grandparentScale = (mesh.parent && mesh.parent.parent) ?
    [mesh.parent.parent.scale.x, mesh.parent.parent.scale.y, mesh.parent.parent.scale.z] : null;
  // Bone/skeleton check
  out.skeleton = !!mesh.skeleton;
  out.bindMode = mesh.bindMode || null;
  // Full hierarchy transforms
  const chain = [];
  let n = mesh;
  while (n) { chain.push(n.type + ' scale=' + n.scale.x + ' pos=' + n.position.x.toFixed(3) + ',' + n.position.y.toFixed(3) + ',' + n.position.z.toFixed(3)); n = n.parent; }
  out.chain = chain;
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
    page.wait_for_timeout(4000)
    page.evaluate('Game.test.fixture("target")')
    page.wait_for_timeout(1500)
    print(json.dumps(page.evaluate(BODY), indent=1))
    browser.close()
