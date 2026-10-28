// F4: the studies library — what worked, kept as references; approval belongs to the human (pending-review otherwise).
import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm} from 'node:fs/promises';import {existsSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {studio,buildFixture,port} from '../scripts/fixtures/mini-character.js';
import {closeRenderer} from '../packages/server/render.js';

test('studies: save from the scene or a branch, pending-review without the human\'s words, list and read back with the filmstrip',async()=>{
 const root=await mkdtemp(join(tmpdir(),'mai-study-'));const p=await port();const s=await studio(root,p);
 try{await buildFixture(s.call,s.post);
  const br=await s.call('variation.branch',{name:'tilt',commands:[{id:'a',type:'ops',ops:[{type:'pose',id:'flask',pose:{pivotX:160,pivotY:190}},{type:'acting.beat',target:'flask',property:'rotation',start:.2,duration:2,action:10}]}]}) as Record<string,any>;
  const pending=await s.call('study.save',{title:'Frasco que se inclina',from:br.branch.id,teaches:['Anticipación antes del gesto'],tags:['props']}) as Record<string,any>;
  assert.equal(pending.ok,true,JSON.stringify(pending.error));assert.equal(pending.study.status,'pending-review');assert.ok(existsSync(pending.study.filmstrip),'filmstrip copied from the branch');
  const bad=await s.call('study.save',{title:'x',approval:{by:'agent',quote:'me gusta'}}) as Record<string,any>;assert.equal(bad.ok,false);
  const approved=await s.call('study.save',{title:'Escena actual',approval:{by:'human',quote:'Así me gusta'}}) as Record<string,any>;assert.equal(approved.study.status,'approved');assert.ok(existsSync(approved.study.filmstrip),'filmstrip rendered from the scene');
  const list=await s.call('study.list',{status:'approved'}) as Record<string,any>;assert.deepEqual(list.studies.map((x:{id:string})=>x.id),[approved.study.id]);
  const got=await s.call('study.get',{id:pending.study.id}) as Record<string,any>;assert.equal(got.study.recipe.commands[0].ops[1].type,'acting.beat');assert.deepEqual(got.study.teaches,['Anticipación antes del gesto']);assert.ok(existsSync(got.sheet.path));
  assert.equal((await s.call('study.get',{id:'s-nope'}) as Record<string,any>).error.code,'NOT_FOUND');
 }finally{await s.app.close();await closeRenderer();await rm(root,{recursive:true,force:true});}
});
