import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';import {join} from 'node:path';import {createHash,randomUUID} from 'node:crypto';import {gzipSync,gunzipSync} from 'node:zlib';
import {VectorDocument} from '../core/document.js';
// Immutable, content-addressed scene snapshots. An agent's read returns snapshotId; plans, previews and identity
// checks refer to it, so evidence always names the exact state it was computed from.
export const sha256=(s:string|Buffer)=>createHash('sha256').update(s).digest('hex');
export class Snapshots{
 private latest=new Map<string,string>();
 constructor(readonly folder:string){}
 async save(model:VectorDocument,documentId:string,revision:number|string){const key=`${documentId}@${revision}`;const known=this.latest.get(key);if(known)return {id:known,reused:true};
  const svg=model.toSVG(),hash=sha256(svg),id=`snap-${documentId.slice(0,12)}-r${revision}-${hash.slice(0,10)}`;await mkdir(this.folder,{recursive:true});const temp=join(this.folder,randomUUID()+'.tmp');
  await writeFile(temp,gzipSync(JSON.stringify({id,documentId,revision,sha256:hash,svg}),{level:1}));await rename(temp,join(this.folder,`${id}.json.gz`));this.latest.set(key,id);return {id,reused:false,sha256:hash};}
 async meta(id:string){if(!/^snap-[\w.:-]+$/.test(id))throw Object.assign(Error(`Invalid snapshot id ${id}`),{code:'BASELINE_NOT_FOUND',status:404});try{return JSON.parse(gunzipSync(await readFile(join(this.folder,`${id}.json.gz`))).toString()) as {id:string;documentId:string;revision:number;sha256:string;svg:string};}catch{throw Object.assign(Error(`Snapshot ${id} not found`),{code:'BASELINE_NOT_FOUND',status:404});}}
 async load(id:string){const m=await this.meta(id);if(sha256(m.svg)!==m.sha256)throw Object.assign(Error(`Snapshot ${id} hash mismatch`),{code:'BASELINE_NOT_FOUND',status:404});return {doc:new VectorDocument(m.svg),meta:m};}
 forget(documentId:string,revision:number){this.latest.delete(`${documentId}@${revision}`);}
}
