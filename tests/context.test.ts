// F3: the usage context sets priors for the agent and the critic — information, never a gate.
import test from 'node:test';import assert from 'node:assert/strict';
import {VectorDocument,starterSvg} from '../packages/core/document.js';
import {priors,contextFindings} from '../packages/core/context.js';
import {critique} from '../packages/core/critique.js';
import {AgentService} from '../packages/agent/service.js';
import {fileWorkspace} from '../packages/cli/agent.js';

test('priors differ by purpose (icon vs hero vs game idle) and explicit fields override them',()=>{
 const icon=priors({purpose:'ui-icon'}),hero=priors({purpose:'hero'}),game=priors({purpose:'game-sprite'});
 assert.equal(icon.cameraIntents.length,0);assert.ok(hero.cameraIntents.includes('push-in'));assert.equal(game.deliveryProfile,'game');assert.equal(game.loop,'required');assert.equal(game.faceReadability,'critical');
 assert.equal(priors({purpose:'hero',motionStyle:{energy:.2},performance:{profile:'mobile'}}).deliveryProfile,'mobile');assert.equal(priors({purpose:'hero',motionStyle:{energy:.2}}).energyMax,.2);
});

test('context is journaled with the scene, validated, and the critic reports deviations as info',()=>{
 const d=new VectorDocument(starterSvg);d.apply([{type:'timeline',duration:5,loop:false},{type:'context.set',context:{purpose:'game-sprite',performance:{profile:'game'}}},{type:'effect.stack',id:'g',target:'eye-left',effects:[{kind:'glow'}]},{type:'keyframe',target:'@camera',property:'zoom',time:0,value:1},{type:'keyframe',target:'@camera',property:'zoom',time:5,value:1.4}]);
 const codes=contextFindings(d.project).map(f=>f.code);for(const c of ['MAI_CONTEXT_DURATION','MAI_CONTEXT_LOOP','MAI_CONTEXT_CAMERA','MAI_CONTEXT_PROFILE'])assert.ok(codes.includes(c),`${c} in ${codes}`);
 assert.ok(critique(d).deterministic.findings.some(f=>f.code==='MAI_CONTEXT_PROFILE'));assert.deepEqual(new VectorDocument(d.toSVG()).project.context,d.project.context);
 assert.throws(()=>d.apply([{type:'context.set',context:{purpose:'rocket' as never}}]),/purpose/);
 d.apply([{type:'context.set',context:null}]);assert.equal(d.project.context,undefined);
});

test('context.get answers offline with priors; scene.inspect carries the context',async()=>{
 const d=new VectorDocument(starterSvg);d.apply([{type:'context.set',context:{purpose:'hero',placement:'landing'}}]);const svc=new AgentService(fileWorkspace(d.toSVG(),'hero.svg'));
 const g=await svc.call('context.get') as {context:{purpose:string};priors:{cameraIntents:string[]}};assert.equal(g.context.purpose,'hero');assert.ok(g.priors.cameraIntents.length>0);
 const i=await svc.call('scene.inspect',{depth:1}) as {context:{purpose:string;priors:unknown}};assert.equal(i.context.purpose,'hero');assert.ok(i.context.priors);
});
