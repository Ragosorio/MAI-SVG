import sharp from 'sharp';
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';import {join} from 'node:path';import {randomUUID} from 'node:crypto';
import type {VectorDocument} from '../core/document.js';import {exportSvg} from '../core/export.js';import {renderSvg} from './render.js';
// Canvas/timeline comments: the human's words plus structured context (targets, semantic parts, region, time,
// revision, screenshot). MAI does not interpret the text — the agent does, then answers with tools.
export type Reply={at:string;author:'user'|'agent';text:string;choice?:string;revision?:number};
export type Comment={id:string;asset:string;revision:number;time:number;targets:string[];parts:{id:string;role:string;label:string}[];region?:{x:number;y:number;width:number;height:number};point?:{x:number;y:number};text:string;author:'user'|'agent';status:'open'|'answered'|'resolved';replies:Reply[];screenshot?:string;createdAt:string};
const safeAsset=(s:string)=>s.replace(/[^a-zA-Z0-9_.-]/g,'_').slice(0,80)||'asset';
export class Comments{
 list:Comment[]=[];asset='';
 constructor(readonly folder:string){}
 file(){return join(this.folder,`${safeAsset(this.asset)}.json`);}
 async load(asset:string){this.asset=asset;try{this.list=JSON.parse(await readFile(this.file(),'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;this.list=[];}}
 async save(){await mkdir(this.folder,{recursive:true});const temp=join(this.folder,randomUUID()+'.tmp');await writeFile(temp,JSON.stringify(this.list,null,1));await rename(temp,this.file());}
 async add(model:VectorDocument,input:{text:string;time?:number;targets?:string[];region?:{x:number;y:number;width:number;height:number};point?:{x:number;y:number};author?:'user'|'agent';screenshot?:boolean},revision:number){
  if(typeof input.text!=='string'||!input.text.trim()||input.text.length>4000)throw Error('Comment text must be 1–4000 characters');const time=Number(input.time??0);if(!Number.isFinite(time)||time<0||time>model.project.duration)throw Error('Comment time outside timeline');
  const targets=(input.targets??[]).slice(0,200).filter(id=>typeof id==='string'&&model.index.has(id));if(this.list.length>=2000)throw Error('Comment limit reached; resolve old comments');
  for(const v of [input.region?.x,input.region?.y,input.region?.width,input.region?.height,input.point?.x,input.point?.y])if(v!==undefined&&(!Number.isFinite(v)||Math.abs(v)>1e5))throw Error('Invalid comment geometry');
  const parts=(model.project.semantic?.nodes??[]).filter(n=>n.status!=='rejected'&&n.targets.some(t=>targets.some(x=>x===t||isInside(model,x,t)||isInside(model,t,x)))).map(n=>({id:n.id,role:n.role,label:n.label}));
  const c:Comment={id:'c-'+randomUUID().slice(0,8),asset:this.asset,revision,time,targets,parts,region:input.region,point:input.point,text:input.text,author:input.author??'user',status:'open',replies:[],createdAt:new Date().toISOString()};
  if(input.screenshot!==false){try{const svg=model.project.tracks.length||model.project.modifiers?.length||model.project.expression?exportSvg(model,{profile:'standalone',maxBytes:32*1024*1024}).svg:model.toSVG(false);const r=await renderSvg(svg,time);let png=r.png;const b=input.region??(input.point?{x:input.point.x-80,y:input.point.y-80,width:160,height:160}:undefined);
   if(b){const pad=24,left=Math.max(0,Math.floor(b.x-pad)),top=Math.max(0,Math.floor(b.y-pad)),width=Math.min(r.width-left,Math.ceil(b.width+2*pad)),height=Math.min(r.height-top,Math.ceil(b.height+2*pad));if(width>0&&height>0)png=await sharp(png).extract({left,top,width,height}).png().toBuffer();}
   await mkdir(join(this.folder,'shots'),{recursive:true});c.screenshot=`${c.id}.png`;await writeFile(join(this.folder,'shots',c.screenshot),png);}catch(error){c.replies.push({at:new Date().toISOString(),author:'agent',text:`Captura no disponible: ${String(error).slice(0,200)}`});}}
  this.list.push(c);await this.save();return c;}
 get(id:string){const c=this.list.find(c=>c.id===id);if(!c)throw Error('Comment not found');return c;}
 async reply(id:string,input:{text:string;author?:'user'|'agent';choice?:string;status?:Comment['status'];revision?:number}){const c=this.get(id);if(typeof input.text!=='string'||!input.text.trim()||input.text.length>4000)throw Error('Reply text must be 1–4000 characters');if(input.status&&!['open','answered','resolved'].includes(input.status))throw Error('Invalid status');c.replies.push({at:new Date().toISOString(),author:input.author==='user'?'user':'agent',text:input.text,...(input.choice?{choice:input.choice}:{}),...(input.revision!==undefined?{revision:input.revision}:{})});c.status=input.status??(input.author==='user'?'open':'answered');await this.save();return c;}
 async resolve(id:string){const c=this.get(id);c.status='resolved';await this.save();return c;}
 shotPath(id:string){const c=this.get(id);if(!c.screenshot)throw Error('No screenshot');return join(this.folder,'shots',c.screenshot);}
 shot(id:string){return readFile(this.shotPath(id));}
 public(){return this.list.map(({screenshot,...c})=>({...c,screenshot:screenshot?{url:`/api/comment-shot?id=${c.id}`,path:join(this.folder,'shots',screenshot)}:undefined}));}
}
function isInside(model:VectorDocument,id:string,ancestor:string){let e:Node|null=(model.index.get(id) as unknown as Node)??null;const a=model.index.get(ancestor) as unknown as Node;if(!a)return false;while(e){if(e===a)return true;e=e.parentNode;}return false;}
