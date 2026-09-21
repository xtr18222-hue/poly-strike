import os, json
from playwright.sync_api import sync_playwright
URL = os.environ.get('TEST_URL', 'http://127.0.0.1:18959/?test=1')

# Isolation harness: load the raw Soldier GLB into a throwaway THREE scene,
# render it with a basic magenta material in a dedicated canvas we fully
# control, and count magenta pixels. Removes all game-pipeline variables.
SETUP = r'''() => {
  return new Promise((resolve) => {
    const T = window.THREE;
    const cv = document.createElement('canvas');
    cv.width = 400; cv.height = 400;
    document.body.appendChild(cv);
    const r = new T.WebGLRenderer({canvas: cv, antialias: true, preserveDrawingBuffer: true});
    r.setSize(400, 400, false);
    const s = new T.Scene();
    s.background = new T.Color(0x000000);
    s.add(new T.HemisphereLight(0xffffff, 0x444444, 2));
    const cam = new T.PerspectiveCamera(50, 1, 0.05, 50);
    cam.position.set(0, 1.2, 4.5);
    cam.lookAt(0, 1.0, 0);
    const loader = new T.GLTFLoader();
    loader.load(location.pathname.replace(/[^/]*$/, '') + 'assets/models/Soldier%20by%20madtrollstudio%20-%20UL46oXeZYK.glb',
      (gltf) => {
        const m = gltf.scene;
        // flat magenta so we can count pixels unambiguously
        m.traverse(n => { if (n.isMesh) n.material = new T.MeshBasicMaterial({color: 0xff00ff}); });
        s.add(m);
        r.render(s, cam);
        resolve({rendered: true, children: m.children.length});
      },
      undefined,
      (e) => resolve({err: String(e.message || e).slice(0, 150)}));
  });
}'''

with sync_playwright() as p:
    browser = p.chromium.launch(channel='msedge', headless=True)
    page = browser.new_page(viewport={'width': 1280, 'height': 800}, device_scale_factor=1)
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)[:200]))
    page.goto(URL)
    page.wait_for_timeout(3000)
    out = page.evaluate(SETUP)
    print('setup:', json.dumps(out))
    page.wait_for_timeout(500)
    # screenshot just the injected canvas
    canvases = page.locator('canvas')
    n = page.locator('canvas').count()
    print('canvas count:', n)
    if n > 1:
        canvases.nth(n - 1).screenshot(
            path=os.path.join(os.path.dirname(__file__), 'shots', 'soldier-iso.png'))
    print('ERRORS:', errors[:5])
    browser.close()
