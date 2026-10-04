import type {Point,Segment} from './geometry.js';
export type Pose={x:number;y:number;rotation:number;scaleX:number;scaleY:number;pivotX:number;pivotY:number};
export const defaultPose=():Pose=>({x:0,y:0,rotation:0,scaleX:1,scaleY:1,pivotX:0,pivotY:0});
export type Property='x'|'y'|'rotation'|'scaleX'|'scaleY'|'opacity'|'fill'|'stroke'|'d'|'boneRotation'|'boneX'|'boneY'|'meshX'|'meshY';
export type Keyframe={time:number;value:number|string;easing:'linear'|'ease-in-out'|'step'};
export type Track={target:string;property:Property;keys:Keyframe[]};
export type Bone={id:string;name:string;parentId?:string;rest:Point&{length:number;angle:number};rotation:number;x:number;y:number;minRotation:number;maxRotation:number};
export type Skin={target:string;rest:Segment[];weights:Record<string,number>[]};
export type Mesh={target:string;rows:number;cols:number;rest:Point[];controls:Point[];bounds:{x:number;y:number;width:number;height:number}};
export type Emotion={id:string;name:string;targets:Record<string,{pose?:Partial<Pose>;attrs?:Partial<Record<'d'|'fill'|'stroke'|'opacity',string>>}>};
export type Sprite={id:string;name:string;variants:Record<string,string[]>;initial:string};
export type Project={identity?:{ids:string[]};version:1;revision:number;name:string;duration:number;fps:number;loop:boolean;emotions:Emotion[];sprites:Sprite[];poses:Record<string,Pose>;baseTransforms:Record<string,string>;baseAttributes:Record<string,Attributes>;tracks:Track[];bones:Bone[];skins:Skin[];meshes:Mesh[]};
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
 |{type:'track.edit';target:string;property:Property;action:'shift'|'stretch'|'reverse'|'delete';amount?:number}
 |{type:'track.copy';target:string;to:string;property:Property;offset?:number}
 |{type:'motion.preset';id:string;kind:'float'|'spin'|'pulse'|'fade';amplitude?:number}
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
 |{type:'path.boolean';ids:[string,string];operation:'unite'|'subtract'|'intersect'}
 |{type:'keyframe';target:string;property:Property;time:number;value:number|string;easing?:Keyframe['easing']}
 |{type:'keyframe.delete';target:string;property:Property;time:number}
 |{type:'timeline';duration?:number;fps?:number;loop?:boolean}
 |{type:'bone.add';bone:Bone}
 |{type:'bone.pose';id:string;rotation?:number;x?:number;y?:number;minRotation?:number;maxRotation?:number}
 |{type:'bone.ik';tip:string;target:Point;flip?:boolean}
 |{type:'skin.unbind';ids:string[]}
 |{type:'skin.bind';ids:string[];bones:string[]}
 |{type:'skin.weight';id:string;index:number;bone:string;weight:number}
 |{type:'mesh.add';id:string;rows:number;cols:number}
 |{type:'mesh.move';id:string;index:number;x:number;y:number};
export type Patch={id:string;attrs:Record<string,string|null>};
