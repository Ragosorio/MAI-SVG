import sharp from 'sharp';
import {VectorDocument} from '../core/document.js';
import {parseSvg,serialize,elements} from '../converter/svg.js';
import {renderTimes,contactSheet} from './observe.js';
import {raw,metrics} from './perceptual.js';
import {renderSvg} from './render.js';

export async function compareMotion(before:VectorDocument,after:VectorDocument,times:number[],scale=1){
 const av=before.doc.documentElement.getAttribute('viewBox'),bv=after.doc.documentElement.getAttribute('viewBox');
 if(av!==bv)throw Error('Comparison requires the same viewBox; register an aligned reference');
 if(times.some(t=>t<0||t>before.project.duration||t>after.project.duration))throw Error('Comparison times must lie within both timelines');
 const [a,b]=await Promise.all([renderTimes(before,times,{scale}),renderTimes(after,times,{scale})]);
 const pictures:Buffer[]=[],captions:string[]=[],frames=[];
 for(let i=0;i<times.length;i++){
  const A=await raw(a.frames[i]),B=await raw(b.frames[i]);const mixed=Buffer.alloc(A.data.length);
  // Blend premultiplied RGBA to avoid halos around transparent shapes.
  for(let k=0;k<mixed.length;k+=4){const alpha=(A.data[k+3]+B.data[k+3])/2;mixed[k+3]=Math.round(alpha);for(let c=0;c<3;c++)mixed[k+c]=alpha?Math.round((A.data[k+c]*A.data[k+3]+B.data[k+c]*B.data[k+3])/(2*alpha)):0;}
  const blend=await sharp(mixed,{raw:{width:A.width,height:A.height,channels:4}}).png().toBuffer();
  pictures.push(a.frames[i],b.frames[i],blend);captions.push(`${times[i].toFixed(3)} s · reference`,`${times[i].toFixed(3)} s · current`,`${times[i].toFixed(3)} s · 50% blend`);
  frames.push({time:times[i],...metrics(A,B)});
 }
 return {sheet:await contactSheet(pictures,captions,{columns:3,maxWidth:1536}),frames,sources:{reference:a.source,current:b.source},sourceNotes:{reference:a.reason,current:b.reason}};
}
/** Counterfactual visibility: pixels that actually change when the target is hidden in the fully rendered scene.
 * This includes occlusion, masks, inherited opacity and paint; identical background-colored pixels don't count. */
export async function visiblePixels(m:VectorDocument,ids:string[],times:number[],scale=1){
 const results=[];
 for(const time of times){const original=m.frame(time),doc=parseSvg(original),byId=new Map(elements(doc).map(e=>[e.getAttribute('id'),e]));
  for(const id of ids){const e=byId.get(id);if(!e)throw Error(`Visibility target ${id} not found`);e.setAttribute('style',`${e.getAttribute('style')??''};display:none!important`);}
  const [a,b]=await Promise.all([renderSvg(original,time,'chromium',scale),renderSvg(serialize(doc),time,'chromium',scale)]);
  const A=await raw(a.png),B=await raw(b.png);let pixels=0;
  for(let i=0;i<A.data.length;i+=4){const aa=A.data[i+3]/255,ba=B.data[i+3]/255;let diff=Math.abs(A.data[i+3]-B.data[i+3]);for(let c=0;c<3;c++)diff=Math.max(diff,Math.abs(A.data[i+c]*aa-B.data[i+c]*ba));if(diff>1)pixels++;}
  results.push({time,pixels:pixels/(scale*scale)});
 }
 return results;
}
