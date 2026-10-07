import type {Point,Segment} from './geometry.js';
export type Pose={x:number;y:number;rotation:number;scaleX:number;scaleY:number;pivotX:number;pivotY:number};
export const defaultPose=():Pose=>({x:0,y:0,rotation:0,scaleX:1,scaleY:1,pivotX:0,pivotY:0});
// `param` animates a named expression/modifier parameter; target is the parameter name (e.g. sadness, sadness@mouth).
export type Property='x'|'y'|'rotation'|'scaleX'|'scaleY'|'opacity'|'fill'|'stroke'|'d'|'boneRotation'|'boneX'|'boneY'|'meshX'|'meshY'|'param';
export const PROPERTIES:Property[]=['x','y','rotation','scaleX','scaleY','opacity','fill','stroke','d','boneRotation','boneX','boneY','meshX','meshY','param'];
export type Easing='linear'|'ease-in-out'|'step'|'ease-in'|'ease-out'|'overshoot'|'anticipate'|`cubic-bezier(${string})`;
export type Keyframe={time:number;value:number|string;easing:Easing};
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
export type SemanticNode={id:string;role:string;label:string;targets:string[];parent?:string;status:'proposed'|'confirmed'|'rejected';confidence?:number;source:'user'|'agent'|'heuristic';protection?:ProtectionLevel[];reference?:{kind:'snapshot'|'baseline';id:string};landmarks?:Record<string,Point>;region?:Region;notes?:string};
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
 |{type:'motion.preset';id:string;kind:'float'|'spin'|'pulse'|'fade'|'breathe'|'bounce'|'sway';amplitude?:number;layer?:string}
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
 |{type:'semantic.protect';id:string;protection:ProtectionLevel[]}
 |{type:'semantic.merge';ids:string[];into:string;label?:string}
 |{type:'semantic.split';id:string;parts:{id:string;label:string;role?:string;targets:string[]}[]}
 |{type:'semantic.confirm'|'semantic.reject'|'semantic.remove';id:string}
 |{type:'landmark.set';node:string;name:string;x:number;y:number}
 |{type:'landmark.delete';node:string;name:string}
 |{type:'preservation';mode:PreservationMode}
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
export const OPERATION_TYPES=['attributes','baseline.add','bone.add','bone.ik','bone.pose','canvas','choice.accept','clip.define','clip.place','component.define','component.instance','component.override','component.variant','create','decision.log','delete','emotion.apply','emotion.define','emotion.keyframe','emotion.update','expression.driver','expression.driver.remove','expression.feature','expression.freeze','expression.key','expression.preset','expression.remove','expression.set','filter.remove','filter.set','fluid.add','fluid.animate','gradient','group','identity.protect','identity.release','keyframe','keyframe.delete','landmark.delete','landmark.set','layer.set','lipsync','lock','marker.delete','marker.set','mesh.add','mesh.move','modifier.add','modifier.bake','modifier.order','modifier.remove','modifier.update','morph.apply','motion.preset','order','param.define','param.set','part.prepare','path.boolean','path.close','path.curve','path.join','path.simplify','path.split','point.add','point.move','point.remove','pose','preservation','region.extract','region.time','region.time.delete','rename','scene.insert','secondary.add','secondary.bake','secondary.remove','secondary.update','semantic.confirm','semantic.group','semantic.label','semantic.merge','semantic.protect','semantic.reject','semantic.relate','semantic.remove','semantic.split','semantic.unrelate','skin.bind','skin.unbind','skin.weight','sprite.define','sprite.keyframe','sprite.state','state.add','state.initial','state.input','state.listener','state.remove','state.transition','timeline','timeline.retime','track.copy','track.edit','ungroup','viseme.define'] as const;
export type Patch={id:string;attrs:Record<string,string|null>};
