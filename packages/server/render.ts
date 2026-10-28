import {chromium,firefox,webkit,type Browser} from 'playwright';
import {existsSync} from 'node:fs';
const launch=(engine:'chromium'|'firefox'|'webkit')=>({chromium,firefox,webkit})[engine].launch({headless:true,...(engine==='chromium'&&!existsSync(chromium.executablePath())&&process.platform==='darwin'&&existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')?{channel:'chrome'}:{})});
import {assertSvg,parseSvg} from '../converter/svg.js';
type Engine='chromium'|'firefox'|'webkit';const browsers=new Map<Engine,Browser>();
// Concurrent renders share one launch per engine; a second parallel launch would orphan a browser process.
const launching=new Map<Engine,Promise<Browser>>();
async function browserFor(engine:Engine){const ready=browsers.get(engine);if(ready)return ready;let p=launching.get(engine);if(!p){p=launch(engine).then(b=>{browsers.set(engine,b);launching.delete(engine);return b;},e=>{launching.delete(engine);throw e;});launching.set(engine,p);}return p;}
export async function renderSvg(svg:string,time=0,engine:Engine='chromium',scale=1){
 assertSvg(svg);if(!Number.isFinite(time)||time<0||time>300)throw Error('Invalid render time');
 const root=parseSvg(svg).documentElement;const box=(root.getAttribute('viewBox')||'0 0 700 700').split(/[\s,]+/).map(Number);const width=Math.ceil(box[2]),height=Math.ceil(box[3]);if(!width||!height||width>4096||height>4096)throw Error('Render size exceeds 4096 pixels');
 if(!['chromium','firefox','webkit'].includes(engine))throw Error('Invalid render engine');const browser=await browserFor(engine);if(!(scale>=.25&&scale<=4))throw Error('Invalid render scale');const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:scale});
 try {await page.route('**/*',route=>route.abort());await page.setContent(`<html><head><style>html,body{margin:0;width:100%;height:100%;background:transparent}body>svg{display:block;width:100%;height:100%}</style></head><body>${svg}</body></html>`,{waitUntil:'load'});
  await page.evaluate(t=>{const svg=document.querySelector('svg')!;svg.pauseAnimations();svg.setCurrentTime(t);for(const a of document.getAnimations()){a.pause();a.currentTime=t*1000;}},time);
  return {png:await page.screenshot({type:'png',omitBackground:engine==='chromium'}),width:Math.round(width*scale),height:Math.round(height*scale),scale,time,renderer:`isolated ${engine}`,browserVersion:browser.version(),transparent:engine==='chromium'};
 }finally{await page.close();}
}
// One page, one load, many seeks: filmstrips and videos of large scenes (8 MB cats) cannot afford a setContent per
// frame. SMIL and CSS animations are paused and moved to each time; `clip` crops in CSS pixels before scaling.
export async function openRenderSession(svg:string,engine:Engine='chromium',scale=1){
 assertSvg(svg);const root=parseSvg(svg).documentElement;const box=(root.getAttribute('viewBox')||'0 0 700 700').split(/[\s,]+/).map(Number);const width=Math.ceil(box[2]),height=Math.ceil(box[3]);if(!width||!height||width>4096||height>4096)throw Error('Render size exceeds 4096 pixels');
 if(!(scale>=.1&&scale<=4))throw Error('Invalid render scale');const browser=await browserFor(engine);const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:scale});
 try{await page.route('**/*',route=>route.abort());await page.setContent(`<html><head><style>html,body{margin:0;width:100%;height:100%;background:transparent}body>svg{display:block;width:100%;height:100%}</style></head><body>${svg}</body></html>`,{waitUntil:'load'});}catch(e){await page.close();throw e;}
 return {width,height,scale,
  async frame(time:number,clip?:{x:number;y:number;width:number;height:number}){if(!Number.isFinite(time)||time<0||time>300)throw Error('Invalid render time');
   await page.evaluate(t=>{const svg=document.querySelector('svg')!;svg.pauseAnimations();svg.setCurrentTime(t);for(const a of document.getAnimations()){a.pause();a.currentTime=t*1000;}},time);
   // Clips are in document units; the page maps the viewBox origin to (0,0).
   const cx=clip?clip.x-box[0]:0,cy=clip?clip.y-box[1]:0;const c=clip?{x:Math.max(0,cx),y:Math.max(0,cy),width:Math.max(1,Math.min(width-Math.max(0,cx),clip.width)),height:Math.max(1,Math.min(height-Math.max(0,cy),clip.height))}:undefined;
   return page.screenshot({type:'png',omitBackground:engine==='chromium',...(c?{clip:c}:{})});},
  close:()=>page.close()};
}
export async function closeRenderer(){for(const p of launching.values())await p.catch(()=>undefined);for(const browser of browsers.values())await browser.close();browsers.clear();}
// Compatibility harness for standard browser embedding; never executes imported scripts or network requests.
export async function renderEmbeddedSvg(svg:string,embedding:'document'|'img',engine:'chromium'|'firefox'|'webkit',time=0){
 assertSvg(svg);const browser=await browserFor(engine);const root=parseSvg(svg).documentElement,box=(root.getAttribute('viewBox')||'0 0 700 700').split(/[\s,]+/).map(Number),width=Math.ceil(box[2]),height=Math.ceil(box[3]);if(!width||!height||width>4096||height>4096)throw Error('Invalid embedded render size');
 const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1});try{await page.route('**/*',route=>route.abort());const uri='data:image/svg+xml;base64,'+Buffer.from(svg).toString('base64');if(embedding==='document'){await page.goto(uri);await page.evaluate(t=>{const root=document.documentElement as unknown as SVGSVGElement;root.style.width='100%';root.style.height='100%';root.pauseAnimations();root.setCurrentTime(t);},time);}else{await page.setContent(`<html><body style="margin:0"><img width="${width}" height="${height}" src="${uri}"></body></html>`);await page.evaluate(async()=>{await document.querySelector('img')!.decode();await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));});}return{png:await page.screenshot({type:'png'}),engine,embedding,browserVersion:browser.version(),width,height};}finally{await page.close();}
}

