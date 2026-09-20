import os,json
from playwright.sync_api import sync_playwright
BASE=os.environ.get('TEST_URL','http://127.0.0.1:18957/')
with sync_playwright() as p:
 b=p.chromium.launch(channel='msedge',headless=True);page=b.new_page(viewport={'width':1280,'height':800},service_workers='block');errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)));page.on('console',lambda m:errors.append(m.text) if m.type=='error' else None)
 page.goto(BASE+'?test=1')
 assert page.locator('#mainActions button').all_text_contents()==['Play Offline (vs Bots)','Play Online','Loadout','Settings'],'exact menu order'
 page.locator('#settingsButton').click();page.select_option('#graphics','performance');page.locator('#applySettings').click()
 assert page.evaluate("Game.state().preset==='performance'")
 page.locator('#fallback').check()
 for mapid in ['desert','industrial','urban']:
  page.select_option('#mapSelect',mapid);page.locator('#start').click();page.wait_for_timeout(400)
  s=page.evaluate('Game.state()');assert s['map']==mapid and s['running'];assert s['pixels']<=640*480
  assert s['drawCalls']<180,('performance draw budget',s)
  page.keyboard.press('Escape');page.locator('#toMenu').click()
 page.select_option('#mapSelect','desert');page.locator('#start').click();page.wait_for_timeout(300)
 page.evaluate("Game.test.fixture('target',1000)")
 page.keyboard.down('KeyW');page.keyboard.down('ShiftLeft');page.wait_for_timeout(150);page.keyboard.press('KeyC');page.wait_for_timeout(100)
 assert page.evaluate('Game.state().slide>0'),'sprint crouch slides'
 page.keyboard.up('KeyW');page.keyboard.up('ShiftLeft');page.wait_for_timeout(900)
 for digit,key in [('Digit1','akm'),('Digit2','deagle')]:
  page.keyboard.press(digit);page.wait_for_timeout(400);page.mouse.click(640,400,button='right');page.wait_for_timeout(250)
  assert page.evaluate('Game.state().ads'),key+' ADS'
  assert page.locator('#scope').is_hidden(),'rifle/pistol ADS is not sniper overlay'
  page.mouse.click(640,400,button='right')
 page.keyboard.press('Digit3');page.wait_for_timeout(450)
 variants=[]
 for i in range(3):
  page.keyboard.press('KeyF');page.wait_for_timeout(50);variants.append(page.evaluate('Game.state().inspectVariant'));page.wait_for_timeout(1600)
 assert variants==[0,1,0],('exactly two alternate bayonet animations',variants)
 page.keyboard.press('Digit1');page.wait_for_timeout(400);page.evaluate("Game.test.fixture('target',1000)");page.wait_for_timeout(100)
 page.mouse.down();page.wait_for_timeout(600);page.mouse.up();s=page.evaluate('Game.state()');assert s['ammo']['akm']['mag']<=25,('reliable automatic fire',s)
 page.keyboard.press('KeyR');page.wait_for_timeout(1500);assert page.evaluate('Game.state().ammo.ak47.mag')==30,'fast reload'
 assert not errors,errors
 print('PASS upgrade menu/order, 3 maps, graphics budgets, sprint slide, rifle/pistol ADS, two knife animations, AK sustained fire and faster reload; zero runtime errors')
 b.close()
