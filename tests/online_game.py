"""Two real pages, public signaling + real WebRTC + integrated game HUD."""
import os,json
from playwright.sync_api import sync_playwright
BASE=os.environ.get('TEST_URL','http://127.0.0.1:18957/')
with sync_playwright() as p:
 b=p.chromium.launch(channel='msedge',headless=True,args=['--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']);errors=[]
 host=b.new_page(service_workers='block');guest=b.new_page(service_workers='block')
 for page in [host,guest]:
  page.on('pageerror',lambda e:errors.append(str(e)));page.goto(BASE+'?test=1');page.wait_for_function('window.Game');page.locator('#fallback').check();page.locator('#onlineButton').click()
 for page,name in [(host,'Host XTR'),(guest,'Guest XTR')]:page.locator('#username').evaluate('(e,n)=>{e.value=n;e.dispatchEvent(new Event("change"))}',name)
 host.locator('#hostRoom').click();host.wait_for_function("document.querySelector('#netStatus').textContent.includes('waiting')",timeout=40000)
 code=host.locator('#roomCode').inner_text();guest.locator('#roomInput').fill(code);guest.locator('#joinRoom').click()
 for page in [host,guest]:page.wait_for_function('Game.state().online',timeout=40000)
 for page in [host,guest]:page.locator('#resume').click()
 host.wait_for_timeout(500)
 for page in [host,guest]:
  page.keyboard.down('Tab');page.wait_for_timeout(200);assert 'Host XTR' in page.locator('#scoreboard').inner_text() and 'Guest XTR' in page.locator('#scoreboard').inner_text();page.keyboard.up('Tab')
 host.evaluate('Game.test.online.fixture()');host.wait_for_timeout(400)
 assert host.evaluate('Game.state().phase')=='live';assert guest.evaluate('Game.state().phase')=='live'
 host.mouse.click(600,400);host.wait_for_timeout(300)
 assert guest.evaluate('Game.state().hp')<100,('host shot authoritative HP replicated',host.evaluate('Game.state()'),guest.evaluate('Game.state()'))
 host.evaluate('Game.test.online.fixture()');guest.wait_for_timeout(400)
 guest.mouse.click(600,400);guest.wait_for_timeout(350)
 assert host.evaluate('Game.state().hp')<100,('guest shot authoritative HP replicated',host.evaluate('Game.state()'),guest.evaluate('Game.state()'))
 host.evaluate('Game.test.online.fixture()');guest.wait_for_timeout(400)
 guest.keyboard.down('KeyD');guest.wait_for_timeout(350);guest.keyboard.up('KeyD');guest.wait_for_timeout(150)
 assert abs(guest.evaluate('Game.state().x'))>1,'guest movement accepted'
 host.evaluate('Game.test.online.win()');guest.wait_for_timeout(250)
 assert host.locator('#pauseTitle').inner_text()=='VICTORY';assert guest.locator('#pauseTitle').inner_text()=='DEFEAT'
 guest.locator('#toMenu').click();host.wait_for_function('!Game.state().online',timeout=10000)
 assert host.locator('#onlinePanel').is_visible(),'disconnect returns UI with status'
 assert not errors,errors
 print(json.dumps({'PASS':'real WebRTC integrated host/join, bidirectional damage, movement, score, match win/loss and disconnect','errors':errors}))
 b.close()
