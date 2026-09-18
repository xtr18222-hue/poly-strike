/* Deterministic C2-eased inspection paths. Radians and metres. */
(function(root,f){if(typeof module==='object'&&module.exports)module.exports=f();else root.PolyInspection=f();})(globalThis,()=>{
 const durations={ak47:3.0,deagle:2.7,awp:3.2,kar98:3.4,knife:1.5};
 const smooth=t=>t*t*t*(10+t*(-15+6*t));
 function pose(key,t,variant=0){t=Math.max(0,Math.min(1,t));const e=smooth(t),w=Math.sin(Math.PI*e),b=w*w,p={dx:0,dy:0,dz:0,rx:0,ry:0,rz:0,handleA:0,handleB:0,blade:0,magX:0,magY:0,magZ:0,magR:0};
 if(key==='awp'||key==='kar98'){p.dx=-.12*b;p.dy=.13*b*Math.cos(Math.PI*e);p.rx=-.25*b*Math.cos(Math.PI*e);p.ry=.42*b;p.rz=-.12*b;const lift=t<.25?smooth(t/.25):t>.75?smooth((1-t)/.25):1;p.magY=-.18*lift;p.magX=-.10*b;p.magZ=.12*b;p.magR=.75*b;}
 else if(key==='knife'){const sign=variant===0?1:-1;p.dx=-.07*b;p.dy=.055*b;p.rz=sign*2*Math.PI*e;p.handleA=sign*Math.PI*2*b;p.handleB=-sign*Math.PI*2*b;p.blade=sign*.35*b;}
 else if(key==='ak47'||key==='deagle'){const isAK=key==='ak47';const lift=t<.25?smooth(t/.25):t>.75?smooth((1-t)/.25):1;
 p.dx=-.09*b;p.dy=(isAK?.17:.15)*b;p.dz=(isAK?-.05:-.03)*b;p.rx=(isAK?.14:.16)*b;p.ry=-.30*b;
 p.rz=(isAK?1:-1)*Math.PI*2*e;
 if(isAK){p.magY=-.13*lift;p.magX=-.08*b;p.magZ=.10*b;p.magR=.6*b;}}
 return p;
 }
 return {durations,pose};
});
