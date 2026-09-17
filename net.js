/* PolyNet: PeerJS 1.5.5 public cloud. No Peer/network until explicit host/join.
 * Codes are capabilities, not authentication; share only with your opponent.
 * onStatus(string), onClose(reason string), onReady({role,mapId,code}).
 */
(function(root){'use strict';
 const MAP=/^[a-z0-9][a-z0-9_-]{0,31}$/,ROOM=/^ps2-[a-z0-9]{8}$/;
 function randomCode(){const bytes=new Uint8Array(8);root.crypto.getRandomValues(bytes);return 'ps2-'+Array.from(bytes,b=>'abcdefghijklmnopqrstuvwxyz234567'[b%32]).join('');}
 // Reject rather than silently coerce: no prototypes, accessors, binary, cycles or nonfinite numbers.
 function sanitize(value){
  let nodes=0,chars=0;const seen=new Set();
  function copy(v,depth){if(++nodes>1800||depth>9)throw Error();if(v===null||typeof v==='boolean')return v;if(typeof v==='number'){if(!Number.isFinite(v)||Math.abs(v)>1e12)throw Error();return v;}if(typeof v==='string'){chars+=v.length;if(v.length>4096||chars>12000)throw Error();return v;}if(typeof v!=='object'||seen.has(v))throw Error();seen.add(v);let out;
   if(Array.isArray(v)){if(v.length>256)throw Error();out=v.map(x=>copy(x,depth+1));}
   else {if(Object.prototype.toString.call(v)!=='[object Object]')throw Error();const keys=Object.keys(v);if(keys.length>64)throw Error();out={};for(const k of keys){if(k.length>48||['__proto__','prototype','constructor'].includes(k))throw Error();const desc=Object.getOwnPropertyDescriptor(v,k);if(!desc||!('value'in desc))throw Error();out[k]=copy(desc.value,depth+1);}}
   seen.delete(v);return out;
  }
  try{const out=copy(value,0);if(JSON.stringify(out).length>16384)return null;return out;}catch(_){return null;}
 }
 function packet(value){const p=sanitize(value);return p&&['input','shot','reload','snapshot'].includes(p.type)?p:null;}
 function create(callbacks={}){
  let role=null,code='',mapId='',connected=false,peer=null,conn=null,active=false,generation=0,stage='';
  const timers=new Set();let signalTimer,handshakeTimer,idleTimer,rateAt=0,rateCount=0;
  function touch(){cancel(idleTimer);idleTimer=later(()=>close('Opponent stopped responding. Reconnect to continue.'),30000);}
  function heartbeat(){if(!connected)return;raw({ps:2,kind:'ping'});later(heartbeat,5000);}
  function later(fn,ms){const t=setTimeout(()=>{timers.delete(t);fn();},ms);timers.add(t);return t;}
  function cancel(t){clearTimeout(t);timers.delete(t);}
  const emit=(key,value)=>{if(typeof callbacks[key]==='function')callbacks[key](value);};
  const status=s=>emit('onStatus',s);
  function close(reason='Disconnected.'){if(!active)return;active=false;connected=false;generation++;for(const t of timers)clearTimeout(t);timers.clear();const c=conn,p=peer;conn=null;peer=null;role=null;code='';try{if(c)c.close();}catch(_){}try{if(p)p.destroy();}catch(_){}status(reason);emit('onClose',reason);}
  function raw(msg){try{if(!conn||!conn.open)return false;conn.send(msg);return true;}catch(_){close('Connection interrupted. Please create a new room.');return false;}}
  function ready(){cancel(handshakeTimer);connected=true;stage='ready';touch();later(heartbeat,5000);status('Opponent connected.');emit('onReady',{role,mapId,code});}
  function bind(c,g){
   if(conn){c.on('error',()=>{});c.on('open',()=>c.close());if(c.open)c.close();return;}
   conn=c;handshakeTimer=later(()=>{if(g===generation&&!connected)close('Direct connection timed out. Room may be full or your network may block WebRTC.');},20000);stage=role==='host'?'hello':'accept';
   c.on('open',()=>{if(g!==generation)return;if(role==='guest')raw({ps:2,kind:'hello'});else status('Opponent connecting…');});
   c.on('data',value=>{if(g!==generation||!active)return;const now=Date.now();if(now-rateAt>1000){rateAt=now;rateCount=0;}if(++rateCount>240){close('Opponent sent too many packets.');return;}const d=sanitize(value);if(!d||d.ps!==2){close('Invalid packet from opponent.');return;}
    if(connected){touch();if(d.kind==='ping'){raw({ps:2,kind:'pong'});return;}if(d.kind==='pong')return;if(d.kind==='data'){const p=packet(d.payload);if(!p){close('Invalid game packet from opponent.');return;}emit('onData',p);return;}}
    if(role==='host'&&stage==='hello'&&d.kind==='hello'){stage='ack';raw({ps:2,kind:'accept',mapId,code});}
    else if(role==='guest'&&stage==='accept'&&d.kind==='accept'&&typeof d.mapId==='string'&&MAP.test(d.mapId)&&d.code===code){mapId=d.mapId;if(raw({ps:2,kind:'ack'}))ready();}
    else if(role==='host'&&stage==='ack'&&d.kind==='ack')ready();
   });
   c.on('close',()=>{if(g===generation)close('Opponent disconnected. Create or join a new room.');});
   c.on('error',()=>{if(g===generation)close('Direct connection failed. Try another network.');});
  }
  function start(r,c,m){
   close();if(typeof root.Peer!=='function'){status('PeerJS could not load. Reload this page.');return false;}
   role=r;code=c;mapId=m;active=true;rateAt=Date.now();rateCount=0;const g=++generation;status('Connecting to public signaling…');
   try{peer=new root.Peer(r==='host'?code:randomCode(),{debug:0,secure:true});
    signalTimer=later(()=>{if(g===generation)close('Public signaling timed out. Check your network and try again.');},15000);
    peer.on('open',()=>{if(g!==generation)return;cancel(signalTimer);if(role==='host')status('Room '+code+' — waiting for opponent.');else bind(peer.connect(code,{reliable:true,serialization:'json'}),g);});
    peer.on('connection',c=>{if(g!==generation||role!=='host'){c.on('error',()=>{});c.on('open',()=>c.close());return;}bind(c,g);});
    peer.on('error',e=>{if(g!==generation)return;const errors={'unavailable-id':'Room code already in use. Create another room.','peer-unavailable':'Room not found. Check the code and ask the host to keep the room open.','network':'Public signaling is unreachable. Check your network.','server-error':'Public signaling is unavailable. Try again later.','browser-incompatible':'This browser does not support WebRTC. Use current Edge, Chrome or Firefox.','webrtc':'Direct connection failed. Your network may block WebRTC.'};close(errors[e&&e.type]||'Unable to connect. Check the room code and your network.');});
    peer.on('disconnected',()=>{if(g===generation)close('Signaling disconnected. Please create a new room.');});
    return true;
   }catch(_){close('WebRTC could not start in this browser.');return false;}
  }
  return {host(m){if(typeof m!=='string'||!MAP.test(m)){status('Invalid map.');return false;}return start('host',randomCode(),m);},join(value){if(typeof value!=='string'){status('Enter the 8-character room code.');return false;}let c=value.trim().toLowerCase();if(/^[a-z0-9]{8}$/.test(c))c='ps2-'+c;if(!ROOM.test(c)){status('Enter the 8-character room code.');return false;}return start('guest',c,'');},send(value){if(!connected)return false;const p=packet(value);return p?raw({ps:2,kind:'data',payload:p}):false;},close,get role(){return role;},get code(){return code;},get connected(){return connected;}};
 }
 root.PolyNet={create};
})(typeof window!=='undefined'?window:globalThis);
