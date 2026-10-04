import {chromium,firefox,webkit,type Browser} from 'playwright';
import {existsSync} from 'node:fs';
const launch=(engine:'chromium'|'firefox'|'webkit')=>({chromium,firefox,webkit})[engine].launch({headless:true,...(engine==='chromium'&&!existsSync(chromium.executablePath())&&process.platform==='darwin'&&existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')?{channel:'chrome'}:{})});
import {assertSvg,parseSvg} from '../converter/svg.js';
type Engine='chromium'|'firefox'|'webkit';const browsers=new Map<Engine,Browser>();
export async function renderSvg(svg:string,time=0,engine:Engine='chromium'){
 assertSvg(svg);if(!Number.isFinite(time)||time<0||time>300)throw Error('Invalid render time');
 const root=parseSvg(svg).documentElement;const box=(root.getAttribute('viewBox')||'0 0 700 700').split(/[\s,]+/).map(Number);const width=Math.ceil(box[2]),height=Math.ceil(box[3]);if(!width||!height||width>4096||height>4096)throw Error('Render size exceeds 4096 pixels');
 if(!['chromium','firefox','webkit'].includes(engine))throw Error('Invalid render engine');let browser=browsers.get(engine);if(!browser){browser=await launch(engine);browsers.set(engine,browser);}const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1});
 try {await page.route('**/*',route=>route.abort());await page.setContent(`<html><head><style>html,body{margin:0;width:100%;height:100%;background:transparent}body>svg{display:block;width:100%;height:100%}</style></head><body>${svg}</body></html>`,{waitUntil:'load'});
  await page.evaluate(t=>{const svg=document.querySelector('svg')!;svg.pauseAnimations();svg.setCurrentTime(t);for(const a of document.getAnimations()){a.pause();a.currentTime=t*1000;}},time);
  return {png:await page.screenshot({type:'png',omitBackground:engine==='chromium'}),width,height,time,renderer:`isolated ${engine}`,browserVersion:browser.version(),transparent:engine==='chromium'};
 }finally{await page.close();}
}
export async function closeRenderer(){for(const browser of browsers.values())await browser.close();browsers.clear();}
// Compatibility harness for standard browser embedding; never executes imported scripts or network requests.
export async function renderEmbeddedSvg(svg:string,embedding:'document'|'img',engine:'chromium'|'firefox'|'webkit',time=0){
 assertSvg(svg);let browser=browsers.get(engine);if(!browser){browser=await launch(engine);browsers.set(engine,browser);}const root=parseSvg(svg).documentElement,box=(root.getAttribute('viewBox')||'0 0 700 700').split(/[\s,]+/).map(Number),width=Math.ceil(box[2]),height=Math.ceil(box[3]);if(!width||!height||width>4096||height>4096)throw Error('Invalid embedded render size');
 const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1});try{await page.route('**/*',route=>route.abort());const uri='data:image/svg+xml;base64,'+Buffer.from(svg).toString('base64');if(embedding==='document'){await page.goto(uri);await page.evaluate(t=>{const root=document.documentElement as unknown as SVGSVGElement;root.style.width='100%';root.style.height='100%';root.pauseAnimations();root.setCurrentTime(t);},time);}else{await page.setContent(`<html><body style="margin:0"><img width="${width}" height="${height}" src="${uri}"></body></html>`);await page.evaluate(async()=>{await document.querySelector('img')!.decode();await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));});}return{png:await page.screenshot({type:'png'}),engine,embedding,browserVersion:browser.version(),width,height};}finally{await page.close();}
}
