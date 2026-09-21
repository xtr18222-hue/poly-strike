import os, json, sys
from playwright.sync_api import sync_playwright
URL = os.environ.get('TEST_URL', 'http://127.0.0.1:18959/')
mode = sys.argv[1] if len(sys.argv) > 1 else 'game'
with sync_playwright() as p:
    browser = p.chromium.launch(channel='msedge', headless=True)
    page = browser.new_page(viewport={'width':1280,'height':800}, device_scale_factor=1)
    errors=[]
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: errors.append('console:'+m.type+':'+m.text) if m.type in ('error','warning') else None)
    page.goto(URL + '?test=1')
    page.wait_for_timeout(1200)
    if mode == 'game':
        page.locator('#start').click()
        page.wait_for_function('window.Game && Game.state().running')
        # wait through buy phase into live
        page.wait_for_timeout(7000)
        page.evaluate('Game.test.aim(0)')
        page.wait_for_timeout(600)
        info = page.evaluate('''() => {
          const T = window.THREE;
          const g = window.__bots[0];
          g.updateMatrixWorld(true);
          const box = new T.Box3().setFromObject(g);
          const c = new T.Vector3(); box.getCenter(c);
          return {botBox:[+(box.max.x-box.min.x).toFixed(2),+(box.max.y-box.min.y).toFixed(2),+(box.max.z-box.min.z).toFixed(2)],
                  botCenter:[+c.x.toFixed(2),+c.y.toFixed(2),+c.z.toFixed(2)], state: window.Game.state()};
        }''')
        print(json.dumps({k:info[k] for k in ('botBox','botCenter')}, indent=1))
        st = info['state']
        print('phase', st['phase'], 'drawCalls', st['drawCalls'], 'frames', st['frames'], 'fps', st['fps'])
        print('state weapon/slots:', st['weapon'], st['inventory'])
        page.screenshot(path='tests/shots/game-after.png')
    elif mode == 'loadout':
        page.locator('#loadoutButton').click()
        page.wait_for_timeout(1200)
        st = page.evaluate('''() => ({calls: window.__loadoutCalls||0, sel: window.__loadoutSelected(), visible: window.__loadoutModels[window.__loadoutSelected()].visible})''')
        print(json.dumps(st, indent=1))
        page.screenshot(path='tests/shots/loadout-after.png')
    print('console errors/warnings:', errors[:15])
    browser.close()
