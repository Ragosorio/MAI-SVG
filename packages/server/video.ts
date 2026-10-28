import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import sharp from 'sharp';
import type {VectorDocument} from '../core/document.js';
import {renderTimes,contactSheet,type FrameSource} from './observe.js';
const exec=promisify(execFile);
export type VideoOptions={start?:number;end?:number;fps?:number;width?:number;format?:'mp4'|'webm';source?:'auto'|FrameSource;background?:string};
// 'auto' keeps white unless the art itself is mostly light (a white mascot would vanish), then uses a neutral gray.
async function pickBackground(frame:Buffer,requested?:string){if(requested&&requested!=='auto'){if(!/^#[0-9a-fA-F]{6}$/.test(requested))throw Error('background must be auto or #rrggbb');return requested;}
 const {data,info}=await sharp(frame).resize(96,96,{fit:'inside'}).ensureAlpha().raw().toBuffer({resolveWithObject:true});let sum=0,n=0;for(let i=0;i<data.length;i+=info.channels){const a=data[i+3]/255;if(a<.5)continue;sum+=(.2126*data[i]+.7152*data[i+1]+.0722*data[i+2])/255;n++;}return n&&sum/n>.8?'#c8d0d8':'#ffffff';}
export function videoSchedule(duration:number,opts:VideoOptions){
 const start=opts.start??0,end=opts.end??duration,fps=opts.fps??12,width=opts.width??640;
 if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start||end>duration)throw Error('Video interval must satisfy 0 <= start < end <= duration');
 if(!Number.isInteger(fps)||fps<6||fps>30)throw Error('Video fps must be an integer from 6 to 30');
 if(!Number.isInteger(width)||width<64||width>1024)throw Error('Video width must be an integer from 64 to 1024');
 const count=Math.ceil((end-start)*fps);if(count>600)throw Error('Video exceeds 600 frames; shorten the interval or lower fps');
 return {start,end,fps,width,count,times:Array.from({length:count},(_,i)=>start+i/fps),encodedDuration:count/fps};
}
/** Video is a preview artifact; the SVG source and timeline are never changed. */
export async function renderVideo(m:VectorDocument,dir:string,opts:VideoOptions={}){
 const spec=videoSchedule(m.project.duration,opts),format=opts.format??'mp4';if(!['mp4','webm'].includes(format))throw Error('Unsupported video format');
 // Check before rendering hundreds of frames; no shell and no installation side effects.
 try{await exec('ffmpeg',['-version'],{timeout:10000,maxBuffer:64000});}catch{throw Error('Video requires ffmpeg on PATH. Use render.filmstrip when no encoder is installed.');}
 const vb=(m.doc.documentElement.getAttribute('viewBox')??'0 0 700 700').split(/[\s,]+/).map(Number);
 const width=Math.floor(spec.width/2)*2,height=Math.max(2,Math.round(width*vb[3]/vb[2]/2)*2);
 if(!Number.isFinite(height)||height>2048||width*height*spec.count>128_000_000)throw Error('Video pixel budget exceeded; reduce width or duration');
 await mkdir(dir,{recursive:true});const temp=await mkdtemp(join(dir,'video-frames-')),base=join(dir,`video-${randomUUID().slice(0,8)}`),path=`${base}.${format}`,posterPath=`${base}-poster.png`;
 try{
  const r=await renderTimes(m,spec.times,{scale:Math.max(.25,Math.min(4,width/vb[2])),source:opts.source});
  const posterFrames:Buffer[]=[],captions:string[]=[];const indexes=new Set(Array.from({length:Math.min(12,spec.count)},(_,i)=>Math.round(i*(spec.count-1)/Math.max(1,Math.min(12,spec.count)-1))));
  const background=await pickBackground(r.frames[0],opts.background);
  for(let i=0;i<r.frames.length;i++){
   const png=await sharp(r.frames[i]).resize(width,height).flatten({background}).png().toBuffer();
   await writeFile(join(temp,`frame-${String(i).padStart(4,'0')}.png`),png);
   if(indexes.has(i)){posterFrames.push(png);captions.push(`${spec.times[i].toFixed(2)} s`);}
  }
  const codec=format==='mp4'?['-c:v','libx264','-pix_fmt','yuv420p','-movflags','+faststart']:['-c:v','libvpx-vp9','-pix_fmt','yuv420p','-b:v','0','-crf','32'];
  await exec('ffmpeg',['-hide_banner','-loglevel','error','-nostdin','-y','-framerate',String(spec.fps),'-i',join(temp,'frame-%04d.png'),...codec,path],{timeout:120000,maxBuffer:256000});
  const poster=await contactSheet(posterFrames,captions);await writeFile(posterPath,poster.png);
  return {path,posterPath,format,encoder:'ffmpeg',fps:spec.fps,frames:spec.count,width,height,start:spec.start,end:spec.end,encodedDuration:spec.encodedDuration,source:r.source,...(r.reason?{sourceNote:r.reason}:{}),background,note:'Preview video; no audio, motion blur or alpha. SVG remains the editable source.'};
 }catch(e){await Promise.all([rm(path,{force:true}),rm(posterPath,{force:true})]);throw e;}finally{await rm(temp,{recursive:true,force:true});}
}
