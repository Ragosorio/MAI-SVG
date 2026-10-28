// MCP v2 surface (plan F4): granular resources (read one thing at a time instead of a whole scene), workflow prompts
// and completions from live catalogues. Everything reads through the same agent tools as CLI/HTTP, so the answers
// match what the tools would return; static catalogues (presets, shots, curves) come from the core.
import {OPERATION_TYPES} from '../core/model.js';
import {PRESET_CATALOG} from '../core/presets.js';
import {PURPOSES} from '../core/context.js';
import {LEGACY_BEZIER} from '../core/curves.js';
import {SIGNAL_KINDS} from '../core/procedural.js';
import {EFFECT_KINDS,EFFECT_CATEGORY,EFFECT_COST} from '../core/effects.js';
import {TOOLS} from '../agent/registry.js';
import {EXPR_FUNCTIONS,EXPR_VARIABLES,EXPR_REFERENCES} from '../core/expr.js';

export type Call=(tool:string,args?:Record<string,unknown>)=>Promise<Record<string,unknown>>;
const SHOTS:Record<string,string>={establish:'Open on the whole scene with a slow push; wide never zooms out of a full-bleed scene.',reveal:'Optimal pan+zoom (van Wijk) from the current view to a medium framing of the subject.','push-in':'Toward a close-up of the subject: emphasis.','pull-out':'Back to the whole scene: context after a moment.',pan:'Move attention sideways to the subject.','orbit-2d':'A small roll (±8°·intensity) suggesting circling the subject.',impact:'Zoom punch + decaying shake on the camera-shake layer, synced to an action.',handheld:'Seeded noise on x/y/rotation (camera-shake layer), loop-aware.',cut:'Hold, then jump to a new framing (exports as an instant cut).',follow:'Ease into a framing, then track the moving subject with lag (snappy .1 s, smooth .25 s, lazy .5 s) through expression signals; rests where the subject left it.'};
const CURVES={vocabulary:{snappy:{out:{speed:0,influence:.15},in:{speed:0,influence:.7}},heavy:{out:{speed:0,influence:.7},in:{speed:0,influence:.3},note:'then overshoot + settle (acting.beat)'},floaty:{out:{speed:0,influence:.7},in:{speed:0,influence:.75}},continuous:{auto:'auto'},hold:{hold:true}},legacyEasings:LEGACY_BEZIER,custom:'curve:"M0 0 C… 1 1" (x increasing 0→1, y free)'};

export const FIXED=[
 {uri:'mai://scene/summary',name:'Scene summary',description:'scene.inspect (depth 1): parts, ids, sources, context, motion summary, revision.',mimeType:'application/json'},
 {uri:'mai://context/current',name:'Usage context',description:'Where/why the animation is seen and the priors it implies.',mimeType:'application/json'},
 {uri:'mai://timeline',name:'Timeline',description:'Tracks, layers, markers, beats summary.',mimeType:'application/json'},
 {uri:'mai://operations',name:'Operation catalogue',description:'Every core operation by family (operations.list).',mimeType:'application/json'},
 {uri:'mai://catalog/curves',name:'Curve vocabulary',description:'Tangent handles for snappy/heavy/floaty, legacy easings as cubic handles, custom curves.',mimeType:'application/json'},
 {uri:'mai://catalog/signals',name:'Signal kinds',description:'Procedural signal sources (noise, wiggle, oscillator, pulse, blink, drift, curve, speed).',mimeType:'application/json'},
 {uri:'mai://expr/functions',name:'Expression language',description:'Variables, references and functions of expression signals (source kind expr) and motion.propagate.',mimeType:'application/json'},
 {uri:'mai://catalog/effects',name:'Effect kinds',description:'Effect stack kinds with identity category and cost.',mimeType:'application/json'},
];
export const TEMPLATES=[
 {uriTemplate:'mai://operation/{type}',name:'Operation',description:'Full JSON Schema, worked examples, macro expansion and identity behaviour of one operation.',mimeType:'application/json'},
 {uriTemplate:'mai://part/{ref}',name:'Part',description:'One semantic part (address, ids, bounds) via part.resolve.',mimeType:'application/json'},
 {uriTemplate:'mai://preset/{name}',name:'Motion preset',description:'What a preset builds and teaches (it expands into editable operations).',mimeType:'application/json'},
 {uriTemplate:'mai://shot/{intent}',name:'Camera shot intent',description:'What a camera.shot intent does.',mimeType:'application/json'},
 {uriTemplate:'mai://study/{id}',name:'Study',description:'A saved study: context, brief, recipe, verdict and filmstrip (approved or pending-review).',mimeType:'application/json'},
 {uriTemplate:'mai://capability/{tool}',name:'Tool',description:'One tool with its schema, side effects and examples.',mimeType:'application/json'},
];

