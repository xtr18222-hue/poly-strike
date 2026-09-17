import os,json
from pathlib import Path
from playwright.sync_api import sync_playwright
BASE=os.environ.get('TEST_URL','http://127.0.0.1:18957/')
with sync_playwright() as p:
 b=p.chromium.launch(channel='msedge',headless=True)
 context=b.new_context();page=context.new_page();errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(BASE);page.wait_for_function('window.Game')
 page.wait_for_function('navigator.serviceWorker.controller !== null')
 context.set_offline(True);page.reload();page.wait_for_function('window.Game')
 page.locator('#fallback').check();page.locator('#start').click();page.wait_for_timeout(500)
 assert page.evaluate('Game.state().running && Game.state().frames > 5')
 assert not errors,errors
 print('PASS offline: service worker reload, assets, deployment and render loop')
 context.close()
 # Direct file launch must not require any server/network/CDN.
 context=b.new_context(service_workers='block');page=context.new_page();errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto((Path(__file__).resolve().parent.parent/'index.html').as_uri())
 page.wait_for_function('window.Game');page.locator('#fallback').check();page.locator('#start').click();page.wait_for_timeout(300)
 assert page.evaluate('Game.state().running') and not errors,errors
 print('PASS direct file:// launch')
 context.close()
 # Pointer lock is exercised separately from drag-look automation.
 page=b.new_page();page.goto(BASE);page.locator('#start').click();page.wait_for_timeout(500)
 s=page.evaluate('Game.state()');assert s['running'] and (s['locked'] or s['fallback'])
 print('PASS pointer-lock launch',json.dumps({'locked':s['locked'],'fallback':s['fallback']}))
 page.keyboard.press('Escape');page.wait_for_timeout(100);assert not page.evaluate('Game.state().running')
 b.close()
