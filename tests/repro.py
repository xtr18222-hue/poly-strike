import os, json
from playwright.sync_api import sync_playwright
URL = os.environ.get('TEST_URL', 'http://127.0.0.1:18959/')
with sync_playwright() as p:
    browser = p.chromium.launch(channel='msedge', headless=True)
    page = browser.new_page(viewport={'width':1280,'height':800})
    errors=[]
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: errors.append('console:'+m.type+':'+m.text) if m.type=='error' else None)
    page.goto(URL)
    page.wait_for_timeout(1500)
    page.locator('#start').click()
    page.wait_for_function('window.Game && Game.state().running')
    page.wait_for_timeout(3500)
    st = page.evaluate('''() => {
      const T = window.THREE;
      const out = {errors:[], assetProgress: window.PolyAsset ? PolyAsset.progress() : null};
      // Bot visibility: are Soldier meshes actually rendered?
      const bots = window.__bots || [];
      out.bots = bots.map(b => {
        let meshes=0, vis=0, drawn=0;
        b.traverse(o=>{ if(o.isMesh){meshes++; if(o.visible)vis++; }});
        b.updateMatrixWorld(true);
        const box = new T.Box3().setFromObject(b);
        out.botBox = box.isEmpty() ? 'EMPTY' : [+(box.max.x-box.min.x).toFixed(2),+(box.max.y-box.min.y).toFixed(2),+(box.max.z-box.min.z).toFixed(2)];
        return {meshes, vis, visible: b.visible, children: b.children.length, pos:[+b.position.x, +b.position.z]};
      });
      // Weapon viewmodel
      const m = window.Game.test ? null : null;
      const keys = ['akm','l96','mosin','mx','hecate','deagle','bayonet'];
      out.models = {};
      for (const k of keys) {
        // viewmodel roots live in the second scene; count via renderer info
      }
      out.state = window.Game.state();
      out.drawCalls = window.Game.state().drawCalls;
      out.audioReady = window.PolyAudio ? PolyAudio.ready : null;
      return out;
    }''')
    print(json.dumps(st, indent=1)[:3500])
    # count visible weapon meshes in viewScene via render info
    print('drawCalls after 3.5s:', page.evaluate('Game.state().drawCalls'))
    print('errors:', errors[:10])
    browser.close()
