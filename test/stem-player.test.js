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
  start(t,offset){this.started=[t,offset];}stop(){this.stopped=true;}}
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
await test('o áudio inicia completamente MUDO e só o instrumento acertado abre volume',async()=>{
  const ctx=new Ctx(),player=new StemPlayer(ctx,{});
  for(const part of ['guitar','drums','bass'])await player.setFile(part,{size:1024,arrayBuffer:async()=>new ArrayBuffer(8)});
  assert.equal(player.ready(),true);
  player.start(3.5);
  assert.equal(ctx.sources.length,4); // contrabaixo divide a gravação de baixo
  assert.ok(ctx.sources.every(source=>source.started[0]===13.5));
  assert.ok(ctx.gains.every(node=>node.gain.value===0));
  const bassGain=player.tracks.get('bass').gain.gain;
  const guitarGain=player.tracks.get('guitar').gain.gain;
  const note={t:45.5,lane:1};
  assert.equal(player.hit('guitar',note,[note,{t:46.2}]),true);
  assert.ok(guitarGain.events.some(e=>e[0]==='ramp'&&e[1]>.5));
  assert.equal(bassGain.events.length,0);
  assert.equal(player.hit('guitar',note,[note,{t:46.2}]),false); // evita duplicar acordes
  assert.equal(player.hit('unknown',note,[note]),false);
  assert.ok(Math.abs(nextGateDuration('guitar',note,[note,{t:45.85}])-.325)<1e-9);
  player.stop();assert.ok(ctx.sources.every(s=>s.stopped));
});
await test('não aceita gravação com duração diferente',async()=>{
  const ctx=new Ctx();ctx.decodeAudioData=async()=>({duration:120});
  const player=new StemPlayer(ctx,{});
  await assert.rejects(player.setFile('guitar',{size:100,arrayBuffer:async()=>new ArrayBuffer(0)}),/5:40/);
});