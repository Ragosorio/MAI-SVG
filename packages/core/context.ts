// ContextManifest (plan F3): where and why an animation will be seen. It steers by priors — never rules: the critic
// reports deviations as info so the agent can justify them (an artistic choice) or fix them (an oversight).
import type {Project,ContextManifest} from './model.js';
import {PROFILES} from './profiles.js';

export const PURPOSES=['ui-icon','loading','logo','hero','editorial','explainer','character-idle','character-acting','game-sprite','social-video','sticker','ambient','custom'] as const;
export type Priors={durationRange?:[number,number];loop?:'required'|'optional'|'avoid';cameraIntents:string[];energyMax?:number;faceReadability:'critical'|'normal'|'low';deliveryProfile?:string;reducedMotion:boolean;notes:string[]};

const TABLE:Record<string,Omit<Priors,'faceReadability'|'reducedMotion'>&{face?:Priors['faceReadability']}>={
 'ui-icon':{durationRange:[.2,1.2],loop:'avoid',cameraIntents:[],energyMax:.5,deliveryProfile:'icon',notes:['Functional motion: short, clear, ends at rest; one idea at a time.','Readable at 16–48 px: favor transforms over fine deformation.']},
 loading:{durationRange:[.6,2.5],loop:'required',cameraIntents:[],energyMax:.6,deliveryProfile:'web-light',notes:['A steady rhythm that loops invisibly and costs little.']},
 logo:{durationRange:[1,3.5],loop:'avoid',cameraIntents:['reveal','push-in'],energyMax:.8,deliveryProfile:'web',face:'low',notes:['Identity is strict at the end: the final frame equals the original.','Freedom lives in the reveal: order, overshoot, light.']},
 hero:{durationRange:[3,10],loop:'optional',cameraIntents:['establish','reveal','push-in','pan','pull-out'],energyMax:.85,deliveryProfile:'web',notes:['Expressive motion with staging: one focal point at a time, holds to read.']},
 editorial:{durationRange:[3,12],loop:'optional',cameraIntents:['establish','pan','push-in','handheld'],energyMax:.7,deliveryProfile:'web',notes:['Authorial pacing; the camera can carry meaning.']},
 explainer:{durationRange:[4,30],loop:'avoid',cameraIntents:['push-in','pan','cut','pull-out'],energyMax:.6,deliveryProfile:'web',notes:['Guide the eye; hold long enough to understand; motion serves the message.']},
 'character-idle':{durationRange:[2,8],loop:'required',cameraIntents:[],energyMax:.4,deliveryProfile:'animation',face:'critical',notes:['Alive, not busy: breathing, blinks, gaze, delayed ears/tail; the loop must be undetectable.']},
 'character-acting':{durationRange:[1.5,8],loop:'avoid',cameraIntents:['push-in','cut','impact'],energyMax:.9,deliveryProfile:'animation',face:'critical',notes:['Anticipation → action → overshoot → settle; distribute the performance across parts.']},
 'game-sprite':{durationRange:[.5,3],loop:'required',cameraIntents:[],energyMax:.6,deliveryProfile:'game',face:'critical',notes:['Stable silhouette and bounds, clear key poses, no filters (engines rasterize).']},
 'social-video':{durationRange:[3,15],loop:'optional',cameraIntents:['establish','push-in','cut','handheld','impact','pan'],energyMax:1,deliveryProfile:'high-quality',notes:['Hook in the first second; cinematic camera welcome.']},
 sticker:{durationRange:[1,3],loop:'required',cameraIntents:[],energyMax:.9,deliveryProfile:'web-light',notes:['Playful, exaggerated, readable small.']},
 ambient:{durationRange:[4,20],loop:'required',cameraIntents:['handheld'],energyMax:.3,deliveryProfile:'web',face:'low',notes:['Slow and non-repetitive; nothing should demand attention.']},
 custom:{cameraIntents:['establish','reveal','push-in','pull-out','pan','orbit-2d','impact','handheld','cut','follow'],notes:[]},
};

