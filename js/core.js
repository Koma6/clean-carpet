/* 无所事事 · 完整版
   core.js —— 公共工具：材质、噪声、光照、后期。
   全部程序化生成，不依赖任何外部图片或音频文件。 */
window.WS = window.WS || {};
(function(WS){
'use strict';

var W=1280, H=760, TAU=Math.PI*2;
WS.W=W; WS.H=H; WS.TAU=TAU;
WS.Scenes=[];
WS.register=function(def){ WS.Scenes.push(def); };

WS.clamp=function(v,a,b){ return v<a?a:(v>b?b:v); };
WS.lerp=function(a,b,t){ return a+(b-a)*t; };
WS.smooth=function(t){ return t*t*(3-2*t); };
WS.pick=function(arr){ return arr[(Math.random()*arr.length)|0]; };
WS.seeded=function(a){
  return function(){
    a|=0; a=a+0x6D2B79F5|0;
    var t=Math.imul(a^a>>>15,1|a);
    t=t+Math.imul(t^t>>>7,61|t)^t;
    return ((t^t>>>14)>>>0)/4294967296;
  };
};
WS.offscreen=function(w,h){
  var c=document.createElement('canvas'); c.width=w; c.height=h; return c;
};
WS.rr=function(g,x,y,w,h,r){
  r=Math.min(r,w/2,h/2); g.beginPath();
  g.moveTo(x+r,y); g.arcTo(x+w,y,x+w,y+h,r);
  g.arcTo(x+w,y+h,x,y+h,r); g.arcTo(x,y+h,x,y,r);
  g.arcTo(x,y,x+w,y,r); g.closePath();
};
WS.diamond=function(g,cx,cy,rx,ry,fill,stroke,lw){
  g.beginPath(); g.moveTo(cx,cy-ry); g.lineTo(cx+rx,cy);
  g.lineTo(cx,cy+ry); g.lineTo(cx-rx,cy); g.closePath();
  if(fill){ g.fillStyle=fill; g.fill(); }
  if(stroke){ g.strokeStyle=stroke; g.lineWidth=lw||2; g.stroke(); }
};

/* ---------- 低频噪声：用来做布料明暗不均、木纹、雾的不均匀 ---------- */
WS.makeNoise=function(seed){
  var rnd=WS.seeded(seed), perm=new Array(256), p=new Uint8Array(512), i;
  for(i=0;i<256;i++) perm[i]=i;
  for(i=255;i>0;i--){ var j=(rnd()*(i+1))|0, tmp=perm[i]; perm[i]=perm[j]; perm[j]=tmp; }
  for(i=0;i<512;i++) p[i]=perm[i&255];
  function fade(t){ return t*t*t*(t*(t*6-15)+10); }
  function val(ix,iy){ return p[(p[ix&255]+(iy&255))&255]/255; }
  function n2(x,y){
    var xi=Math.floor(x), yi=Math.floor(y), xf=x-xi, yf=y-yi;
    var u=fade(xf), v=fade(yf);
    var a=val(xi,yi), b=val(xi+1,yi), c=val(xi,yi+1), d=val(xi+1,yi+1);
    return WS.lerp(WS.lerp(a,b,u), WS.lerp(c,d,u), v);
  }
  function fbm(x,y,oct){
    var s=0,amp=.5,f=1; oct=oct||4;
    for(var k=0;k<oct;k++){ s+=amp*n2(x*f,y*f); f*=2; amp*=.5; }
    return s;
  }
  return {n2:n2,fbm:fbm};
};

/* 一张低频灰度图，调用方以 overlay 混合叠到材质上，立刻有"实物"感 */
WS.mottle=function(w,h,seed,scale){
  var sw=Math.max(48,Math.round(w/4)), sh=Math.max(48,Math.round(h/4));
  var small=WS.offscreen(sw,sh), sg=small.getContext('2d');
  var im=sg.createImageData(sw,sh), d=im.data, n=WS.makeNoise(seed), sc=scale||22;
  for(var y=0;y<sh;y++) for(var x=0;x<sw;x++){
    var v=n.fbm(x/sc,y/sc,4), c=Math.round(128+(v-.5)*190), i=(y*sw+x)*4;
    d[i]=d[i+1]=d[i+2]=c; d[i+3]=255;
  }
  sg.putImageData(im,0,0);
  var out=WS.offscreen(w,h), g=out.getContext('2d');
  g.imageSmoothingEnabled=true;
  g.drawImage(small,0,0,w,h);
  return out;
};

/* 胶片颗粒：小图平铺，每帧轻微错位 */
WS.grain=function(size,seed,contrast){
  size=size||192;
  var c=WS.offscreen(size,size), g=c.getContext('2d');
  var im=g.createImageData(size,size), d=im.data, rnd=WS.seeded(seed||3);
  for(var i=0;i<d.length;i+=4){
    var v=Math.round(128+(rnd()-.5)*(contrast||.5)*255);
    d[i]=d[i+1]=d[i+2]=v; d[i+3]=255;
  }
  g.putImageData(im,0,0); return c;
};

/* 织物纤维：几万根极短的笔触，是地毯"像真的"的关键 */
WS.fibers=function(g,w,h,seed,count,colors){
  var rnd=WS.seeded(seed);
  g.save(); g.lineWidth=1; g.lineCap='round';
  for(var i=0;i<count;i++){
    var x=rnd()*w, y=rnd()*h, a=rnd()*TAU, len=.7+rnd()*3.2;
    g.strokeStyle=colors[(rnd()*colors.length)|0];
    g.beginPath(); g.moveTo(x,y);
    g.lineTo(x+Math.cos(a)*len, y+Math.sin(a)*len); g.stroke();
  }
  g.restore();
};

/* 木纹：顺纹的弯曲细线 */
WS.wood=function(g,x,y,w,h,seed,vertical){
  var rnd=WS.seeded(seed);
  g.save(); g.beginPath(); g.rect(x,y,w,h); g.clip();
  for(var i=0;i<300;i++){
    var t=rnd(), px=vertical?x+t*w:x, py=vertical?y:y+t*h;
    g.strokeStyle=rnd()>.5?'rgba(52,38,26,.085)':'rgba(255,238,208,.075)';
    g.lineWidth=.5+rnd()*1.9;
    g.beginPath();
    if(vertical){
      g.moveTo(px,py);
      g.bezierCurveTo(px+Math.sin(t*9)*3,py+h*.33, px-Math.sin(t*7)*4,py+h*.66, px+Math.sin(t*11)*2,py+h);
    }else{
      g.moveTo(px,py);
      g.bezierCurveTo(px+w*.33,py+Math.sin(t*9)*3, px+w*.66,py-Math.sin(t*7)*4, px+w,py+Math.sin(t*11)*2);
    }
    g.stroke();
  }
  g.restore();
};

/* 径向擦除（destination-out），所有"擦掉一层"的场景共用 */
WS.erase=function(ctx,x,y,r,strength,inner){
  ctx.save(); ctx.globalCompositeOperation='destination-out';
  var gr=ctx.createRadialGradient(x,y,r*.1,x,y,r);
  gr.addColorStop(0,'rgba(0,0,0,'+strength+')');
  gr.addColorStop(inner||.55,'rgba(0,0,0,'+(strength*.62)+')');
  gr.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=gr; ctx.beginPath(); ctx.arc(x,y,r,0,TAU); ctx.fill();
  ctx.restore();
};

/* 柔光圆 */
WS.glow=function(g,x,y,r,color,alpha){
  var gr=g.createRadialGradient(x,y,0,x,y,r);
  gr.addColorStop(0,'rgba('+color+','+alpha+')');
  gr.addColorStop(1,'rgba('+color+',0)');
  g.fillStyle=gr; g.beginPath(); g.arc(x,y,r,0,TAU); g.fill();
};

/* 统一后期：暗角 + 颗粒。让每个场景像从同一台机器里看出来 */
WS.finish=function(g,t,grainCanvas){
  var vg=g.createRadialGradient(W*.5,H*.45,H*.22,W*.5,H*.45,H*.95);
  vg.addColorStop(0,'rgba(24,28,24,0)');
  vg.addColorStop(.72,'rgba(24,28,24,.035)');
  vg.addColorStop(1,'rgba(24,28,24,.17)');
  g.fillStyle=vg; g.fillRect(0,0,W,H);
  if(grainCanvas){
    g.save();
    g.globalCompositeOperation='overlay'; g.globalAlpha=.05;
    var s=grainCanvas.width, ox=(t*23)%s, oy=(t*41)%s;
    for(var x=-s;x<W;x+=s) for(var y=-s;y<H;y+=s) g.drawImage(grainCanvas,x-ox,y-oy);
    g.restore();
  }
};

})(window.WS);
