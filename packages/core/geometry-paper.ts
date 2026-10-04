import paper from 'paper';
let ready=false;function setup(){if(!ready){paper.setup(new paper.Size(700,700));ready=true;}}
export function simplifyPath(d:string,tolerance=1){setup();const p=new paper.CompoundPath({pathData:d,insert:false});try{for(const child of p.children as paper.Path[])child.simplify(tolerance);return p.pathData;}finally{p.remove();}}
export function booleanPaths(a:string,b:string,operation:'unite'|'subtract'|'intersect'){setup();const x=new paper.CompoundPath({pathData:a,insert:false}),y=new paper.CompoundPath({pathData:b,insert:false});try{const r=x[operation](y,{insert:false});const d=r.pathData;r.remove();return d;}finally{x.remove();y.remove();}}
