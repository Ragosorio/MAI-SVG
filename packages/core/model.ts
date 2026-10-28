import type {Assertion} from './assertions.js';
import type {Point,Segment} from './geometry.js';
export type Pose={x:number;y:number;rotation:number;scaleX:number;scaleY:number;pivotX:number;pivotY:number};
export const defaultPose=():Pose=>({x:0,y:0,rotation:0,scaleX:1,scaleY:1,pivotX:0,pivotY:0});
// `param` animates a named expression/modifier parameter; target is the parameter name (e.g. sadness, sadness@mouth).
export type Property='x'|'y'|'rotation'|'scaleX'|'scaleY'|'zoom'|'opacity'|'fill'|'stroke'|'d'|'boneRotation'|'boneX'|'boneY'|'meshX'|'meshY'|'param';
export const PROPERTIES:Property[]=['x','y','rotation','scaleX','scaleY','zoom','opacity','fill','stroke','d','boneRotation','boneX','boneY','meshX','meshY','param'];
export type Easing='linear'|'ease-in-out'|'step'|'ease-in'|'ease-out'|'overshoot'|'anticipate'|`cubic-bezier(${string})`;
export type EaseHandle={speed:number;influence:number};
export type Keyframe={time:number;value:number|string;easing:Easing;in?:EaseHandle;out?:EaseHandle;auto?:'auto'|'continuous';roving?:boolean;curve?:string};
export type KeyInput=Omit<Keyframe,'easing'>&{easing?:Easing;hold?:boolean};
// Tracks are unique per target/property/layer. Missing layer means `base` (override).
export type Track={target:string;property:Property;keys:Keyframe[];layer?:string};
export type Layer={id:string;name:string;blend:'override'|'additive';weight:number;mute?:boolean;solo?:boolean;locked?:boolean};
export const DEFAULT_LAYERS:Layer[]=[['base','Base'],['pose','Pose'],['expression','Expresión'],['eyes','Ojos'],['blink','Parpadeo'],['lipsync','Lip sync'],['secondary','Secundario'],['effects','Efectos'],['fluid','Fluidos'],['camera','Cámara']].map(([id,name])=>({id,name,blend:['base','expression','camera'].includes(id)?'override':'additive',weight:1}) as Layer);
export type Marker={id:string;time:number;label:string;kind?:'marker'|'label'|'event'};
export type TimeRegion={id:string;start:number;end:number;label:string;mode?:'loop'|'ping-pong'|'hold'|'note'};
export type Clip={id:string;name:string;start:number;end:number;targets?:string[]};
export type ParamDef={min:number;max:number;default:number;label?:string;group?:string};
export type Bone={id:string;name:string;parentId?:string;rest:Point&{length:number;angle:number};rotation:number;x:number;y:number;minRotation:number;maxRotation:number};
export type Skin={target:string;rest:Segment[];weights:Record<string,number>[]};
export type Mesh={target:string;rows:number;cols:number;rest:Point[];controls:Point[];bounds:{x:number;y:number;width:number;height:number}};
export type Emotion={id:string;name:string;targets:Record<string,{pose?:Partial<Pose>;attrs?:Partial<Record<'d'|'fill'|'stroke'|'opacity',string>>}>};
export type Sprite={id:string;name:string;variants:Record<string,string[]>;initial:string};
// Region in document coordinates, used for extraction, pins, comments and segmentation prompts.
export type Region={kind:'ellipse';cx:number;cy:number;rx:number;ry:number}|{kind:'rect';x:number;y:number;width:number;height:number}|{kind:'polygon';points:Point[]};
// Identity constraints. Several may apply to one node; the strictest rule wins.
export type ProtectionLevel='locked'|'protected'|'deformable'|'style-preserved'|'topology-preserved'|'color-preserved'|'silhouette-preserved'|'free';
export type PreservationMode='strict'|'balanced'|'free';
// Creative envelope (packages/core/envelope.ts): per-channel policy of a part (free | bounded | preserve) + budgets.
export type EnvelopeChannel='rigidTransform'|'deform'|'paint'|'topology'|'effects'|'visibility';
export type CreativeEnvelope=Partial<Record<EnvelopeChannel,'free'|'bounded'|'preserve'>>&{bounds?:{translate?:number;rotation?:number;scale?:number;deform?:number;paint?:number;opacity?:number};transientDeviation?:{allowed:boolean;mustRecover?:boolean;maxDuration?:number;maxPeak?:number};invariants?:string[]};
export type SemanticNode={id:string;role:string;label:string;targets:string[];parent?:string;status:'proposed'|'confirmed'|'rejected';confidence?:number;source:'user'|'agent'|'heuristic';protection?:ProtectionLevel[];reference?:{kind:'snapshot'|'baseline';id:string};landmarks?:Record<string,Point>;region?:Region;notes?:string;envelope?:CreativeEnvelope};
export type SemanticRelation={from:string;to:string;kind:'part-of'|'attached-to'|'emits'|'mirrors'|'left-of'|'right-of'|'above'|'below'|'follows'};
export type Decision={at:string;kind:string;summary:string;ref?:string;source:'user'|'agent'};
export type Displacement={dx:number;dy:number};
// Expression feature: identity-preserving warp of real artwork. Boundary pins stay fixed; landmarks move by additive shape keys.
// curve: per-parameter arch along the feature axis (px at full value, + = middle down): inverts a smile into a frown
// without changing stroke thickness, color or topology. Fades out toward the region boundary.
export type ExpressionFeature={id:string;role:string;node?:string;frozen?:boolean;paths:string[];rest:Record<string,string>;pins:Point[];landmarks:Record<string,Point>;keys:Record<string,Record<string,Displacement>>;size:number;rigid?:Record<string,string[]>;region?:Region;curve?:Record<string,number>};
export type Driver={id:string;param:string;target:string;property:'x'|'y'|'rotation'|'scaleX'|'scaleY'|'opacity'|'d'|'fill';points:[number,number|string][]};
export type ExpressionRig={features:ExpressionFeature[];drivers:Driver[];presets:Record<string,Record<string,number>>};
export type ModifierKind='flow'|'wave'|'bend'|'noise'|'jitter'|'twist'|'inflate'|'taper'|'smooth';
export type FluidPreset='smoke'|'steam'|'fog'|'cloud'|'water'|'wave'|'river'|'rain'|'wind'|'fire'|'lava'|'magic'|'electricity'|'dust'|'snow'|'cloth'|'hair'|'grass';
// Non-destructive modifier stack: rest geometry is retained, evaluation happens per frame and on export.
export type Modifier={id:string;name:string;kind:ModifierKind;enabled:boolean;targets:string[];rest:Record<string,string>;params:Record<string,number>;preset?:FluidPreset;anchor?:Point;direction?:Point;technique?:'geometry'|'filter';filter?:string;bounds?:{x:number;y:number;width:number;height:number}};
// 2.5D camera (packages/core/camera.ts). Tracks/signals on the reserved target `@camera`: x, y (world point looked at), zoom, rotation.
export type CameraConfig={view:{x:number;y:number;width:number;height:number};safeArea?:{action:number;title:number};minZoom?:number;maxZoom?:number;planes?:{id:string;factor:number}[];depth?:{target:string;plane?:string;factor?:number}[];subject?:string};
export type ShotFrame={framing?:'wide'|'medium'|'close-up'|'extreme-close-up';box?:{x:number;y:number;width:number;height:number};zoom?:number;offset?:{x:number;y:number};rotation?:number};
export type CameraShot={intent:'establish'|'reveal'|'follow'|'push-in'|'pull-out'|'pan'|'orbit-2d'|'impact'|'handheld'|'cut';subject?:string;from?:ShotFrame;to?:ShotFrame;start:number;duration?:number;motion?:'smooth'|'snappy'|'lazy'|'linear';intensity?:number;id?:string};
// Motion paths (packages/core/motion-path.ts): a part travels along d by arc length; progress is a keyed curve.
export type MotionPath={id:string;target:string;d:string;points?:{x:number;y:number}[];closed?:boolean;progress:Keyframe[];orient?:{offset:number};anchor:{x:number;y:number};offset?:{x:number;y:number};mode:'absolute'|'relative';layer:string;enabled?:boolean};
// Where/why the animation will be seen (packages/core/context.ts): priors for the agent and the critic, never rules.
// The human's brief as data: musts (testable with assertions) and the creative latitude for the rest (core/direction.ts).
export type Direction={brief:string;musts:{id:string;text:string;assertions?:Assertion[]}[];latitude?:string;source?:'user'|'agent'};
export type ContextManifest={purpose:'ui-icon'|'loading'|'logo'|'hero'|'editorial'|'explainer'|'character-idle'|'character-acting'|'game-sprite'|'social-video'|'sticker'|'ambient'|'custom';placement?:string;viewport?:{width:number;height:number;responsive?:boolean};interaction?:{trigger?:'always'|'hover'|'click'|'scroll'|'event';canReactToPointer?:boolean};loop?:{required?:boolean;shouldFeelNonRepetitive?:boolean};priority?:{subject?:string;faceReadability?:'critical'|'normal'|'low'};performance?:{profile?:string};motionStyle?:{energy?:number;playfulness?:number;cinematic?:number};accessibility?:{reducedMotionVariant?:boolean};notes?:string};
// Effects stack (packages/core/effects.ts): transparent macro over filter.set + signals; echo = <use> ghosts.
export type EffectKind='blur'|'glow'|'shadow'|'saturate'|'hue'|'displace'|'motionSmear'|'echo';
export type EffectSpec={kind:EffectKind;params?:Record<string,number|string>};
export type EffectRecord={id:string;target:string;kinds:EffectKind[];filter?:string;signals:string[];echo?:{count:number;delay:number;falloff:number}};
// Acting beats (packages/core/timing.ts): named phases of a performance, used by the critic, filmstrips and envelopes.
export type BeatKind='anticipation'|'action'|'overshoot'|'settle'|'hold'|'reaction'|'accent';
export type Beat={id:string;kind:BeatKind;start:number;end:number;targets?:string[];intensity?:number;label?:string};
// Procedural signals (packages/core/procedural.ts): deterministic, seeded, loop-aware drivers of one channel on a layer.
export type SignalOutput={target:string;property:'x'|'y'|'rotation'|'scaleX'|'scaleY'|'zoom'|'opacity'|'boneRotation'|'boneX'|'boneY'|'param'|`attr:${string}`;layer:string;component?:0|1;base?:number|[number,number]};
export type SignalEnvelope={start?:number;end?:number;fadeIn?:number;fadeOut?:number;decay?:number;gain?:number;bias?:number;multiplyBy?:string;clamp?:[number,number];ramp?:Keyframe[]};
export type SignalSource=
 |{kind:'noise';frequency:number;amplitude:number;octaves?:number;persistence?:number;seed:number}
 |{kind:'wiggle';frequency:number;amplitude:number;octaves?:number;seed:number}
 |{kind:'oscillator';wave:'sine'|'triangle'|'square'|'saw';period:number;amplitude:number;phase?:number;softness?:number}
 |{kind:'pulse';interval:[number,number];width:number;amplitude:number;seed:number;shape?:'bump'|'attack'}
 |{kind:'blink';interval:[number,number];close:number;hold?:number;open?:number;double?:number;amplitude:number;seed:number}
 |{kind:'drift';amplitude:number;period:number;seed?:number}
 |{kind:'curve';keys:Keyframe[]}
 |{kind:'speed';target:string;axis?:'xy'|'x'|'y'|'rotation';gain:number;max?:number}
 // Expression DSL (packages/core/expr.ts): a safe numeric formula over time, other channels, params and signals.
 |{kind:'expr';expr:string};
