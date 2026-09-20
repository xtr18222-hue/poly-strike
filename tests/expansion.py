import os
from playwright.sync_api import sync_playwright
BASE=os.environ.get('TEST_URL','http://127.0.0.1:18958/')
with sync_playwright() as p:
    b=p.chromium.launch(channel='msedge',headless=True)
    c=b.new_context(viewport={'width':1280,'height':800},service_workers='block')
    page=c.new_page(); errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('console',lambda m:errors.append(m.text) if m.type=='error' else None)
    page.goto(BASE+'?test=1&expansion=2');page.wait_for_timeout(500)
    assert not errors,errors
    assert page.locator('#error').is_hidden()
    assert page.locator('#loadoutButton').count()==1,'loadout hub button missing'
    page.click('#loadoutButton');page.wait_for_timeout(250)
    page.click('.wcard[data-weapon="mosin"]');page.wait_for_timeout(150)
    assert page.evaluate('Game.state().primary')=='mosin'
    page.click('#loadoutClose');page.wait_for_timeout(150)
    page.check('#fallback');page.click('#start');page.wait_for_timeout(500)
    assert page.evaluate('Game.state().weapon')=='mosin'
    page.keyboard.press('Digit2');assert page.evaluate('Game.state().weapon')=='deagle'
    page.keyboard.press('Digit3');assert page.evaluate('Game.state().weapon')=='bayonet'
    page.keyboard.press('Digit1');assert page.evaluate('Game.state().weapon')=='mosin'
    page.keyboard.press('KeyQ');assert page.evaluate('Game.state().weapon')=='bayonet'
    page.mouse.move(640,400);page.mouse.wheel(0,100);page.wait_for_timeout(100)
    assert page.evaluate('Game.state().weapon')=='mosin'
    page.evaluate("Game.test.fixture('target',1000)");page.wait_for_timeout(300)
    page.keyboard.press('KeyG');page.wait_for_timeout(100)
    assert page.evaluate('Game.state().dropped'),'G drops primary'
    assert page.evaluate('Game.state().weapon')=='deagle'
    page.keyboard.press('Digit1');assert page.evaluate('Game.state().weapon')=='deagle'
    page.keyboard.press('KeyE');page.wait_for_timeout(300)
    assert page.evaluate('Game.state().weapon')=='mosin'
    page.evaluate("Game.test.select('mosin')");page.wait_for_timeout(300)
    page.keyboard.press('KeyF');page.wait_for_timeout(500)
    page.keyboard.down('KeyW');page.wait_for_timeout(30)
    assert page.evaluate('Game.state().inspect')==0,'movement immediately cancels inspect'
    page.keyboard.up('KeyW');page.wait_for_timeout(150)
    page.evaluate("Game.test.empty()");page.mouse.click(640,400);page.wait_for_timeout(100)
    assert page.evaluate('Game.state().reload')==0,'empty fire never autoreloads'
    assert 'RELOAD!' in page.locator('#status').inner_text()
    page.keyboard.press('KeyR');page.wait_for_timeout(2800)
    assert page.evaluate('Game.state().ammo.mosin.mag')==5
    page.evaluate('Game.test.lowHealth()');page.wait_for_timeout(150)
    assert 'low-health' in page.locator('body').get_attribute('class')
    page.evaluate("Game.test.kill('Enemy <b>unsafe</b>',true)");page.wait_for_timeout(100)
    assert page.locator('#feed b').count()==0
    assert page.locator('#feed .headshot').count()==1
    assert 'Enemy <b>unsafe</b>' in page.locator('#feed').inner_text()
    page.evaluate("Game.test.fixture('win')");page.wait_for_timeout(100)
    assert 'CLUTCH' in page.locator('#banner').inner_text()
    page.evaluate("Game.test.fixture('match')");page.wait_for_timeout(4300)
    assert 'Accuracy:' in page.locator('#pauseText').inner_text()
    assert 'MVP:' in page.locator('#pauseText').inner_text()
    assert page.locator('#rematchControls').is_visible()
    page.select_option('#nextMap','urban');page.click('#rematch');page.wait_for_timeout(300)
    assert page.evaluate('Game.state().map')=='urban'
    page.keyboard.press('Escape');page.click('#pauseSettings')
    page.locator('#sensitivity').fill('1.23');page.locator('#adsSensitivity').fill('0.67')
    page.click('#applySettings');page.reload();page.wait_for_timeout(300)
    assert page.locator('#sensitivity').input_value()=='1.23'
    assert page.locator('#adsSensitivity').input_value()=='0.67'
    assert page.evaluate('localStorage.getItem("poly-primary")')=='mosin','loadout persists'
    assert not errors,errors
    print('PASS expansion inventory and loadout; zero errors')
    b.close()
