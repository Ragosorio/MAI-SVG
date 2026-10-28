// Direction (the human's brief as data): what MUST happen, written by the agent as testable requirements, and the
// creative latitude for everything else. MAI never parses the words; the agent maps "two eyes open while waving,
// wink at 3.6 s, the rest creative" to musts with assertions (sprite state at a time, matches the approved art at a
// time, moves/lags/…). Musts without assertions stay "untested": the agent must look at frames to judge them.
import type {Direction,Project} from './model.js';
import {validateAssertions,type Assertion} from './assertions.js';

const ID=/^[A-Za-z_][\w.-]{0,60}$/;
export function validateDirection(d:unknown):asserts d is Direction{
 if(!d||typeof d!=='object'||Array.isArray(d))throw Error('Direction must be an object');const x=d as Record<string,unknown>;
 const allowed=new Set(['brief','musts','latitude','source']);for(const k of Object.keys(x))if(!allowed.has(k))throw Error(`Unknown direction field ${k} (brief, musts, latitude, source)`);
 if(typeof x.brief!=='string'||!x.brief.trim()||x.brief.length>4000)throw Error('Direction brief: the human\'s words, 1–4000 characters');
 if(x.latitude!==undefined&&(typeof x.latitude!=='string'||x.latitude.length>2000))throw Error('Direction latitude: up to 2000 characters');
 if(x.source!==undefined&&!['user','agent'].includes(x.source as string))throw Error('Direction source must be user or agent');
 if(!Array.isArray(x.musts)||x.musts.length>32)throw Error('Direction musts: up to 32 requirements');
 const seen=new Set<string>();let total=0;
 for(const m of x.musts as Record<string,unknown>[]){if(!m||typeof m!=='object')throw Error('Each must is an object {id,text,assertions?}');
  for(const k of Object.keys(m))if(!['id','text','assertions'].includes(k))throw Error(`Unknown must field ${k} (id, text, assertions)`);
  if(typeof m.id!=='string'||!ID.test(m.id)||seen.has(m.id))throw Error('Each must needs a unique id');seen.add(m.id);
  if(typeof m.text!=='string'||!m.text.trim()||m.text.length>500)throw Error(`Must ${m.id}: text of 1–500 characters`);
  if(m.assertions!==undefined){validateAssertions(m.assertions);total+=(m.assertions as unknown[]).length;}}
 if(total>32)throw Error('Direction musts carry at most 32 assertions in total');
}
/** Assertions of every must, tagged with the must they prove. */
export function directionAssertions(p:Project):{must:string;assertion:Assertion}[]{return (p.direction?.musts??[]).flatMap(m=>(m.assertions??[]).map(assertion=>({must:m.id,assertion})));}
/** Per-must status from verification results aligned with directionAssertions(p). */
export function directionReport(p:Project,results:{status:string}[]){const tagged=directionAssertions(p);
 return (p.direction?.musts??[]).map(m=>{const mine=tagged.map((t,i)=>({t,r:results[i]})).filter(x=>x.t.must===m.id);
  const status=!mine.length?'untested':mine.every(x=>x.r?.status==='passed')?'passed':mine.some(x=>x.r?.status==='failed')?'failed':'not_evaluated';
  return {id:m.id,text:m.text,status,assertions:mine.length};});}
