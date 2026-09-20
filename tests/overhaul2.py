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
