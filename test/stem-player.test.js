import test from 'node:test';
import assert from 'node:assert/strict';
import {StemPlayer,identifyStem,nextGateDuration,STEM_FILENAMES} from '../stem-player.js';

class Param {
  constructor(){this.value=1;this.events=[];}
  cancelAndHoldAtTime(t){this.events.push(['hold',t]);}
  setValueAtTime(v,t){this.value=v;this.events.push(['set',v,t]);}
  linearRampToValueAtTime(v,t){this.value=v;this.events.push(['ramp',v,t]);}
  setTargetAtTime(v,t,tau){this.events.push(['target',v,t,tau]);}
}
class Gain {constructor(){this.gain=new Param();}connect(x){this.to=x;}disconnect(){this.to=null;}}
class Source {constructor(){this.onended=null;this.started=false;this.stopped=false;}
  connect(g){this.to=g;}disconnect(){this.to=null;}
  start(t,offset,duration){this.started=[t,offset,duration];}stop(){this.stopped=true;}}
class Ctx {
  constructor(){this.currentTime=10;this.sources=[];this.gains=[];}
  createBufferSource(){const s=new Source();this.sources.push(s);return s;}
  createGain(){const g=new Gain();this.gains.push(g);return g;}
  async decodeAudioData(){return {duration:340.244898};}
}

await test('nomes originais e mapa de controles preservados',()=>{
  assert.equal(identifyStem('musicqa-guitarra-PREVIA.mp3'),'guitar');
  assert.equal(identifyStem('musicqa-bateria-PREVIA.mp3'),'drums');
  assert.equal(identifyStem('musicqa-baixo-PREVIA.mp3'),'bass');
  assert.equal(identifyStem('musicqa.mp3'),null);
  assert.equal(Object.keys(STEM_FILENAMES).length,3);
});


await test('trilhas sincronizadas começam mudas sem nenhum acerto',async()=>{
  const ctx=new Ctx(),player=new StemPlayer(ctx,{});
  for(const part of ['guitar','drums','bass'])await player.setFile(part,{size:1024,arrayBuffer:async()=>new ArrayBuffer(8)});
  player.start(3.5);
  assert.equal(ctx.sources.length,4);
  assert.ok(ctx.sources.every(src=>src.started[0]===13.5&&src.started[1]===0));
  assert.ok(ctx.gains.every(g=>g.gain.events.every(e=>e[0]==='set'&&e[1]===0)));
  assert.equal(ctx.sources[3].buffer,player.buffers.get('bass'));
  player.stop();assert.ok(ctx.sources.every(s=>s.stopped));
});
await test('acertos consecutivos mantêm a mesma reprodução, sem cortar o MP3',async()=>{
  const ctx=new Ctx(),player=new StemPlayer(ctx,{});
  for(const part of ['guitar','drums','bass'])await player.setFile(part,{size:1024,arrayBuffer:async()=>new ArrayBuffer(8)});
  player.start(0);
  ctx.currentTime=14;
  assert.equal(player.hit('guitar',{t:4}),true);
  assert.equal(player.hit('guitar',{t:4}),false);
  ctx.currentTime=14.45;
  assert.equal(player.hit('guitar',{t:4.4}),true);
  assert.equal(ctx.sources.length,4);
  const param=player.tracks.get('guitar').envelope.gain;
  assert.equal(param.events.filter(e=>e[0]==='hold').length,2);
  assert.equal(param.events.filter(e=>e[0]==='target'&&e[1]>0).length,2);
  assert.ok(ctx.gains.filter(g=>g.gain.events.some(e=>e[0]==='target'&&e[1]>0)).length===1);
});
await test('um erro faz fade suave e o acerto posterior restaura o audio',async()=>{
  const ctx=new Ctx(),player=new StemPlayer(ctx,{});
  for(const part of ['guitar','drums','bass'])await player.setFile(part,{size:1024,arrayBuffer:async()=>new ArrayBuffer(8)});
  player.start(0);
  ctx.currentTime=12;
  player.hit('bass',{t:2});
  ctx.currentTime=12.6;
  assert.equal(player.miss('bass',{t:2.5}),true);
  let param=player.tracks.get('bass').envelope.gain;
  assert.deepEqual(param.events.at(-1).slice(0,2),['target',0]);
  ctx.currentTime=13.1;
  assert.equal(player.hit('bass',{t:3}),true);
  assert.equal(ctx.sources.length,4);
  assert.ok(param.events.at(-2)[1]>.5);
  player.stop();
});
await test('evento tardio não desloca a linha do tempo',async()=>{
  const ctx=new Ctx(),player=new StemPlayer(ctx,{});
  for(const part of ['guitar','drums','bass'])await player.setFile(part,{size:1024,arrayBuffer:async()=>new ArrayBuffer(8)});
  player.start(-3);
  assert.ok(ctx.sources.every(s=>Math.abs(s.started[1]-3.01)<.001));
  ctx.currentTime=10.5;
  assert.equal(player.hit('drums',{t:3.4}),true);
  assert.equal(ctx.sources.length,4);
});
await test('não aceita gravação com duração diferente',async()=>{
  const ctx=new Ctx();ctx.decodeAudioData=async()=>({duration:120});
  const player=new StemPlayer(ctx,{});
  await assert.rejects(player.setFile('guitar',{size:100,arrayBuffer:async()=>new ArrayBuffer(0)}),/5:40/);
});