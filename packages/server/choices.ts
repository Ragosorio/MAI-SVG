import sharp from 'sharp';
import {readFile,writeFile,mkdir,rename}from 'node:fs/promises';import {join}from 'node:path';import {randomUUID}from 'node:crypto';
import {VectorDocument}from '../core/document.js';import type {Operation}from '../core/model.js';import {renderSvg}from './render.js';
type Option={id:string;label:string;description:string;ops:Operation[]};
export type ChoiceRequest={id:string;prompt:string;recommended:string;reason:string;time?:number;previewRegion?:{x:number;y:number;width:number;height:number};options:Option[]};
export type Choice=ChoiceRequest&{revision:number;status:'pending'|'chosen'|'dismissed';selected?:string};
const safe=(s:string)=>typeof s==='string'&&/^[a-zA-Z][\w-]{0,60}$/.test(s);
export class Choices{
 current?:Choice;
 constructor(readonly folder:string){}
 async restore(){try{this.current=JSON.parse(await readFile(join(this.folder,'current.json'),'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}}
 public(){if(!this.current)return null;const {options,...rest}=this.current;return{...rest,options:options.map(({ops,...o})=>({...o,preview:`/api/choice-preview?id=${this.current!.id}&option=${o.id}`}))};}
 async save(){await mkdir(this.folder,{recursive:true});const temp=join(this.folder,randomUUID()+'.tmp');await writeFile(temp,JSON.stringify(this.current));await rename(temp,join(this.folder,'current.json'));}
 async propose(r:ChoiceRequest,model:VectorDocument,revision:number){
  if(!safe(r.id)||!r.prompt||r.prompt.length>1000||!r.reason||r.reason.length>1000||!Array.isArray(r.options)||r.options.length<2||r.options.length>4||new Set(r.options.map(o=>o.id)).size!==r.options.length||!r.options.some(o=>o.id===r.recommended)||!Number.isFinite(r.time??0)||(r.time??0)<0||(r.time??0)>model.project.duration||JSON.stringify(r).length>2e6)throw Error('Invalid choice request');
  if(this.current?.status==='pending')throw Error('Resolve or dismiss the pending choice first');
  if(r.previewRegion){const b=r.previewRegion;if(![b.x,b.y,b.width,b.height].every(Number.isInteger)||b.x<0||b.y<0||b.width<1||b.height<1)throw Error('Invalid preview region');}const images:Buffer[]=[];for(const o of r.options){if(!safe(o.id)||!o.label||o.label.length>100||!o.description||o.description.length>1000||!Array.isArray(o.ops)||!o.ops.length||o.ops.length>500)throw Error('Invalid choice option');const draft=new VectorDocument(model.toSVG());draft.apply(o.ops);const rendered=await renderSvg(draft.frame(r.time??0));if(r.previewRegion){const b=r.previewRegion;if(b.x+b.width>rendered.width||b.y+b.height>rendered.height)throw Error('Preview region outside canvas');images.push(await sharp(rendered.png).extract({left:b.x,top:b.y,width:b.width,height:b.height}).png().toBuffer());}else images.push(rendered.png);}
  await mkdir(this.folder,{recursive:true});for(let i=0;i<images.length;i++)await writeFile(join(this.folder,`${r.id}-${r.options[i].id}.png`),images[i]);this.current={...structuredClone(r),revision,status:'pending'};await this.save();return this.public();
 }
 async preview(id:string,option:string){if(!safe(id)||!safe(option)||this.current?.id!==id||!this.current.options.some(o=>o.id===option))throw Error('Unknown choice preview');return readFile(join(this.folder,`${id}-${option}.png`));}
 selected(id:string,option:string,revision:number){const c=this.current;if(!c||c.id!==id||c.status!=='pending')throw Error('No matching pending choice');if(c.revision!==revision)throw Object.assign(Error('Choice is stale: regenerate previews against the current revision'),{status:409});const o=c.options.find(o=>o.id===option);if(!o)throw Error('Unknown choice option');return o;}
}
