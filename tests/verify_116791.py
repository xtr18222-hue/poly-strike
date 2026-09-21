import asyncio, json, os
from playwright.async_api import async_playwright

URL = 'http://127.0.0.1:18959/?test=1'
OUT = os.path.join(os.path.dirname(__file__), 'shots')

async def main():
    os.makedirs(OUT, exist_ok=True)
    async with async_playwright() as p:
        b = await p.chromium.launch(channel='msedge', headless=True)
        pg = await b.new_page(viewport={'width':1280,'height':800})
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(URL, wait_until='domcontentloaded')
        await pg.wait_for_function("window.PolyAsset && window.PolyAsset.progress().clips.length>0", timeout=30000)
        await pg.wait_for_timeout(3000)

        # Enter the code, open the first test map.
        await pg.evaluate("document.getElementById('settingsButton').click()")
        await pg.fill('#mapCode', '116791')
        await pg.evaluate("document.getElementById('applySettings').click()")
        await pg.wait_for_timeout(500)
        await pg.evaluate("document.getElementById('start').click()")
        await pg.wait_for_timeout(6000)

        r1 = await pg.evaluate("""() => {
            const m = window.__match, C = window.POLY_CORE;
            return {
              map: C.MAP.id, peaceful: !!C.MAP.peaceful,
              bots: m.bots.length,
              mixers: (window.__bots||[]).filter(g=>g.userData&&g.userData.mixer).length,
              clipRigs: (window.__bots||[]).filter(g=>g.children.some(c=>(c.name||'').startsWith('clip:'))).length,
              botsVisible: (window.__bots||[]).filter(g=>g.visible).length,
              drawCalls: document.getElementById('game') && window.Game ? window.Game.state().drawCalls : -1,
              phase: m.phase, hp: m.hp,
            };
        }""")
        await pg.screenshot(path=os.path.join(OUT,'range-live.png'))
        # aim at bot 0 for a visible close-up
        await pg.evaluate("window.Game.test.aim(0)")
        await pg.wait_for_timeout(1500)
        await pg.screenshot(path=os.path.join(OUT,'range-aim.png'))

        # Second deploy should bring up the depot map.
        await pg.evaluate("document.getElementById('pauseSettings') ? null : null")
        await pg.evaluate("if(!document.getElementById('pause').hidden){document.getElementById('toMenu').click()}")
        await pg.wait_for_timeout(600)
        await pg.evaluate("document.getElementById('start').click()")
        await pg.wait_for_timeout(6000)
        r2 = await pg.evaluate("""() => {
            const m = window.__match, C = window.POLY_CORE;
            return { map: C.MAP.id, peaceful: !!C.MAP.peaceful,
              mixers: (window.__bots||[]).filter(g=>g.userData&&g.userData.mixer).length,
              drawCalls: window.Game.state().drawCalls };
        }""")
        await pg.evaluate("window.Game.test.aim(1)")
        await pg.wait_for_timeout(1500)
        await pg.screenshot(path=os.path.join(OUT,'depot-aim.png'))

        # Peacefulness: hold still in front of a bot for a while, hp must not drop.
        await pg.wait_for_timeout(6000)
        r3 = await pg.evaluate("() => ({hp: window.__match.hp, shots: window.__match.bots.reduce((s,b)=>s+(b.shots||0),0)})")

        print(json.dumps({'range': r1, 'depot': r2, 'peaceful': r3, 'errors': errs[:8]}, indent=1))
        await b.close()

asyncio.run(main())
