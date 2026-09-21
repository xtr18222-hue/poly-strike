import os, json
from playwright.sync_api import sync_playwright
URL = os.environ.get('TEST_URL', 'http://127.0.0.1:18959/?test=1')

# Dump the raw (unbaked) Soldier GLB node tree: scale, position, and local
# geometry bounds per node. Run at the menu, before anything is baked.
BODY = r'''() => {
  const T = window.THREE;
  const out = {nodes: []};
  const p = PolyAsset.progress();
  out.progress = p;
  // Re-load the raw glb directly to inspect the pristine hierarchy.
  return new Promise((resolve) => {
    const loader = new T.GLTFLoader();
    loader.load(location.pathname.replace(/[^/]*$/, '') + 'assets/models/Soldier%20by%20madtrollstudio%20-%20UL46oXeZYK.glb',
      (gltf) => {
        const scene = gltf.scene;
        scene.updateMatrixWorld(true);
        scene.traverse((n) => {
          const entry = {type: n.type, name: n.name || '',
                         scale: [+n.scale.x, +n.scale.y, +n.scale.z],
                         pos: [+n.position.x, +n.position.y, +n.position.z]};
          if (n.isMesh) {
            const bb = n.geometry.boundingBox;
            entry.geoBB = bb ? [+bb.min.x, +bb.min.y, +bb.min.z, +bb.max.x, +bb.max.y, +bb.max.z] : null;
            entry.geoSph = n.geometry.boundingSphere ? +n.geometry.boundingSphere.radius : null;
            entry.verts = n.geometry.attributes.position ? n.geometry.attributes.position.count : 0;
            const m = Array.isArray(n.material) ? n.material[0] : n.material;
            entry.mat = m ? m.type : null;
            // world bounds of just this mesh
            const wb = new T.Box3().setFromObject(n);
            entry.worldBB = !wb.isEmpty() ? [[+wb.min.x, +wb.min.y, +wb.min.z], [+wb.max.x, +wb.max.y, +wb.max.z]] : 'empty';
          }
          out.nodes.push(entry);
        });
        resolve(out);
      },
      undefined,
      (e) => { out.err = String(e.message || e).slice(0, 200); resolve(out); });
  });
}'''

with sync_playwright() as p:
    browser = p.chromium.launch(channel='msedge', headless=True)
    page = browser.new_page(viewport={'width': 1280, 'height': 800})
    page.goto(URL)
    page.wait_for_timeout(3000)
    info = page.evaluate(BODY)
    print('progress:', info.get('progress'), 'err:', info.get('err'))
    for n in info['nodes']:
        print(json.dumps(n))
    browser.close()
