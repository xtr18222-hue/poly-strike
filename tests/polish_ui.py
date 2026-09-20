import os
from playwright.sync_api import sync_playwright
BASE=os.environ.get('TEST_URL','http://127.0.0.1:18957/')
with sync_playwright() as p:
 b=p.chromium.launch(channel='msedge',headless=True);page=b.new_page(service_workers='block');errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)));page.on('console',lambda m:errors.append(m.text) if m.type=='error' else None)
 page.goto(BASE+'?test=1');page.wait_for_function('window.PolyAsset && window.PolyAsset.progress().soldier',timeout=90000);page.wait_for_function('window.Game')
 assert page.locator('#username').count()==1,'custom username input'
 page.locator('#username').fill('<XTR & tester>');page.locator('#username').dispatch_event('change');page.reload();assert page.locator('#username').input_value()=='<XTR & tester>'
 assert 'Made by XTR' in page.locator('#menu footer').inner_text()
 assert page.locator('#mainActions button').all_text_contents()==['Play Offline (vs Bots)','Play Online','Loadout','Settings']
 page.locator('#fallback').check();page.locator('#start').click();page.wait_for_function('Game.state().running');page.wait_for_timeout(1500);page.keyboard.down('Tab');page.wait_for_timeout(200)
 assert page.locator('#scoreboard th').all_text_contents()==['Name','Kills','Deaths','Score']
 assert '<XTR & tester>' in page.locator('#scoreboard').inner_text();assert page.locator('#scoreboard script').count()==0
 page.keyboard.up('Tab');assert page.locator('#scoreboard').is_hidden()
 assert not errors,errors
 print('PASS username persistence/safe rendering, branding, unchanged menu order and Tab table')
 b.close()
