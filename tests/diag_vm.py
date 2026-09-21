import os, json
from playwright.sync_api import sync_playwright
URL = os.environ.get('TEST_URL', 'http://127.0.0.1:18959/?test=1')

with sync_playwright() as p:
    browser = p.chromium.launch(channel='msedge', headless=True)
    page = browser.new_page(viewport={'width': 1280, 'height': 800})
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)[:200]))
    page.goto(URL)
    page.wait_for_timeout(2500)
    # Wait for assets
    for _ in range(40):
        if page.evaluate('window.PolyAsset && (PolyAsset.progress().weapons||[]).length>=7'):
            break
        page.wait_for_timeout(400)
    page.locator('#start').click()
    page.wait_for_function('window.Game && Game.state().running')
    page.wait_for_timeout(5000)

    info = page.evaluate('''() => {
        const out = {};
        const T = window.THREE;
        const vs = window.__viewScene;
        if (!vs) { out.err = 'no __viewScene'; return out; }
        out.viewSceneChildren = vs.children.length;
        out.viewSceneChildNames = vs.children.map(c => c.type + (c.name ? ':' + c.name : ''));
        // Walk the whole view scene
        const walk = [];
        vs.traverse(o => {
            walk.push({
                type: o.type, name: o.name || '',
                visible: o.visible,
                layers: o.layers.mask,
                matrixAutoUpdate: o.matrixAutoUpdate,
                parentVisible: o.parent ? o.parent.visible : null,
                isMesh: !!o.isMesh,
                geo: o.geometry ? (o.geometry.uuid ? 'has' : 'none') : null,
                mat: o.material ? (Array.isArray(o.material) ? o.material.length : 1) : null,
                matVisible: o.material ? (Array.isArray(o.material) ? o.material.map(m=>m.visible) : o.material.visible) : null,
                pos: o.position ? [+o.position.x.toFixed(2), +o.position.y.toFixed(2), +o.position.z.toFixed(2)] : null,
                scale: o.scale ? +o.scale.x.toFixed(3) : null,
            });
        });
        out.walk = walk;
        // Camera
        out.viewCam = {pos: [+window.__viewScene && 0], near: 0};
        // Models dict
        out.modelsKeys = Object.keys(window.__models || {});
        const mk = (window.__models && Object.keys(window.__models)[0]);
        if (mk) {
            const m = window.__models[mk];
            out.modelFirst = {key: mk, type: m.type, visible: m.visible, children: m.children.length,
                              pos: [+m.position.x.toFixed(2), +m.position.y.toFixed(2), +m.position.z.toFixed(2)]};
        }
        return out;
    }''')
    print(json.dumps(info, indent=1)[:4000])
    print('ERRORS:', errors[:10])
    browser.close()
