import asyncio, subprocess, sys, os, time
from playwright.async_api import async_playwright

PORT = os.environ.get('PORT', '18961')
BASE = f'http://127.0.0.1:{PORT}/'
fails = []

def check(name, cond, extra=''):
    print(f"{'PASS' if cond else 'FAIL'}  {name} {extra}")
    if not cond: fails.append(name)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader',
                                          '--no-sandbox', '--disable-web-security'])
        page = await b.new_page(viewport={'width':1280,'height':720},
                                service_workers='block', ignore_https_errors=True)
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('console', lambda m: errors.append(f'{m.type}: {m.text}') if m.type=='error' else None)
        await page.goto(BASE, wait_until='networkidle')
        await page.wait_for_timeout(1200)

        # ---- 1. Loadout canvas must not shrink the main drawing buffer -------
        await page.click('#loadoutButton')
        await page.wait_for_timeout(500)
        dims_in = await page.evaluate('''() => {
          const c = document.querySelector('#game');
          return {w: c.width, h: c.height, cw: c.clientWidth, ch: c.clientHeight};
        }''')
        check('loadout open: main canvas keeps full size',
              dims_in['w'] >= 1200 and dims_in['h'] >= 600, str(dims_in))

        await page.click('#loadoutClose')
        await page.wait_for_timeout(400)
        dims_out = await page.evaluate('''() => {
          const c = document.querySelector('#game');
          return {w: c.width, h: c.height};
        }''')
        check('loadout closed: canvas restored to full size',
              dims_out['w'] >= 1200 and dims_out['h'] >= 600, str(dims_out))

        # viewport must be restored for the main scene render too
        vp = await page.evaluate('''() => {
          const c = document.querySelector('#game');
          const gl = c.getContext('webgl2') || c.getContext('webgl');
          return gl.getParameter(gl.VIEWPORT).join(',');
        }''')
        # WebGL viewport is (x,y,w,h) with y measured from the BOTTOM-left.
        parts = vp.split(',')
        check('WebGL viewport restored to full canvas after exit',
              parts[0] == '0' and parts[1] == '0' and parts[2] == str(dims_out['w']) and parts[3] == str(dims_out['h']), vp)

        # ---- 2. 360 drag rotation of the preview weapon ----------------------
        await page.click('#loadoutButton')
        await page.wait_for_timeout(300)
        cv = await page.query_selector('#loadoutCanvas')
        box = await cv.bounding_box()
        yaw0 = await page.evaluate("() => window.__loadoutYaw ?? 0")
        await page.mouse.move(box['x']+box['width']/2, box['y']+box['height']/2)
        await page.mouse.down()
        await page.mouse.move(box['x']+box['width']/2+250, box['y']+box['height']/2, steps=10)
        await page.mouse.up()
        await page.wait_for_timeout(300)
        yaw1 = await page.evaluate("() => window.__loadoutYaw ?? 0")
        check('drag rotates preview weapon (yaw changed)', abs(yaw1-yaw0) > 0.5,
              f'yaw {yaw0:.2f} -> {yaw1:.2f}')

        # ---- 3. Skins: 3 per weapon, apply live ------------------------------
        await page.click('#loadoutClose')
        await page.wait_for_timeout(200)
        n_skins = await page.evaluate("() => PolyVisual.SKINS['ak47'].length")
        check('3 skins defined per weapon', n_skins == 3, f'{n_skins} skins')
        has_legendary = await page.evaluate(
            "() => PolyVisual.SKINS['awp'].some(s => s.name.toLowerCase().includes('dragon'))")
        check('Legendary AWP skin exists ("Dragon")', has_legendary)
        n_char = await page.evaluate("() => PolyVisual.CHAR_SKINS.length")
        check('character skins defined', n_char >= 2, f'{n_char} char skins')

        # applying a skin must change a material colour without throwing
        skin_ok = await page.evaluate('''() => { try {
          const T = window.THREE; const m = PolyVisual.buildWeapon(T,'ak47');
          const before = m.children[0].material.color.getHex();
          PolyVisual.applySkin(T, m, 'ak47', 1);
          return {ok:true, changed: m.children[0].material.color.getHex() !== before};
        } catch(e){ return {ok:false, err:String(e)}; } }''')
        check('applySkin runs cleanly', bool(skin_ok.get('ok')), str(skin_ok))
        check('applySkin actually changes material colour',
              skin_ok.get('changed') is True, str(skin_ok))

        # ---- 4. Store tab + case opening -------------------------------------
        order = await page.evaluate('''() => [...document.querySelectorAll('#mainActions button')]
          .map(b => b.id)''')
        expect = ['start','onlineButton','loadoutButton','storeButton','settingsButton']
        check('main menu order strict: Play Offline/Online/Loadout/Store/Settings',
              order == expect, str(order))

        await page.click('#storeButton')
        await page.wait_for_timeout(400)
        count0 = await page.evaluate("() => { const m = document.querySelector('#caseCount').textContent.match(/\\d+/); return m ? Number(m[0]) : -1; }")
        check('store shows 3 free crates on first visit', count0 == 3, f'crates={count0}')

        await page.click('#openCase')
        await page.wait_for_timeout(1200)
        strip_mid = await page.evaluate("() => document.querySelector('#caseStrip').style.transform")
        check('case reel scrolls during opening', bool(strip_mid) and strip_mid != 'none', str(strip_mid))
        await page.wait_for_timeout(4000)  # let the 4.2s animation finish
        count1 = await page.evaluate("() => { const m = document.querySelector('#caseCount').textContent.match(/\\d+/); return m ? Number(m[0]) : -1; }")
        check('crate consumed after opening', count1 == count0 - 1, f'{count0} -> {count1}')
        result = await page.evaluate("() => document.querySelector('#caseResult').textContent.trim()")
        check('case result displayed with rarity tier',
              any(r in result for r in ['Common','Uncommon','Rare','Epic','Legendary']), repr(result))

        # ---- 5. Missions track progress dynamically --------------------------
        missions = await page.evaluate('''() => {
          // Simulate mission progress the way a kill would.
          window.progressMissions('kills', 5);
          window.progressMissions('headshots', 3);
          window.saveMissions();
          return JSON.parse(localStorage.getItem('poly-missions') || '{}');
        }''')
        k = missions.get('kills20', {}).get('p', -1)
        h = missions.get('hs10', {}).get('p', -1)
        check('missions persist kill/headshot progress', k == 5 and h == 3, str(missions))

        # completing a mission must grant crates
        granted = await page.evaluate("() => { window.progressMissions('kills', 15); return window.__crates; }")
        check('completing a mission grants crate reward', granted >= 1, f'crates={granted}')

        await page.click('#storeClose')
        await page.wait_for_timeout(300)

        # ---- 6. Leg strides are decoupled and freeze when stationary ---------
        legs_ok = await page.evaluate('''() => {
          const o = window.__bots && window.__bots[0];
          if (!o) return 'no bots';
          const pivots = o.userData.legPivots;
          if (!pivots || pivots.length !== 2) return 'no leg pivots: ' + (pivots?.length);
          // Both pivots exist and are independent groups at the hips.
          const a = pivots[0], b = pivots[1];
          if (a === b) return 'pivots identical';
          if (a.position.x === b.position.x) return 'legs share hip x';
          return true;
        }''')
        check('bot rig has two independent hip pivots', legs_ok is True, str(legs_ok))

        await b.close()
        print(f"\nconsole/page errors: {len(errors)}")
        for e in errors[:10]: print('  ', e)
        if errors: fails.append('page errors')
        print(f"\n{'ALL PASS' if not fails else 'FAILURES: ' + ', '.join(fails)}")
        return 0 if not fails else 1

sys.exit(asyncio.run(main()))