export type Signal={id:string;label?:string;enabled?:boolean;output:SignalOutput;source:SignalSource;envelope?:SignalEnvelope};
export type Secondary={id:string;kind:'spring'|'look-at'|'follow';target:string;driver:string;property:'rotation'|'x'|'y';driverProperty?:'x'|'y'|'rotation'|'scaleX'|'scaleY';stiffness:number;damping:number;gain:number;delay:number;limit:number;pivot?:Point;layer?:string};
export type StateMachineInput={name:string;type:'boolean'|'number'|'trigger'|'enum';default:boolean|number|string;options?:string[]};
export type Condition={input:string;op:'=='|'!='|'<'|'<='|'>'|'>='|'set';value?:boolean|number|string};
export type MachineState={id:string;name:string;params?:Record<string,number>;clip?:string;loop?:boolean;speed?:number};
export type Transition={from:string;to:string;conditions:Condition[];duration:number;exitTime?:number};
export type Listener={event:'pointerenter'|'pointerleave'|'pointerdown'|'pointerup'|'pointermove'|'click'|'scroll'|'keydown'|'custom';target?:string;action:{kind:'set'|'fire'|'track-pointer';input:string;value?:boolean|number|string;axis?:'x'|'y'}};
export type StateMachine={inputs:StateMachineInput[];states:MachineState[];transitions:Transition[];initial:string;listeners:Listener[]};
export type ComponentDef={id:string;name:string;master:string;slots:Record<string,string[]>;variants:Record<string,Record<string,Record<string,string>>>};
export type Viseme='rest'|'A'|'E'|'I'|'O'|'U'|'MBP'|'FV'|'L'|'WQ';
// Immutable reference for identity regression: an approved file or a session snapshot, verified by hash.
export type Baseline={id:string;label:string;source:{kind:'file';path:string}|{kind:'snapshot';snapshotId:string};sha256:string;revision:number;approval:'unreviewed'|'human-approved';createdAt:string};
// A board decision lives in the document journal: undo of the transaction also undoes the acceptance.
export type Acceptance={boardId:string;version:number;option:string;label?:string;spec?:Record<string,unknown>;requestId?:string;source:'user-direction'|'editor-choice';text?:string;supersedes?:string;at:string};
export type Project={documentId?:string;baselines?:Baseline[];acceptances?:Acceptance[];identity?:{ids:string[]};version:1;revision:number;name:string;duration:number;fps:number;loop:boolean;emotions:Emotion[];sprites:Sprite[];poses:Record<string,Pose>;baseTransforms:Record<string,string>;baseAttributes:Record<string,Attributes>;tracks:Track[];bones:Bone[];skins:Skin[];meshes:Mesh[];
 params?:Record<string,ParamDef>;layers?:Layer[];markers?:Marker[];regions?:TimeRegion[];clips?:Clip[];
 assertions?:Assertion[];
 signals?:Signal[];
 beats?:Beat[];
 camera?:CameraConfig;
 effects?:EffectRecord[];
 context?:ContextManifest;
 direction?:Direction;
 motionPaths?:MotionPath[];
 semantic?:{nodes:SemanticNode[];relations:SemanticRelation[]};preservation?:PreservationMode;decisions?:Decision[];
 smokeEmitters?:import('./smoke.js').SmokeEmitterConfig[];
 expression?:ExpressionRig;modifiers?:Modifier[];secondary?:Secondary[];stateMachine?:StateMachine;components?:ComponentDef[];visemes?:Partial<Record<Viseme,Record<string,number>>>};