/** Measured browser scheduling for a running standalone animation, not an estimated FPS cost model. */
export async function probePlayback(svg:string,options:{frames?:number;embedding?:'inline'|'img'}={}){
 assertSvg(svg);const frames=options.frames??120;if(!Number.isInteger(frames)||frames<30||frames>600)throw Error('Probe frames must be 30–600');
 const root=parseSvg(svg).documentElement,vb=(root.getAttribute('viewBox')??'0 0 700 700').split(/[\s,]+/).map(Number);
 const width=Math.ceil(vb[2]),height=Math.ceil(vb[3]);if(!(width>0&&height>0&&width<=2048&&height<=2048))throw Error('Probe viewport must be within 2048×2048');
 const browser=await browserFor('chromium'),page=await browser.newPage({viewport:{width,height}});
 const collect=async(count:number)=>page.evaluate<number[]>(`new Promise((resolve,reject)=>{
  const out=[];let last;const timer=setTimeout(()=>reject(Error('requestAnimationFrame probe timed out')),45000);
  function tick(now){if(last!==undefined)out.push(now-last);last=now;if(out.length>=${count}){clearTimeout(timer);resolve(out);}else requestAnimationFrame(tick);}requestAnimationFrame(tick);
 })`);
 try{
  await page.route('**/*',r=>r.abort());await page.setContent('<html><body style="margin:0"></body></html>');const baseline=await collect(30);
  const embedding=options.embedding??'inline',content=embedding==='inline'?svg:`<img src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}" width="${width}" height="${height}">`;
  await page.setContent(`<html><head><style>body{margin:0}body>svg{display:block;width:${width}px;height:${height}px}</style></head><body>${content}</body></html>`);
  if(embedding==='img')await page.evaluate(async()=>{await document.querySelector('img')!.decode();});await collect(20);const intervals=await collect(frames);
  const percentile=(values:number[],p:number)=>[...values].sort((a,b)=>a-b)[Math.min(values.length-1,Math.floor(p*(values.length-1)))];
  const budget=percentile(baseline,.5),droppedFrames=intervals.reduce((sum,x)=>sum+Math.max(0,Math.round(x/budget)-1),0);
  return {embedding,renderer:'headless chromium',browserVersion:browser.version(),viewport:{width,height},frames,intervalsMs:intervals,baselineMedianMs:budget,medianMs:percentile(intervals,.5),p90Ms:percentile(intervals,.9),p99Ms:percentile(intervals,.99),droppedFrames,estimatedMissedFraction:droppedFrames/(frames+droppedFrames),note:'Measured rAF scheduling on this host, not GPU paint timing, a user-device guarantee or aesthetic approval.'};
 }finally{await page.close();}
}
