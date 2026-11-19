/**
 * Áudio baseado em amostras musicais gravadas (FluidR3 GM, CC BY 3.0)
 * e amostras de bateria (ClueSurf Wavebase, domínio público).
 * Instrumentos melódicos carregados apenas quando necessários.
 * Sem amostras disponíveis, reporta o erro — não disfarça o som como real.
 */
import {instrumentLayouts} from './music.js';

const FONT_NAMES={guitar:'distortion_guitar',bass:'electric_bass_pick',contrabass:'acoustic_bass'};
const FONT_BASE='https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM';
const DRUM_FILES=['kick.wav','snare.wav','hat-closed.wav','hat-opened.wav','tom.wav','ride.wav','tom-2.wav','crash.wav'];
const DRUM_BASE='https://media.githubusercontent.com/media/cluesurf/wavebase/refs/heads/make/base/drum';
const NOTE_NAMES=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const noteNumber=name=>{const m=/^([A-G])(#?)(-?\d+)$/.exec(name);if(!m)return null;
  return (Number(m[3])+1)*12+NOTE_NAMES.indexOf(m[1]+m[2]);};
const rawBase64=uri=>uri.slice(uri.indexOf(',')+1);
function decodeBase64Data(uri){
  const raw=atob(rawBase64(uri)),array=new Uint8Array(raw.length);
  for(let i=0;i<raw.length;i++)array[i]=raw.charCodeAt(i);
  return array.buffer;
}
function loadFontScript(url){
  return new Promise((resolve,reject)=>{
    const tag=document.createElement('script');tag.async=true;tag.src=url;
    tag.onload=()=>resolve();tag.onerror=()=>reject(new Error('Não foi possível carregar o banco de instrumentos. Verifique a conexão.'));
    document.head.appendChild(tag);
  });
}
export class SampleAudioEngine {
  constructor(){this.ctx=null;this.master=null;this.muted=false;this.banks=new Map();this.loading=new Map();this.active=new Set();}
  async unlock(){
    if(!this.ctx){const Context=window.AudioContext||window.webkitAudioContext;
      if(!Context)throw new Error('O navegador não oferece Web Audio.');
      this.ctx=new Context();this.master=this.ctx.createGain();this.master.gain.value=.82;this.master.connect(this.ctx.destination);
    }
    if(this.ctx.state==='suspended')await this.ctx.resume();
  }
  setMuted(value){this.muted=!!value;if(this.ctx)this.master.gain.setTargetAtTime(value?0:.82,this.ctx.currentTime,.025);}
  stopAll(){
    if(!this.ctx)return;
    for(const src of this.active){try{src.stop();}catch{}}
    this.active.clear();
  }
  async prepare(part){
    if(this.banks.has(part))return;
    if(this.loading.has(part))return this.loading.get(part);
    const job=(async()=>{
      await this.unlock();
      if(part==='drums'){
        const files=await Promise.all(DRUM_FILES.map(async file=>{
          const candidate=[`./samples/drums/${file}`,`${DRUM_BASE}/${file}`];
          for(const url of candidate){
            try{
              const response=await fetch(url);if(!response.ok)continue;
              const buffer=await this.ctx.decodeAudioData(await response.arrayBuffer());
              if(buffer.duration>.01)return buffer;
            }catch{}
          }
          return null;
        }));
        if(files.every(item=>!item))throw new Error('Não foi possível carregar as gravações da bateria.');
        this.banks.set(part,{kind:'drums',buffers:files});return;
      }
      const font=FONT_NAMES[part];if(!font)throw new Error('Instrumento desconhecido.');
      window.MIDI=window.MIDI||{};window.MIDI.Soundfont=window.MIDI.Soundfont||{};
      if(!window.MIDI.Soundfont[font]){
        const local=`./samples/soundfonts/${font}-mp3.js`;
        try{await loadFontScript(local);}catch{await loadFontScript(`${FONT_BASE}/${font}-mp3.js`);}
      }
      const data=window.MIDI.Soundfont[font];
      if(!data)throw new Error(`Não foi possível carregar o som de ${part}.`);
      const samples=Object.entries(data).map(([name,uri])=>({pitch:noteNumber(name),uri})).filter(s=>s.pitch!==null&&typeof s.uri==='string');
      if(!samples.length)throw new Error('Banco de áudio vazio.');
      // Decodifica as amostras apenas quando são tocadas, reduzindo o uso de memória.
      this.banks.set(part,{kind:'melodic',samples,decoded:new Map(),decoding:new Map()});
      // Deixa as cordas do modo livre prontas para responder sem atraso.
      await Promise.all(instrumentLayouts[part].notes.map(pitch=>this.getSample(this.banks.get(part),pitch)));
      delete window.MIDI.Soundfont[font];
    })();
    this.loading.set(part,job);
    try{await job;}finally{this.loading.delete(part);}
  }
  async prepareAll(){await Promise.all(['guitar','bass','contrabass','drums'].map(part=>this.prepare(part)));}
  async getSample(bank,pitch){
    let sample=bank.samples.reduce((best,current)=>Math.abs(current.pitch-pitch)<Math.abs(best.pitch-pitch)?current:best,bank.samples[0]);
    if(bank.decoded.has(sample.pitch))return {buffer:bank.decoded.get(sample.pitch),root:sample.pitch};
    if(!bank.decoding.has(sample.pitch)){
      const promise=this.ctx.decodeAudioData(decodeBase64Data(sample.uri)).then(buffer=>{bank.decoded.set(sample.pitch,buffer);return buffer;});
      bank.decoding.set(sample.pitch,promise);
    }
    const buffer=await bank.decoding.get(sample.pitch);
    return {buffer,root:sample.pitch};
  }
  play(part,note,when=null,velocity=1){
    if(!this.ctx||this.ctx.state!=='running')return;
    const bank=this.banks.get(part);if(!bank)return;
    const t=Math.max(this.ctx.currentTime+.005,when??this.ctx.currentTime);
    if(bank.kind==='drums'){
      const buffer=bank.buffers[note.lane%bank.buffers.length];if(buffer)this.emit(buffer,t,Math.min(1,velocity)*.72,1,2.2);
    } else {
      const pitches=part==='guitar'&&note.chord?[note.pitch,note.pitch+7,note.pitch+12]:[note.pitch];
      for(const pitch of pitches){
        this.getSample(bank,pitch).then(({buffer,root})=>{
          // A reprodução só é agendada após a decodificação; nunca toca uma nota atrasada demais.
          const scheduled=when===null?this.ctx.currentTime+.005:t;
          if(scheduled<this.ctx.currentTime-.10)return;
          const rate=2**((pitch-root)/12);
          const duration=note.muted?.22:(part==='guitar'?.9:part==='bass'?1.35:1.7);
          this.emit(buffer,Math.max(this.ctx.currentTime+.005,scheduled),
            Math.min(1,velocity)*(part==='guitar'?.21:.55)/pitches.length,rate,duration);
        }).catch(error=>console.warn('Amostra não decodificada:',error));
      }
    }
  }
  emit(buffer,t,level,rate,maxDuration){
    const src=this.ctx.createBufferSource(),gain=this.ctx.createGain();
    src.buffer=buffer;src.playbackRate.value=rate;
    const actual=Math.min(buffer.duration/rate,maxDuration);
    gain.gain.setValueAtTime(Math.max(.0001,level),t);
    gain.gain.setValueAtTime(Math.max(.0001,level),t+Math.max(.01,actual-.07));
    gain.gain.exponentialRampToValueAtTime(.0001,t+Math.max(.03,actual));
    src.connect(gain);gain.connect(this.master);this.active.add(src);
    src.onended=()=>{this.active.delete(src);src.disconnect();gain.disconnect();};
    src.start(t);src.stop(t+Math.max(.04,actual)+.012);
  }
}
