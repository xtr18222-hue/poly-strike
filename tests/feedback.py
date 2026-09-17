import os
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
 b=p.chromium.launch(channel='msedge',headless=True);page=b.new_page(service_workers='block');errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)));page.on('console',lambda m:errors.append(m.text) if m.type=='error' else None)
 page.goto(os.environ.get('TEST_URL','http://127.0.0.1:18957/')+'?test=1');page.wait_for_function('window.Game');page.locator('#fallback').check();page.locator('#start').click()
 assert page.locator('#damageDirection').count()==1,'directional damage marker missing'
 page.evaluate("window.sounds=[];const original=PolyAudio.sound;PolyAudio.sound=t=>{sounds.push(t);original(t)};Game.test.fixture('target')")
 page.keyboard.press('Digit3');page.wait_for_timeout(300);page.mouse.click(640,400);page.wait_for_timeout(200)
 assert page.locator('#feed .special').count()==1
 assert 'headshot' in page.evaluate('sounds')
 page.evaluate('Game.test.damageFrom(10,20)');page.wait_for_timeout(100)
 assert float(page.locator('#damageDirection').evaluate('(e)=>getComputedStyle(e).opacity'))>0
 assert abs(float(page.locator('#damageDirection').get_attribute('data-angle'))-90)<1
 for slot in ['Digit1','Digit2','Digit3','Digit4']:
  page.keyboard.press(slot);page.wait_for_timeout(250);page.keyboard.press('KeyF');page.wait_for_timeout(200);assert page.evaluate('Game.state().inspect')>0
  page.wait_for_timeout(3400);assert page.evaluate('Game.state().inspect')==0
 assert not errors,errors;assert page.locator('#error').is_hidden()
 print('PASS headshot ding/gold kill, direction marker and all inspections complete without errors');b.close()
