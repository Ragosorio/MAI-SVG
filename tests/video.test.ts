import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,rm,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import sharp from 'sharp';
import {VectorDocument} from '../packages/core/document.js';
import {renderVideo,videoSchedule} from '../packages/server/video.js';
import {closeRenderer} from '../packages/server/render.js';
const exec=promisify(execFile);

test('video schedule excludes end frame, reports encoded duration and bounds work',()=>{
 assert.deepEqual(videoSchedule(1,{fps:6}).times,[0,1/6,2/6,3/6,4/6,5/6]);
 assert.equal(videoSchedule(1,{end:.55,fps:6}).encodedDuration,4/6);
 assert.throws(()=>videoSchedule(300,{fps:30}),/600/);assert.throws(()=>videoSchedule(1,{start:.8,end:.2}));assert.throws(()=>videoSchedule(1,{width:2048}));
});
test('video renders seeked motion into decodable MP4/WebM and removes intermediate frames',async(t)=>{
 try{await exec('ffmpeg',['-version']);}catch{t.skip('ffmpeg unavailable: no encoder installed by the test');return;}
 const m=new VectorDocument('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80"><rect id="box" x="5" y="10" width="20" height="20" fill="#2255aa"/></svg>');
 m.project.duration=1;m.apply([{type:'keyframe',target:'box',property:'x',time:0,value:0},{type:'keyframe',target:'box',property:'x',time:1,value:80}]);
 const dir=await mkdtemp(join(tmpdir(),'mai-video-test-')),before=m.toSVG();
 try{for(const format of ['mp4','webm'] as const){const r=await renderVideo(m,dir,{fps:6,width:120,format});assert.equal(r.frames,6);assert.equal(r.source,'export');assert.equal(r.encoder,'ffmpeg');
   // Decode all frames: checks the encoded file, not just the encoder's exit status.
   const decoded=await exec('ffmpeg',['-v','error','-i',r.path,'-f','rawvideo','-pix_fmt','rgb24','pipe:1'],{encoding:'buffer',maxBuffer:2_000_000});
   const size=r.width*r.height*3;assert.equal(decoded.stdout.length,size*6);assert.notDeepEqual(decoded.stdout.subarray(0,size),decoded.stdout.subarray(size*5,size*6));
   const poster=await sharp(r.posterPath).metadata();assert.ok(poster.width!>120);
  }
  assert.ok((await readdir(dir)).every(f=>!f.startsWith('video-frames-')));assert.equal(m.toSVG(),before);
 }finally{await closeRenderer();await rm(dir,{recursive:true,force:true});}
});
test('video background: auto keeps white art visible on gray, explicit color is honored, bad color is rejected',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'mai-video-bg-'));
 const m=new VectorDocument('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle id="c" cx="32" cy="32" r="20" fill="#ffffff"/></svg>');m.project.duration=.5;
 try{const auto=await renderVideo(m,dir,{fps:6,width:64});assert.equal(auto.background,'#c8d0d8');
  const dark=await renderVideo(m,dir,{fps:6,width:64,background:'#102030'});assert.equal(dark.background,'#102030');
  await assert.rejects(renderVideo(m,dir,{fps:6,width:64,background:'red'}),/background/);
  const ink=new VectorDocument('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle id="c" cx="32" cy="32" r="20" fill="#202020"/></svg>');ink.project.duration=.5;assert.equal((await renderVideo(ink,dir,{fps:6,width:64})).background,'#ffffff');
 }finally{await closeRenderer();await rm(dir,{recursive:true,force:true});}});
