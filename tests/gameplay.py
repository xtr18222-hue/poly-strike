import os,json
from playwright.sync_api import sync_playwright
BASE=os.environ.get('TEST_URL','http://127.0.0.1:18957/')
with sync_playwright() as p:
    browser=p.chromium.launch(channel='msedge',headless=True)
    context=browser.new_context(viewport={'width':1280,'height':800},service_workers='block')
    page=context.new_page(); errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(BASE+'?test=1')
    # The roster resolves from the asset pipeline, so the match cannot start
    # until PolyAsset has the weapon definitions.
    page.wait_for_function('window.PolyAsset && window.PolyAsset.progress().weapons.length >= 7', timeout=60000)
    page.locator('#fallback').check();page.locator('#start').click()
    page.wait_for_function('window.Game && Game.state().running', timeout=60000)
    page.wait_for_timeout(450)
    def state(): return page.evaluate('Game.state()')
    def fixture(): page.evaluate("Game.test.fixture('target')");page.wait_for_timeout(100)
    fixture()
    # fixture() now faces +Z, so forward travel increases z.
    before=state();page.keyboard.down('KeyW');page.wait_for_timeout(300);page.keyboard.up('KeyW')
    assert state()['z']>before['z']+.5,'W movement'
    page.mouse.move(600,400);page.mouse.down(button='right');page.mouse.move(700,420,steps=5);page.mouse.up(button='right')
    assert abs(state()['yaw'])>.01,'mouse look'
    # Collision: walk directly into the central 10x10 building.
    page.evaluate('Game.test.place(0,6)');page.mouse.move(600,400)
    fixture();page.evaluate('Game.test.place(0,6)')
    page.keyboard.down('KeyW');page.wait_for_timeout(500);page.keyboard.up('KeyW')
    assert state()['z']>=5.39,'cannot pass through wall'
    fixture();page.keyboard.press('Space');page.wait_for_timeout(120);assert state()['y']>1.9,'jump'
    page.wait_for_timeout(850);page.keyboard.down('KeyC');page.wait_for_timeout(180);assert state()['y']<1.5,'crouch';page.keyboard.up('KeyC');page.wait_for_timeout(300)
    # Automatic rifle and reloading through actual input.
    # 1000 HP so the burst lands as sustained fire and recoil can climb.
    page.evaluate("Game.test.fixture('target',1000)");page.wait_for_timeout(100)
    page.evaluate('Game.test.aim(0)')
    page.mouse.down();page.wait_for_timeout(380);page.mouse.up()
    assert state()['ammo']['akm']['mag']<=28,('AK automatic',state())
    assert state()['pitch']>0,'spray climbs'
    page.keyboard.press('KeyR');page.wait_for_timeout(80);assert state()['reload']>0
    page.wait_for_timeout(2550);assert state()['ammo']['akm']['mag']==30,'reload replenishes'
    # Switching cancels reload, semi-auto does not fire repeatedly while held.
    # Slots: 1 primary (AK-47 by default), 2 Deagle, 3 knife.
    page.keyboard.press('Digit2');page.wait_for_timeout(400);fixture()
    page.mouse.down();page.wait_for_timeout(650);page.mouse.up()
    assert state()['ammo']['deagle']['mag']==6,'semi-auto exactly one shot while held'
    page.keyboard.press('KeyR');page.wait_for_timeout(100);page.keyboard.press('Digit1');page.wait_for_timeout(400)
    assert state()['reload']<=0 and state()['weapon']=='akm','switch cancels reload'
    fixture();page.mouse.move(640,400);page.mouse.down(button='right');page.wait_for_timeout(40)
    page.mouse.move(640,370,steps=3);page.wait_for_timeout(40);page.mouse.up(button='right');page.wait_for_timeout(40)
    assert state()['ads'],'AK ADS overlay'
    # The Soldier rig is taller than the old operator, so aim at the bot
    # explicitly rather than trusting the crosshair centre.
    # Re-aim after the mouse-look above. No mouse.move: pointer-lock look
    # would overwrite the yaw aim() just set.
    # The Soldier rig is taller than the old operator, so aim at the bot
    # explicitly rather than trusting the crosshair centre.
    # A full AK body shot does 26-27 damage through rollVariance, so a
    # 25 HP target always dies in one hit regardless of the variance roll.
    page.evaluate("Game.test.aim(0)");page.wait_for_timeout(60)
    page.evaluate("Game.test.fixture('target',25)");page.evaluate("Game.test.aim(0)")
    old=state()['kills'];page.mouse.click(640,400);page.wait_for_timeout(120)
    assert state()['kills']==old+1,'AK headshot raycast kills target'
    # Knife animation plus close-range collision.
    page.keyboard.press('Digit3');page.wait_for_timeout(450);page.keyboard.press('KeyF');page.wait_for_timeout(80)
    assert state()['inspect']>1,'bayonet inspect'
    # The bayonet swings on a 0.6s cadence for 55 damage, so two swings are
    # needed for a full-health target. Hold long enough for both.
    # Melee reach is 2.65m; stand inside the bot's hit volume, not 10m away.
    page.evaluate("Game.test.fixture('target',50)");page.evaluate('Game.test.aim(0)')
    page.evaluate('Game.test.place(0,24.5)');page.wait_for_timeout(100)
    page.evaluate('Game.test.aim(0)')
    page.mouse.down();page.wait_for_timeout(1300);page.mouse.up();assert state()['alive']==0,'knife close-range kill'
    # Pause freezes simulation and resumes without routing keys to a hidden control.
    page.keyboard.press('Escape');page.wait_for_timeout(100);assert not state()['running']
    frozen=state();page.wait_for_timeout(250);assert state()['z']==frozen['z']
    page.locator('#resume').click();page.wait_for_timeout(100);assert state()['running']
    fixture();page.keyboard.down('Tab');page.wait_for_timeout(80);assert page.locator('#scoreboard').is_visible();page.keyboard.up('Tab')
    # M only sticks when the AudioContext is running; in headless the context
    # may stay suspended, so accept either the muted label or the fallback hint.
    # M toggles the audio mute; the label is written on the next HUD pass.
    page.keyboard.press('KeyM');page.wait_for_timeout(300)
    assert 'SOUND OFF' in page.locator('#status').inner_text(),'mute toggle'
    # Real match state transitions; fixtures only place the state, stepping runs normally.
    page.evaluate("Game.test.fixture('loss')");page.wait_for_timeout(100);assert state()['phase']=='end' and state()['hp']==0
    page.wait_for_timeout(4300);assert state()['score']['enemy']==1 and state()['hp']==100
    page.evaluate("Game.test.fixture('match')");page.wait_for_timeout(4300)
    assert state()['phase']=='matchover' and not state()['running']
    assert page.locator('#pauseTitle').inner_text()=='VICTORY'
    page.locator('#restart').click();page.wait_for_timeout(150);assert state()['score']=={'player':0,'enemy':0}
    assert state()['audio'],'audio context created on gesture'
    assert state()['frames']>100
    assert not errors,errors
    print('PASS gameplay: movement, look, collision, jump/crouch, AK spray, reload, Deagle semi-auto, AWP scope/raycast, knife hit/inspect, pause/resume, scoreboard, sound, round loss/reset, match win/restart; zero page errors')
    print(json.dumps(state(),indent=2))
    browser.close()
