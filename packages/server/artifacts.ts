import {readdir,stat,rm,writeFile,readFile,mkdir} from 'node:fs/promises';
import {join,resolve,relative} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {contentHash,type VectorDocument} from '../core/document.js';
export type Artifact={id:string;path:string;revision:number;documentHash:string;sha256:string;createdAt:string};
export async function registerArtifact(root:string,path:string,m:VectorDocument,revision:number):Promise<Artifact>{
 const base=resolve(root),full=resolve(path),rel=relative(base,full);if(rel.startsWith('..')||rel.startsWith('/'))throw Error('Artifact must belong to observation cache');
 const a={id:randomUUID(),path:rel,revision,documentHash:contentHash(m),sha256:createHash('sha256').update(await readFile(full)).digest('hex'),createdAt:new Date().toISOString()};
 await mkdir(join(base,'artifacts'),{recursive:true});await writeFile(join(base,'artifacts',`${a.id}.json`),JSON.stringify(a));return {...a,path:full};
}
export async function loadArtifact(root:string,id:string,m:VectorDocument){
 if(!/^[a-f0-9-]{36}$/.test(id))throw Error('Invalid artifact id');
 const a=JSON.parse(await readFile(join(root,'artifacts',`${id}.json`),'utf8')) as Artifact;
 const full=resolve(root,a.path),rel=relative(resolve(root),full);if(rel.startsWith('..')||rel.startsWith('/'))throw Error('Invalid artifact path');
 if(a.documentHash!==contentHash(m))throw Error(`Artifact ${id} is stale: render the current scene first`);
 if(createHash('sha256').update(await readFile(full)).digest('hex')!==a.sha256)throw Error(`Artifact ${id} content changed`);
 return {...a,path:full};
}
/** Retention only touches completed observation files, never snapshots or active video intermediates. */
export async function pruneObservations(root:string,keep:string[]=[],maxFiles=200,maxBytes=500*1024*1024){
 const found:{path:string;bytes:number;time:number}[]=[],preserve=new Set(keep.map(p=>resolve(p)));
 const visit=async(dir:string)=>{for(const e of await readdir(dir,{withFileTypes:true}).catch(()=>[])){const p=join(dir,e.name);if(e.isSymbolicLink())continue;if(e.isDirectory()){if(!e.name.startsWith('video-frames-'))await visit(p);}else if(/\.(png|jpg|webp|gif|mp4|webm|svg)$/.test(e.name)){const s=await stat(p).catch(()=>undefined);if(s)found.push({path:p,bytes:s.size,time:s.mtimeMs});}}};await visit(root);
 let count=found.length,bytes=found.reduce((sum,f)=>sum+f.bytes,0);const removed=[];
 for(const f of found.sort((a,b)=>a.time-b.time)){if(count<=maxFiles&&bytes<=maxBytes)break;if(preserve.has(resolve(f.path)))continue;await rm(f.path,{force:true});count--;bytes-=f.bytes;removed.push(f.path);}
 // Delete orphan artifact metadata after its associated file is evicted.
 const meta=join(root,'artifacts');for(const e of await readdir(meta).catch(()=>[])){if(!e.endsWith('.json'))continue;const path=join(meta,e);try{const a=JSON.parse(await readFile(path,'utf8')) as Artifact;const full=resolve(root,a.path);if(!relative(resolve(root),full).startsWith('..')&&!await stat(full).catch(()=>undefined))await rm(path,{force:true});}catch{/* A concurrent write is retried on the next retention pass. */}}
 return {files:count,bytes,removed:removed.length};
}