export const newProject=(name='Sin título'):Project=>({version:1,revision:0,name,duration:5,fps:30,loop:true,emotions:[],sprites:[],poses:{},baseTransforms:{},baseAttributes:{},tracks:[],bones:[],skins:[],meshes:[]});
export type Attributes=Record<string,string>;
export type Operation=
 |{type:'fluid.add';config:import('./fluid.js').FluidConfig}
 |{type:'identity.protect';ids:string[]}
 |{type:'identity.release';ids:string[]}
 |{type:'emotion.define';emotion:Emotion}
 |{type:'emotion.update';emotion:Emotion}
 |{type:'emotion.apply';id:string}
 |{type:'emotion.keyframe';id:string;time:number;easing?:Keyframe['easing']}
 |{type:'sprite.define';sprite:Sprite}
 |{type:'sprite.state';id:string;state:string}
 |{type:'sprite.keyframe';id:string;state:string;time:number}

 |{type:'scene.insert';svg:string;id?:string;name:string;x?:number;y?:number;width?:number;height?:number}
 |{type:'track.edit';target:string;property:Property;action:'shift'|'stretch'|'reverse'|'delete'|'pingpong'|'loop'|'scale';amount?:number;layer?:string;start?:number;end?:number}
 |{type:'track.copy';target:string;to:string;property:Property;offset?:number;layer?:string}
 |{type:'motion.preset';id:string;kind:'float'|'spin'|'pulse'|'fade'|'breathe'|'bounce'|'sway'|'idle';amplitude?:number;layer?:string;style?:'classic'|'organic'}
 |{type:'canvas';width:number;height:number}

 |{type:'attributes';id:string;attrs:Attributes}
 |{type:'gradient';id:string;kind:'linear'|'radial';start:string;end:string;axis?:'vertical'|'horizontal';startOpacity?:number;endOpacity?:number}
 |{type:'create';tag:'path'|'rect'|'circle'|'ellipse'|'line'|'polygon'|'g';id?:string;parent?:string;attrs:Attributes}
 |{type:'delete';ids:string[]}
 |{type:'part.prepare';ids:string[];name:string}|{type:'group';ids:string[];id?:string;name:string}
 |{type:'ungroup';id:string}
 |{type:'order';id:string;direction:'front'|'back'|'forward'|'backward'}
 |{type:'rename';id:string;name:string}
 |{type:'lock';id:string;locked:boolean}
 |{type:'pose';id:string;pose:Partial<Pose>}
 |{type:'point.move';id:string;segment:number;point:number;x:number;y:number}
 |{type:'point.add'|'point.remove'|'path.split';id:string;segment:number}
 |{type:'path.close';id:string}|{type:'path.curve';id:string;segment:number}
 |{type:'path.join';ids:[string,string]}
 |{type:'path.simplify';id:string;tolerance:number}
 |{type:'path.boolean';ids:[string,string];operation:'unite'|'subtract'|'intersect'|'exclude'}
 |{type:'keyframe';target:string;property:Property;time:number;value:number|string;easing?:Keyframe['easing'];layer?:string}
 |{type:'keyframe.delete';target:string;property:Property;time:number;layer?:string}
 |{type:'timeline';duration?:number;fps?:number;loop?:boolean}
 // factor>1 speeds up (keys move closer), factor<1 slows down; whole timeline also rescales duration.
 |{type:'timeline.retime';factor:number;start?:number;end?:number}
 |{type:'bone.add';bone:Bone}
 |{type:'bone.pose';id:string;rotation?:number;x?:number;y?:number;minRotation?:number;maxRotation?:number}
 |{type:'bone.ik';tip:string;target:Point;flip?:boolean}
 |{type:'skin.unbind';ids:string[]}
 |{type:'skin.bind';ids:string[];bones:string[]}
 |{type:'skin.weight';id:string;index:number;bone:string;weight:number}
 |{type:'mesh.add';id:string;rows:number;cols:number}
 |{type:'mesh.move';id:string;index:number;x:number;y:number}
 // Semantic scene graph and identity.
 |{type:'semantic.label';node:Omit<SemanticNode,'status'|'source'>&{status?:SemanticNode['status'];source?:SemanticNode['source']}}
 |{type:'semantic.group';id:string;role:string;label:string;children:string[]}
 |{type:'semantic.relate';relation:SemanticRelation}
 |{type:'semantic.unrelate';relation:SemanticRelation}
 |{type:'semantic.protect';id:string;protection:ProtectionLevel[]}|{type:'semantic.envelope';id:string;envelope:CreativeEnvelope|null}
 |{type:'semantic.merge';ids:string[];into:string;label?:string}
 |{type:'semantic.split';id:string;parts:{id:string;label:string;role?:string;targets:string[]}[]}
 |{type:'semantic.confirm'|'semantic.reject'|'semantic.remove';id:string}
 |{type:'landmark.set';node:string;name:string;x:number;y:number}
 |{type:'landmark.delete';node:string;name:string}
 |{type:'preservation';mode:PreservationMode}
 |{type:'motion.path';id:string;target:string;d?:string;points?:{x:number;y:number}[];closed?:boolean;start?:number;end?:number;easing?:Easing;progress?:KeyInput[];orient?:boolean|{offset:number};anchor?:{x:number;y:number}|'center'|'bottom-center'|'pivot';offset?:{x:number;y:number};mode?:'absolute'|'relative';layer?:string}
 |{type:'motion.path.remove';id:string}|{type:'motion.path.bake';id:string;tolerance?:number}
 // Overlap chain: each link springs from the previous link's final motion (compiled into expression signals).
 |{type:'motion.propagate';id:string;driver:{target:string;property?:'x'|'y'|'rotation'|'scaleX'|'scaleY'|'boneRotation'}|{signal:string};links:{target:string;property?:'x'|'y'|'rotation'|'scaleX'|'scaleY'|'boneRotation';stiffness?:number;damping?:number;gain?:number;delay?:number;limit?:number}[];layer?:string;preset?:'tail'|'ears'|'hair'|'cloth'|'antenna'|'accessory'|'plant';mode?:'drag'|'follow';replace?:boolean}
 |{type:'context.set';context:ContextManifest|null}
 |{type:'direction.set';direction:Direction|null}
 |{type:'part.borrow';id:string;parent?:string;svg:string;ids:string[];name?:string;hidden?:boolean;align?:{to:string;anchor?:'center'|'bottom'}}
 |{type:'effect.stack';id:string;target:string;effects:EffectSpec[];replace?:boolean}|{type:'effect.remove';id:string}
 |{type:'camera.set';camera:Partial<CameraConfig>|null}|{type:'camera.depth';target:string;plane?:string;factor?:number|null}
 |{type:'camera.shot';shot:CameraShot}|{type:'camera.fit';targets:string[];padding?:number;time?:number;hold?:boolean;easing?:Easing}
 |{type:'beat.set';beat:Beat}|{type:'beat.delete';id:string}
 |{type:'acting.beat';target:string;property:'x'|'y'|'rotation'|'scaleX'|'scaleY'|'opacity'|'boneRotation'|'boneX'|'boneY'|'param';layer?:string;start:number;duration:number;action:number;rest?:number;anticipation?:number;overshoot?:number;timing?:{anticipation:number;action:number;overshoot:number;settle:number};bounces?:0|1|2;beats?:boolean;id?:string}
 |{type:'signal.add';signal:Signal}|{type:'signal.update';id:string;signal:Partial<Signal>}|{type:'signal.remove';id:string}|{type:'signal.bake';id:string;tolerance?:number}
 |{type:'track.set';target:string;property:Property;layer?:string;keys:KeyInput[]}
 |{type:'key.tangent';target:string;property:Property;layer?:string;time:number;in?:EaseHandle;out?:EaseHandle;auto?:'auto'|'continuous';roving?:boolean;easing?:Easing;hold?:boolean}
 |{type:'curve.custom';target:string;property:Property;layer?:string;time:number;curve:string|null}
 |{type:'curve.inertia';target:string;property:Property;layer?:string;time:number;velocity?:number;to?:number;resistance?:number;tolerance?:number}
 |{type:'motion.assertions';assertions:Assertion[]}
 |{type:'decision.log';decision:Omit<Decision,'at'>}
 |{type:'baseline.add';baseline:Baseline}
 |{type:'choice.accept';acceptance:Omit<Acceptance,'at'>}
 // Copies real artwork inside a region into an editable, alpha-preserving layer and hides the source there.
 |{type:'region.extract';id:string;name:string;source:string;region:Region;alpha?:boolean;clip?:boolean;hideSource?:boolean;margin?:number}
 // Parameters, layers, markers and clips.
 |{type:'param.define';name:string;def:ParamDef}
 |{type:'param.set';params:Record<string,number>;time?:number;layer?:string;easing?:Keyframe['easing']}
 |{type:'layer.set';layer:Layer}
 |{type:'marker.set';marker:Marker}|{type:'marker.delete';id:string}
 |{type:'region.time';region:TimeRegion}|{type:'region.time.delete';id:string}
 |{type:'clip.define';clip:Clip}|{type:'clip.place';clip:string;at:number;speed?:number;reverse?:boolean;pingpong?:boolean;targets?:Record<string,string>;layer?:string}
 // Expression rig.
 |{type:'expression.feature';feature:{id:string;role:string;node?:string;paths:string[];landmarks:Record<string,Point>;region?:Region;pins?:Point[];template?:string;keys?:Record<string,Record<string,Displacement>>;rigid?:Record<string,string[]>}}
 |{type:'expression.key';feature:string;param:string;landmarks:Record<string,Displacement>}
 |{type:'expression.remove';feature:string}
 // Frozen features keep their original geometry whatever the parameters say ("conserva la boca").
 |{type:'expression.freeze';feature:string;frozen:boolean}
 |{type:'expression.driver';driver:Driver}
 |{type:'expression.driver.remove';id:string}
 |{type:'expression.preset';name:string;params:Record<string,number>}
 |{type:'expression.set';params:Record<string,number>;time?:number;layer?:string;easing?:Keyframe['easing'];preset?:string;weight?:number}
 // Modifiers, fluids from existing geometry, secondary motion.
 |{type:'modifier.add';modifier:Omit<Modifier,'rest'|'enabled'|'name'>&{enabled?:boolean;name?:string}}
 |{type:'modifier.update';id:string;params?:Record<string,number>;enabled?:boolean;anchor?:Point;direction?:Point;technique?:'geometry'|'filter';name?:string}
 |{type:'modifier.remove';id:string}
 |{type:'modifier.order';id:string;index:number}
 |{type:'modifier.bake';id:string;samples?:number}
 |{type:'fluid.animate';id:string;targets:string[];preset:FluidPreset;anchor?:Point;direction?:Point;params?:Record<string,number>;technique?:'geometry'|'filter';quality?:'draft'|'balanced'|'high'}
 |{type:'secondary.add';secondary:Secondary}|{type:'secondary.update';id:string;secondary:Partial<Secondary>}|{type:'secondary.remove';id:string}
 |{type:'secondary.bake';id:string;samples?:number}
 // Morph between arbitrary topologies, interactive state machine, components, lip sync.
 |{type:'morph.apply';id:string;to:string;time:number;from?:number;easing?:Keyframe['easing'];layer?:string}
 |{type:'state.input';input:StateMachineInput}|{type:'state.add';state:MachineState}|{type:'state.transition';transition:Transition}|{type:'state.listener';listener:Listener}|{type:'state.initial';id:string}|{type:'state.remove';kind:'input'|'state'|'transition'|'listener';id:string;index?:number}
 |{type:'component.define';id:string;name:string;master:string;slots?:Record<string,string[]>}
 |{type:'component.instance';component:string;id:string;x?:number;y?:number;scale?:number;parent?:string;overrides?:Record<string,string>}
 |{type:'component.override';instance:string;overrides:Record<string,string|null>}
 |{type:'component.variant';component:string;variant:string;slots:Record<string,Record<string,string>>}
 |{type:'viseme.define';viseme:Viseme;params:Record<string,number>}
 |{type:'lipsync';cues:{time:number;viseme:Viseme}[];layer?:string;strength?:number}
 |{type:'filter.set';id:string;target?:string;primitives:FilterPrimitive[]}
 |{type:'filter.remove';id:string};
