import os,json,io
from playwright.sync_api import sync_playwright
from PIL import Image
BASE=os.environ.get('TEST_URL','http://127.0.0.1:18957/')
with sync_playwright() as p:
 b=p.chromium.launch(channel='msedge',headless=True)
 page=b.new_page(viewport={'width':1280,'height':800});errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.on('console',lambda m:errors.append(m.text) if m.type=='error' else None)
 page.goto(BASE);page.locator('#fallback').check();page.locator('#start').click();page.wait_for_timeout(500)
 f=page.evaluate('Game.state().frames');page.wait_for_timeout(10000);s=page.evaluate('Game.state()')
 assert s['frames']-f>200, 'render loop below 20 FPS on this machine'
 # Check the actual framebuffer capture is populated and chromatically varied.
 im=Image.open(io.BytesIO(page.locator('#game').screenshot())).convert('RGB')
 colors=im.resize((160,100)).getcolors(16000)
 assert colors and len(colors)>150,'scene rendered as blank/flat image'
 assert s['phase'] in ['live','end'],'natural preparation->live transition'
 # Let actual navigation and LOS attacks reach the unassisted player.
 page.wait_for_function('Game.state().hp < 100',timeout=50000)
 assert not errors,errors
 print('PASS render/pixels/AI: '+json.dumps({'measuredFPS':round((s['frames']-f)/10,1),'colors':len(colors),'hpAfterBotAttack':page.evaluate('Game.state().hp'),'errors':errors}))
 b.close()
