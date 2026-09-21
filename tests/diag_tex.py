import os, json
from playwright.sync_api import sync_playwright
URL = os.environ.get('TEST_URL', 'http://127.0.0.1:18959/?test=1')

# Extract the Soldier's texture image from the live page (it is a 56x56 PNG/JPG
# inside the GLB) and save it, so we know the rig's actual colour palette.
BODY = r'''() => {
  return new Promise((resolve) => {
    const T = window.THREE;
    const loader = new T.GLTFLoader();
    loader.load(location.pathname.replace(/[^/]*$/, '') + 'assets/models/Soldier%20by%20madtrollstudio%20-%20UL46oXeZYK.glb',
      (gltf) => {
        let mesh = null;
        gltf.scene.traverse(o => { if (o.isMesh) mesh = o; });
        if (!mesh) { resolve({err: 'no mesh'}); return; }
        const m = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
        const map = m.map;
        if (!map || !map.image) { resolve({err: 'no map', mat: m.type}); return; }
        const cv = document.createElement('canvas');
        cv.width = map.image.width; cv.height = map.image.height;
        const ctx = cv.getContext('2d');
        ctx.drawImage(map.image, 0, 0);
        resolve({w: cv.width, h: cv.height, dataUrl: cv.toDataURL('image/png').slice(0, 100)});
      },
      undefined,
      (e) => resolve({err: String(e.message || e).slice(0, 150)}));
  });
}'''

with sync_playwright() as p:
    browser = p.chromium.launch(channel='msedge', headless=True)
    page = browser.new_page(viewport={'width': 1280, 'height': 800})
    page.goto(URL)
    page.wait_for_timeout(3000)
    # fetch the data URL and write it to disk via a full evaluate round-trip
    import base64
    data = page.evaluate(BODY)
    print(json.dumps({k: v for k, v in data.items() if k != 'dataUrl'}))
    # bigger: get the whole data url
    full = page.evaluate(r'''() => new Promise((resolve) => {
      const T = window.THREE;
      const loader = new T.GLTFLoader();
      loader.load(location.pathname.replace(/[^/]*$/, '') + 'assets/models/Soldier%20by%20madtrollstudio%20-%20UL46oXeZYK.glb',
        (gltf) => {
          let mesh = null;
          gltf.scene.traverse(o => { if (o.isMesh) mesh = o; });
          const m = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
          const map = m.map;
          if (!map || !map.image) { resolve(null); return; }
          const cv = document.createElement('canvas');
          cv.width = map.image.width; cv.height = map.image.height;
          cv.getContext('2d').drawImage(map.image, 0, 0);
          resolve(cv.toDataURL('image/png'));
        }, undefined, () => resolve(null));
    })''')
    if full:
        raw = base64.b64decode(full.split(',', 1)[1])
        out = os.path.join(os.path.dirname(__file__), 'soldier-tex.png')
        open(out, 'wb').write(raw)
        print('texture written to', out)
    browser.close()
