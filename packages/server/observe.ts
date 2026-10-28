// Observation artifacts so an agent can judge MOTION, not single frames (plan F0/F1): a filmstrip contact sheet
// with time labels and optional onion skin, rendered from one page load. Multimodal models read images; one sheet
// conveys the whole animation within the MCP image budget.
import sharp,{type OverlayOptions} from 'sharp';
import {VectorDocument} from '../core/document.js';
import {exportSvg} from '../core/export.js';
import {renderSvg,openRenderSession} from './render.js';

export type Box={x:number;y:number;width:number;height:number};
export type FrameSource='export'|'engine';

/** Render several times of a document. `export` loads the standalone SMIL export once and seeks (fast, and it is
 * what ships); `engine` renders MAI's own frame per time (exact for editable-only features). `auto` = export with
 * engine fallback, reporting why. */
export async function renderTimes(m:VectorDocument,times:number[],opts:{region?:Box;scale:number;source?:'auto'|FrameSource}):Promise<{source:FrameSource;reason?:string;frames:Buffer[]}>{
 const source=opts.source??'auto';let reason:string|undefined;
 if(source!=='engine'){
  try{const svg=exportSvg(m,{profile:'standalone'}).svg;const s=await openRenderSession(svg,'chromium',opts.scale);
   try{const frames:Buffer[]=[];for(const t of times)frames.push(await s.frame(t,opts.region));return {source:'export',frames};}finally{await s.close();}}
  catch(e){if(source==='export')throw e;reason=`standalone export unavailable (${String((e as Error).message).slice(0,160)}); rendered engine frames`;}
 }
 const frames:Buffer[]=[];
 for(const t of times){const r=await renderSvg(m.frame(t),t,'chromium',opts.scale);let img=sharp(r.png);
  if(opts.region){const vb=(m.doc.documentElement.getAttribute('viewBox')??'0 0 700 700').split(/[\s,]+/).map(Number),k=opts.scale;
   const left=Math.max(0,Math.floor((opts.region.x-vb[0])*k)),top=Math.max(0,Math.floor((opts.region.y-vb[1])*k));img=img.extract({left,top,width:Math.max(1,Math.min(r.width-left,Math.ceil(opts.region.width*k))),height:Math.max(1,Math.min(r.height-top,Math.ceil(opts.region.height*k)))});}
  frames.push(await img.png().toBuffer());}
 return {source:'engine',...(reason?{reason}:{}),frames};
}

/** Times for a filmstrip: uniform over the timeline (a loop's end equals its start, so it is not repeated). */
export function filmstripTimes(duration:number,loop:boolean,count:number){const n=Math.max(1,Math.round(count));const step=loop?duration/n:duration/Math.max(1,n-1);
 return Array.from({length:n},(_,i)=>Number(Math.min(duration,i*step).toFixed(4)));}

const escape=(s:string)=>s.replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'})[c]!);
const fade=(png:Buffer,opacity:number)=>sharp(png).ensureAlpha().linear([1,1,1,opacity],[0,0,0,0]).png().toBuffer();

/** Contact sheet: one row-major grid of frames with a caption strip per cell. Ghosts (onion skin) are drawn under
 * each frame at decreasing opacity so spacing and arcs are visible. */
export async function contactSheet(frames:Buffer[],captions:string[],opts:{columns?:number;maxWidth?:number;background?:string;ghosts?:Buffer[][]}={}){
 if(!frames.length)throw Error('No frames');const meta=await sharp(frames[0]).metadata();const fw=meta.width!,fh=meta.height!;const n=frames.length;
 const columns=Math.max(1,Math.min(n,opts.columns??(n<=4?n:n<=9?3:n<=16?4:n<=25?5:6))),rows=Math.ceil(n/columns);
 const gap=8,caption=22,maxWidth=opts.maxWidth??2048;const cw=Math.max(32,Math.min(fw,Math.floor((maxWidth-gap*(columns+1))/columns))),ch=Math.max(1,Math.round(fh*cw/fw));
 const width=gap+columns*(cw+gap),height=gap+rows*(ch+caption+gap);const layers:OverlayOptions[]=[];const cells:{x:number;y:number;width:number;height:number}[]=[];
 const fit=(png:Buffer)=>sharp(png).resize(cw,ch,{fit:'fill'}).png().toBuffer();
 for(let i=0;i<n;i++){const x=gap+(i%columns)*(cw+gap),y=gap+Math.floor(i/columns)*(ch+caption+gap);cells.push({x,y,width:cw,height:ch});
  const ghosts=opts.ghosts?.[i]??[];for(const [k,g] of ghosts.entries())layers.push({input:await fade(await fit(g),Math.max(.08,.32-.1*k)),left:x,top:y});
  layers.push({input:await fit(frames[i]),left:x,top:y});}
 const text=cells.map((c,i)=>`<rect x="${c.x}" y="${c.y+ch}" width="${cw}" height="${caption}" fill="#1f2430"/><text x="${c.x+6}" y="${c.y+ch+15}" font-family="Helvetica, Arial, sans-serif" font-size="12" fill="#f4f4f4">${escape(captions[i]??'')}</text>`).join('');
 layers.push({input:Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${text}</svg>`),left:0,top:0});
 const png=await sharp({create:{width,height,channels:4,background:opts.background??'#e9e9ec'}}).composite(layers).png().toBuffer();
 return {png,width,height,columns,rows,cell:{width:cw,height:ch},cells};
}