/** Read a resource; throws an Error with code for unknown URIs (mapped to JSON-RPC errors by the server). */
export async function readResource(uri:string,call:Call):Promise<unknown>{
 const ok=(r:Record<string,unknown>)=>{if(r.ok===false)throw Object.assign(Error(String((r.error as {message?:string})?.message??'tool error')),{code:-32602});const {ok:_ok,tool:_t,...rest}=r;void _ok;void _t;return rest;};
 const m=/^mai:\/\/([a-z]+)(?:\/(.+))?$/.exec(uri);if(!m)throw Object.assign(Error(`Unknown resource ${uri}`),{code:-32002});const [,kind,rawArg]=m;const arg=rawArg?decodeURIComponent(rawArg):undefined;
 switch(kind){
  case 'scene':if(arg==='summary')return ok(await call('scene.inspect',{depth:1}));break;
  case 'context':if(arg==='current')return ok(await call('context.get'));break;
  case 'timeline':return ok(await call('scene.timeline'));
  case 'operations':return ok(await call('operations.list'));
  case 'operation':if(arg)return ok(await call('operations.describe',{type:arg}));break;
  case 'part':if(arg)return ok(await call('part.resolve',{ref:arg}));break;
  case 'preset':if(arg&&arg in PRESET_CATALOG)return {name:arg,...PRESET_CATALOG[arg as keyof typeof PRESET_CATALOG],usage:`motion.preset {id, kind:"${arg}"} — inspect what it built with scene.timeline, then reshape it`};if(arg)throw Object.assign(Error(`Unknown preset ${arg}`),{code:-32602});break;
  case 'shot':if(arg&&arg in SHOTS)return {intent:arg,does:SHOTS[arg],usage:`camera.shot {shot:{intent:"${arg}", subject, start, duration, to:{framing}}}`};if(arg)throw Object.assign(Error(`Unknown shot intent ${arg}`),{code:-32602});break;
  case 'capability':if(arg)return ok(await call('capabilities',{tool:arg}));break;
  case 'study':if(arg)return ok(await call('study.get',{id:arg}));if(!rawArg)return ok(await call('study.list'));break;
  case 'expr':if(arg==='functions')return {variables:EXPR_VARIABLES,references:EXPR_REFERENCES,functions:Object.fromEntries(Object.entries(EXPR_FUNCTIONS).map(([k,f])=>[k,{kind:f.kind,arity:f.arity,constantArgs:f.constArgs,doc:f.doc}])),
   rules:['numbers only; strings are ids/param names/easing names inside ref(), param(), sig(), ease()','references read motion before expressions (keys, paths, other signals, rig, secondary), so no self-cycles','temporal and noise parameters must be constants','x/0 and non-finite results are 0','limits: 1000 chars, 256 nodes, depth 24, 8 temporal functions, 32 references'],
   examples:{follow:'spring(body.rotation, 80, 9)',lagNoOvershoot:'smooth(head.y, .2)',overlap:'-0.3*velocity(delay(body.rotation, .08))',shadowShrinks:'1 - clamp(-body.y/40, 0, .4)',breathe:'2*sin(TAU*t/3.5)'}};break;
  case 'catalog':if(arg==='curves')return CURVES;if(arg==='signals')return {kinds:SIGNAL_KINDS,usage:'signal.add {signal:{id, output:{target, property, layer}, source:{kind,…}, envelope?}} — operations.describe signal.add for fields'};if(arg==='effects')return {kinds:EFFECT_KINDS.map(k=>({kind:k,category:EFFECT_CATEGORY[k],cost:EFFECT_COST[k]}))};break;
 }
 throw Object.assign(Error(`Unknown resource ${uri}`),{code:-32002});}