export type FilterPrimitive={kind:'blur'|'shadow'|'color-matrix'|'turbulence'|'displacement'|'morphology'|'blend'|'composite'|'offset'|'lighting'|'flood'|'merge';attrs:Record<string,string|number>;result?:string;in?:string;in2?:string};
// Runtime list of operation types (kept in sync by tests/agent-surface.test.ts).
export const OPERATION_TYPES=['direction.set','part.borrow','semantic.envelope','motion.propagate','motion.path','motion.path.remove','motion.path.bake','context.set','effect.stack','effect.remove','camera.set','camera.depth','camera.shot','camera.fit','beat.set','beat.delete','acting.beat','signal.add','signal.update','signal.remove','signal.bake','track.set','key.tangent','curve.custom','curve.inertia','motion.assertions','attributes','baseline.add','bone.add','bone.ik','bone.pose','canvas','choice.accept','clip.define','clip.place','component.define','component.instance','component.override','component.variant','create','decision.log','delete','emotion.apply','emotion.define','emotion.keyframe','emotion.update','expression.driver','expression.driver.remove','expression.feature','expression.freeze','expression.key','expression.preset','expression.remove','expression.set','filter.remove','filter.set','fluid.add','fluid.animate','gradient','group','identity.protect','identity.release','keyframe','keyframe.delete','landmark.delete','landmark.set','layer.set','lipsync','lock','marker.delete','marker.set','mesh.add','mesh.move','modifier.add','modifier.bake','modifier.order','modifier.remove','modifier.update','morph.apply','motion.preset','order','param.define','param.set','part.prepare','path.boolean','path.close','path.curve','path.join','path.simplify','path.split','point.add','point.move','point.remove','pose','preservation','region.extract','region.time','region.time.delete','rename','scene.insert','secondary.add','secondary.bake','secondary.remove','secondary.update','semantic.confirm','semantic.group','semantic.label','semantic.merge','semantic.protect','semantic.reject','semantic.relate','semantic.remove','semantic.split','semantic.unrelate','skin.bind','skin.unbind','skin.weight','sprite.define','sprite.keyframe','sprite.state','state.add','state.initial','state.input','state.listener','state.remove','state.transition','timeline','timeline.retime','track.copy','track.edit','ungroup','viseme.define'] as const;
export type Patch={id:string;attrs:Record<string,string|null>};
