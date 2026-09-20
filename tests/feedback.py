import os
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
 b=p.chromium.launch(channel='msedge',headless=True);page=b.new_page(service_workers='block');errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)));page.on('console',lambda m:errors.append(m.text) if m.type=='error' else None)
 page.goto(os.environ.get('TEST_URL','http://127.0.0.1:18957/')+'?test=1');page.wait_for_function('window.Game');page.locator('#fallback').check();page.locator('#start').click()
 assert page.locator('#damageDirection').count()==1,'directional damage marker missing'
 page.evaluate("window.sounds=[];const original=PolyAudio.sound;PolyAudio.sound=t=>{sounds.push(t);original(t)};Game.test.fixture('target')")
 # Headshot kill with the primary (AK-47 by default): aim at the torso, then
 # drag-look up so the ray lands on the head mesh. A torso hit would only wound,
 # the headshot produces the amber kill feed entry.
 page.evaluate("Game.test.fixture('target', 60)");page.wait_for_timeout(150)
 page.keyboard.press('Digit1');page.wait_for_timeout(300)
 # The Soldier rig's head is at y=1.93, not the old 1.5m centre.
 # One headshot with the AK must drop the target outright, so stage a low-HP bot.
 page.evaluate("Game.test.fixture('target', 30)");page.wait_for_timeout(150)
 page.evaluate('Game.test.bot(0,0,12); Game.test.aim(0)');page.wait_for_timeout(50)
 page.mouse.click(640,400);page.wait_for_timeout(200)
 assert page.locator('#feed .skull.headshot').count()==1,'amber headshot kill feed entry'
 assert 'headshot' in page.evaluate('sounds'),'headshot ding'
 page.evaluate('Game.test.damageFrom(10,20)');page.wait_for_timeout(100)
 assert float(page.locator('#damageDirection').evaluate('(e)=>getComputedStyle(e).opacity'))>0,'damage marker visible'
 assert abs(float(page.locator('#damageDirection').get_attribute('data-angle'))-90)<1,'damage marker points at source'
 # Inspections for every slot present in a session: 1 primary, 2 Deagle, 3 knife.
 for slot in ['Digit1','Digit2','Digit3']:
  page.keyboard.press(slot);page.wait_for_timeout(250);page.keyboard.press('KeyF');page.wait_for_timeout(200);assert page.evaluate('Game.state().inspect')>0,'inspect starts on '+slot
  page.wait_for_timeout(3600);assert page.evaluate('Game.state().inspect')==0,'inspect completes on '+slot
 assert not errors,errors;assert page.locator('#error').is_hidden()
 print('PASS headshot ding/amber kill, direction marker and all inspections complete without errors');b.close()