// ── Prompts: workflows that start the agent on the right loop. Arguments are filled into one user message. ─────────
export const PROMPTS:{name:string;description:string;arguments:{name:string;description:string;required?:boolean}[];text:(a:Record<string,string>)=>string}[]=[
 {name:'animate-from-brief',description:'Turn the human\'s words into musts (tested) and creative latitude, then animate: what they asked happens exactly, everything else is yours.',arguments:[{name:'brief',description:'The human\'s words, verbatim',required:true}],
  text:a=>`The human said: «${a.brief}». 1) Split it: MUSTS are only what they explicitly asked (states, timings, gestures, what must stay); everything else is LATITUDE for you. 2) If a must needs a state the approved art does not show (e.g. both eyes open when the art winks), borrow that drawing from a sibling file of the same design system (part.borrow), make a sprite (sprite.define) and key it (sprite.keyframe) — never redraw. The approved art may appear later in the timeline: prove it with matchesBaseline at that time. 3) Record direction.set {brief, musts with assertions (state at/during, matchesBaseline at, moves, before…), latitude}. 4) Author the whole piece creatively in a motion-plan v2 dry-run; the receipt's verify.direction reports every must. 5) Look at the filmstrip, refine, commit, then report each must with its status and what you invented.`},
 {name:'animate-character-idle',description:'A living, seamless idle for a character part, tested and looked at before committing.',arguments:[{name:'part',description:'Character part (address or id)',required:true},{name:'context',description:'Where it will be seen (e.g. game inventory 512 px)'}],
  text:a=>`Create a living idle for ${a.part}${a.context?` (${a.context})`:''}. Record the context (context.set), write assertions (energy on the body, loopSeamless, the face returns to rest), try a motion-plan v2 dry-run starting from motion.preset idle and reshaping it (acting beats, signals, overlap), look at evaluation.filmstrip, refine once or twice, then commit. Keep identity: never redraw the face.`},
 {name:'cinematic-reveal',description:'Reveal a subject like the first shot of a film: depth, camera and timing.',arguments:[{name:'subject',description:'Subject part',required:true},{name:'duration',description:'Seconds'}],
  text:a=>`Stage a cinematic reveal of ${a.subject}${a.duration?` in ${a.duration} s`:''}: put scene layers on depth planes (camera.depth), establish then push-in or reveal with camera.shot, add a subtle handheld if it suits, check MAI_CAMERA_* findings and the filmstrip, and keep the subject inside the action-safe area.`},
 {name:'refine-until-alive',description:'Iterate on existing motion until it reads alive: look, critique, change one thing, look again.',arguments:[{name:'target',description:'Part to refine',required:true}],
  text:a=>`Refine the motion of ${a.target} until it feels alive and intentional. Each pass: render.filmstrip (sampling significant, ghost 2), render.motion trail/spacing, critique, motion.verify; change the single thing that helps most (curves, overlap, holds, arcs) via a motion-plan v2 dry-run; compare.motion against the previous state; record your judgement with critique.record. Stop when assertions pass and the critique has nothing you disagree with.`},
 {name:'direct-a-shot',description:'Compose one camera shot with intent.',arguments:[{name:'intent',description:'establish | reveal | push-in | pull-out | pan | orbit-2d | impact | handheld | cut',required:true},{name:'subject',description:'Subject part',required:true}],
  text:a=>`Direct a ${a.intent} shot on ${a.subject}: motivate the move from the action (beats), choose framing and feel (smooth/snappy/lazy), apply camera.shot in a motion-plan v2 dry-run, check the filmstrip with the camera and the MAI_CAMERA_* findings, then commit.`},
 {name:'preserve-and-express',description:'Change expression or acting while protecting identity channels.',arguments:[{name:'part',description:'Part to act',required:true},{name:'emotion',description:'Emotion or intent',required:true}],
  text:a=>`Make ${a.part} express ${a.emotion} without losing identity: inspect protections (scene.identity), protect what must not change, act with rigid motion, curves and secondary motion first, use expression rigs within budget, and verify with identity.check (world space) plus the filmstrip.`},
 {name:'deliver-for-game',description:'Prepare an animation for the game engine (sprites, loops, budgets).',arguments:[{name:'profile',description:'Delivery profile (game, sprite)'}],
  text:a=>`Deliver this animation for the game (profile ${a.profile??'game'}): context.set purpose game-sprite, make the loop seamless (motion.verify loopSeamless), avoid filters (MAI_CONTEXT_PROFILE), check performance.probe, export standalone and a sprite sheet, and report bytes and frame count.`},
];

/** Completions from live catalogues: operation types, presets, shots, tools, purposes; parts from the live scene. */
export async function complete(ref:{type:string;name?:string;uri?:string},argument:{name:string;value:string},call:Call):Promise<string[]>{
 let pool:string[]=[];const n=argument.name;
 if(n==='type')pool=[...OPERATION_TYPES];else if(n==='name')pool=Object.keys(PRESET_CATALOG);else if(n==='intent')pool=Object.keys(SHOTS);else if(n==='tool')pool=TOOLS.map(t=>t.mcp);else if(n==='purpose'||n==='context')pool=[...PURPOSES];else if(n==='profile')pool=['game','sprite','animation','web','web-light','mobile','icon','high-quality'];
 else if(['ref','part','subject','target'].includes(n)){try{const r=await call('scene.semantics');pool=((r.parts as {address?:string;id:string}[])??[]).flatMap(p=>[p.address??p.id,p.id]);}catch{pool=[];}}
 else if(n==='emotion')pool=['happiness','sadness','anger','fear','surprise','disgust','calm','curiosity'];
 void ref;const v=argument.value.toLowerCase();const unique=[...new Set(pool)];return [...unique.filter(x=>x.toLowerCase().startsWith(v)),...unique.filter(x=>!x.toLowerCase().startsWith(v)&&x.toLowerCase().includes(v))].slice(0,100);}
