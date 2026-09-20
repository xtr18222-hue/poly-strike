# Real two-browser PeerJS verification against the public cloud.
import os, json
from playwright.sync_api import sync_playwright
BASE=os.environ.get('TEST_URL','http://127.0.0.1:18957/')
with sync_playwright() as p:
    browser=p.chromium.launch(channel='msedge', headless=True)
    ctx=browser.new_context(viewport={'width':1280,'height':800}, service_workers='block')
    errors=[]
    host=ctx.new_page(); guest=ctx.new_page()
    for pg in (host,guest):
        pg.on('pageerror', lambda e: errors.append('pageerror: '+str(e)))
        pg.goto(BASE+'?net=1')
    host.wait_for_function('!!window.PolyNet', timeout=10000)
    guest.wait_for_function('!!window.PolyNet', timeout=10000)
    probe=host.evaluate("""new Promise(res=>{const Orig=window.Peer;let allocs=0;window.Peer=function(...a){allocs++;return new Orig(...a);};
      const n=PolyNet.create({onStatus:()=>{},onClose:()=>{}});
      window.Peer=undefined;
      const r=n.host('desert');
      setTimeout(()=>{window.Peer=Orig;res(r);},2500);})""")
    assert probe==0, 'host() must not touch network when PeerJS is missing, returned: '+str(probe)
    host.evaluate("""(()=>{window.__out=PolyNet.create({onStatus:()=>{},onReady:r=>{window.__hready=r;},onData:d=>(window.__in=window.__in||[]).push(d),onClose:r=>{window.__closed=r;}});window.__opened=__out.host('desert');})()""")
    assert host.evaluate('window.__opened') is True, 'host() returned false'
    host.wait_for_function("window.__out.code && window.__out.code.startsWith('ps2-') && window.__out.role==='host'", timeout=15000)
    code=host.evaluate('window.__out.code')
    guest.evaluate(f"(()=>{{window.__gnet=PolyNet.create({{onStatus:()=>{{}},onReady:r=>{{window.__ready=r;}},onData:d=>{{(window.__data=window.__data||[]).push(d);}}}});window.__opened=__gnet.join({json.dumps(code)});}})()")
    assert guest.evaluate('window.__opened') is True
    host.wait_for_function('window.__out.connected===true', timeout=20000)
    guest.wait_for_function('window.__gnet.connected===true', timeout=20000)
    assert host.evaluate('window.__out.role')=='host' and guest.evaluate('window.__gnet.role')=='guest'
    assert guest.evaluate('window.__ready && window.__ready.mapId')=='desert', guest.evaluate('JSON.stringify(window.__ready||null)')
    guest.evaluate("__gnet.send({type:'input',state:{x:2.5,y:1.7,z:-3,yaw:1.2,pitch:0}})")
    host.wait_for_function("window.__in && window.__in.length", timeout=10000)
    got=host.evaluate("JSON.stringify(window.__in)")
    assert '"state"' in got and json.loads(got)[0]['state']['x']==2.5, got
    host.evaluate("__out.send({type:'shot',weapon:'l96',origin:{x:0,y:1.7,z:34},dir:{x:0,y:0,z:-1},seq:1})")
    guest.wait_for_function("window.__data && window.__data.some(d=>d.type==='shot')", timeout=10000)
    shot=guest.evaluate("JSON.stringify(window.__data.find(d=>d.type==='shot'))")
    assert json.loads(shot)['weapon']=='l96', shot
    guest.evaluate("__gnet.close()")
    host.wait_for_function("window.__out.connected===false", timeout=10000)
    closed=host.evaluate("window.__closed||''")
    assert closed, 'host expected onClose after guest left'
    assert not errors, errors
    print(json.dumps({'ok':True,'code':code,'inputRoundtrip':json.loads(got),'shot':json.loads(shot),'hostOnClose':closed,'pageErrors':errors}, indent=2))
    browser.close()