/** Defaults implied by a context. The agent may deviate with a reason. */
export function priors(c:ContextManifest):Priors{const t=TABLE[c.purpose]??TABLE.custom;
 return {durationRange:t.durationRange,loop:c.loop?.required===true?'required':c.loop?.required===false?'avoid':t.loop,cameraIntents:t.cameraIntents,energyMax:c.motionStyle?.energy??t.energyMax,faceReadability:c.priority?.faceReadability??t.face??'normal',
  deliveryProfile:c.performance?.profile??t.deliveryProfile,reducedMotion:c.accessibility?.reducedMotionVariant??(c.purpose==='ui-icon'||c.purpose==='hero'),notes:t.notes};}

export function validateContext(c:ContextManifest|undefined){if(!c)return;if(!(PURPOSES as readonly string[]).includes(c.purpose))throw Error(`Context purpose must be one of ${PURPOSES.join(', ')}`);
 const f=(v:unknown,lo:number,hi:number,w:string)=>{if(v!==undefined&&(typeof v!=='number'||!Number.isFinite(v)||v<lo||v>hi))throw Error(`Context ${w} must be within ${lo}–${hi}`);};
 f(c.viewport?.width,1,1e5,'viewport.width');f(c.viewport?.height,1,1e5,'viewport.height');for(const k of ['energy','playfulness','cinematic'] as const)f(c.motionStyle?.[k],0,1,`motionStyle.${k}`);
 if(c.performance?.profile&&!PROFILES[c.performance.profile])throw Error(`Unknown delivery profile ${c.performance.profile}`);if(c.placement!==undefined&&(typeof c.placement!=='string'||c.placement.length>300))throw Error('Context placement must be ≤300 characters');
 if(c.notes!==undefined&&(typeof c.notes!=='string'||c.notes.length>2000))throw Error('Context notes must be ≤2000 characters');}

/** Deviations from the context priors (info): the agent decides whether they are choices or mistakes. */
export function contextFindings(p:Project){const c=p.context;if(!c)return [];const pr=priors(c),out:{code:string;severity:'info'|'warning';message:string;repair:string}[]=[];
 if(pr.durationRange&&(p.duration<pr.durationRange[0]||p.duration>pr.durationRange[1]))out.push({code:'MAI_CONTEXT_DURATION',severity:'info',message:`Duración ${p.duration} s fuera del rango típico para ${c.purpose} (${pr.durationRange[0]}–${pr.durationRange[1]} s).`,repair:'Ajusta con timeline.set o justifica la elección.'});
 if(pr.loop==='required'&&!p.loop)out.push({code:'MAI_CONTEXT_LOOP',severity:'info',message:`${c.purpose} suele necesitar loop y la línea de tiempo no hace loop.`,repair:'timeline.set loop:true y cierra la costura (auto tangents, señales).'});
 if(pr.loop==='avoid'&&p.loop)out.push({code:'MAI_CONTEXT_LOOP',severity:'info',message:`${c.purpose} suele reproducirse una vez y la línea de tiempo hace loop.`,repair:'timeline.set loop:false si debe terminar en reposo.'});
 const camMoves=p.tracks.some(t=>t.target==='@camera')||(p.signals??[]).some(s=>s.output.target==='@camera');if(camMoves&&!pr.cameraIntents.length)out.push({code:'MAI_CONTEXT_CAMERA',severity:'info',message:`Hay movimiento de cámara en un contexto ${c.purpose}, que normalmente no la usa.`,repair:'Quita la cámara o justifica el plano.'});
 const prof=pr.deliveryProfile?PROFILES[pr.deliveryProfile]:undefined;const filters=(p.effects??[]).filter(e=>e.filter).length+((p.modifiers??[]).filter(m=>m.technique==='filter').length);
 if(prof&&filters>prof.maxFilters)out.push({code:'MAI_CONTEXT_PROFILE',severity:'warning',message:`El perfil ${prof.id} admite ${prof.maxFilters} filtros y la escena usa ${filters}.`,repair:'Quita efectos de filtro u hornéalos; elige otro perfil si el destino lo soporta.'});
 if(pr.reducedMotion)out.push({code:'MAI_CONTEXT_REDUCED_MOTION',severity:'info',message:'Este contexto pide una variante de movimiento reducido.',repair:'Entrega una versión estática o mínima (prefers-reduced-motion).'});
 return out;}
