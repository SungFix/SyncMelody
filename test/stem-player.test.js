import test from 'node:test';
import assert from 'node:assert/strict';
import {StemPlayer,identifyStem,nextGateDuration,STEM_FILENAMES} from '../stem-player.js';

class Param {
  constructor(){this.value=1;this.events=[];}
  cancelAndHoldAtTime(t){this.events.push(['hold',t]);}
  setValueAtTime(v,t){this.value=v;this.events.push(['set',v,t]);}
  linearRampToValueAtTime(v,t){this.value=v;this.events.push(['ramp',v,t]);}
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

await test('sem acerto nao existe source de audio, acerto emite somente o trecho correto',async()=>{
  const ctx=new Ctx(),player=new StemPlayer(ctx,{});
  for(const part of ['guitar','drums','bass'])
    await player.setFile(part,{size:1024,arrayBuffer:async()=>new ArrayBuffer(8)});
  player.start(3.5);
  assert.equal(ctx.sources.length,0);
  assert.equal(player.hit('unknown',{t:4},[]),false);
  assert.equal(ctx.sources.length,0);
  ctx.currentTime=17.5;
  const note={t:4,lane:0};
  assert.equal(player.hit('guitar',note,[note,{t:4.5}]),true);
  assert.equal(ctx.sources.length,1);
  assert.equal(ctx.sources[0].buffer,player.buffers.get('guitar'));
  assert.ok(Math.abs(ctx.sources[0].started[1]-4.006)<.003);
  assert.ok(ctx.sources[0].started[2]>.1);
  assert.equal(player.hit('guitar',note,[note]),false);
  player.stop();assert.equal(ctx.sources[0].stopped,true);
});
await test('acertos adiantados e atrasados preservam a linha temporal',async()=>{
  const ctx=new Ctx(),player=new StemPlayer(ctx,{});
  for(const part of ['guitar','drums','bass'])
    await player.setFile(part,{size:1024,arrayBuffer:async()=>new ArrayBuffer(8)});
  player.start(3.5);
  ctx.currentTime=15.4;
  assert.equal(player.hit('bass',{t:2},[{t:2}]),true);
  assert.ok(Math.abs(ctx.sources[0].started[0]-15.5)<1e-8);
  ctx.currentTime=17.6;
  assert.equal(player.hit('drums',{t:4},[{t:4}]),true);
  assert.ok(Math.abs(ctx.sources[1].started[1]-4.106)<.003);
});
await test('não aceita gravação com duração diferente',async()=>{
  const ctx=new Ctx();ctx.decodeAudioData=async()=>({duration:120});
  const player=new StemPlayer(ctx,{});
  await assert.rejects(player.setFile('guitar',{size:100,arrayBuffer:async()=>new ArrayBuffer(0)}),/5:40/);
});