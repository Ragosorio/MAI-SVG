import {appendFile,readFile,mkdir} from 'node:fs/promises';import {join,dirname} from 'node:path';
// Durable event log for the human ↔ agent loop. Agents long-poll `after` a cursor; `_next` tells them what to do.
export type InboxEvent={seq:number;at:string;type:string;data:Record<string,unknown>;_next:string};
export class Inbox{
 events:InboxEvent[]=[];seq=0;waiters=new Set<()=>void>();onPush?:(event:InboxEvent)=>void;
 constructor(readonly file:string){}
 async restore(){try{const lines=(await readFile(this.file,'utf8')).split('\n').filter(Boolean);this.events=lines.map(l=>JSON.parse(l)).slice(-2000);this.seq=this.events.at(-1)?.seq??0;}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}}
 async push(type:string,data:Record<string,unknown>,next:string){const event={seq:++this.seq,at:new Date().toISOString(),type,data,_next:next};this.events.push(event);if(this.events.length>2000)this.events=this.events.slice(-2000);await mkdir(dirname(this.file),{recursive:true});await appendFile(this.file,JSON.stringify(event)+'\n');for(const w of this.waiters)w();this.waiters.clear();this.onPush?.(event);return event;}
 after(cursor:number,types?:string[]){return this.events.filter(e=>e.seq>cursor&&(!types||types.includes(e.type)));}
 async wait(cursor:number,ms:number,types?:string[]){const ready=this.after(cursor,types);if(ready.length||ms<=0)return ready;await new Promise<void>(resolve=>{const timer=setTimeout(()=>{this.waiters.delete(done);resolve();},Math.min(ms,600000));const done=()=>{clearTimeout(timer);resolve();};this.waiters.add(done);});return this.after(cursor,types);}
 close(){for(const w of this.waiters)w();this.waiters.clear();}
}
export const inboxFile=(cache:string)=>join(cache,'inbox.jsonl');
