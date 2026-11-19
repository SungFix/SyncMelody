/**
 * Player das faixas importadas do usuário: conserva o AudioBuffer de cada MP3
 * integral, no tempo original; os ganhos ficam zerados até acertos válidos.
 * Nenhuma amostra é sintetizada ou substituída neste modo.
 */
export const STEM_FILENAMES = Object.freeze({
  guitar:'musicqa-guitarra-PREVIA.mp3',
  drums:'musicqa-bateria-PREVIA.mp3',
  bass:'musicqa-baixo-PREVIA.mp3'
});
export const STEM_PARTS = Object.freeze(['guitar','drums','bass']);
export const STEM_LABELS = Object.freeze({guitar:'Guitarra',drums:'Bateria',bass:'Baixo'});
const PART_TO_STEM = Object.freeze({guitar:'guitar',drums:'drums',bass:'bass',contrabass:'bass'});
const DEFAULT_GATE = Object.freeze({guitar:.60,drums:.23,bass:.43,contrabass:.43});

export function identifyStem(filename){
  const name=String(filename).toLowerCase();
  if(/guitarra|guitar/.test(name))return 'guitar';
  if(/bateria|drums?|percuss/.test(name))return 'drums';
  if(/baixo|bass/.test(name))return 'bass';
  return null;
}

export function nextGateDuration(part, note, samePartNotes){
  let duration=DEFAULT_GATE[part] ?? .35;
  for(const candidate of samePartNotes){
    if(candidate.t <= note.t+.055)continue; // acordes simultâneos
    duration=Math.min(duration,Math.max(.07,candidate.t-note.t-.025));
    break;
  }
  return duration;
}

export class StemPlayer {
  constructor(ctx, destination){
    this.ctx=ctx;
    this.destination=destination;
    this.buffers=new Map();
    this.tracks=new Map();
    this.lastHits=new Map();
  }
  ready(){return STEM_PARTS.every(part=>this.buffers.has(part));}
  status(){return STEM_PARTS.map(part=>({part,ready:this.buffers.has(part)}));}
  async setFile(part,file){
    if(!STEM_PARTS.includes(part))throw new Error('Instrumento inválido.');
    if(!file || file.size > 40*1024*1024)throw new Error('O áudio deve ter até 40 MB.');
    const decoded=await this.ctx.decodeAudioData(await file.arrayBuffer());
    if(Math.abs(decoded.duration-340.24)>3){
      throw new Error(`O arquivo de ${STEM_LABELS[part]} não corresponde à faixa de 5:40.`);
    }
    this.buffers.set(part,decoded);
  }
  async setFiles(files){
    const loaded=[];
    for(const file of files){
      const part=identifyStem(file.name);
      if(!part)throw new Error(`Não reconheci o instrumento de ${file.name}. Use os três arquivos PREVIA.`);
      await this.setFile(part,file);
      loaded.push(part);
    }
    return loaded;
  }
  async loadBundled(fetcher=fetch){
    for(const part of STEM_PARTS){
      if(this.buffers.has(part))continue;
      const response=await fetcher(`./stems/${STEM_FILENAMES[part]}`).catch(()=>null);
      if(!response?.ok)continue;
      const buffer=await this.ctx.decodeAudioData(await response.arrayBuffer());
      if(Math.abs(buffer.duration-340.24)<3)this.buffers.set(part,buffer);
    }
    return this.ready();
  }
  start(secondsToStart){
    this.stop();
    if(!this.ready())throw new Error('Carregue guitarra, bateria e baixo antes de tocar esta faixa.');
    const startDelay=Math.max(.03,secondsToStart);
    const offset=Math.max(0,-secondsToStart);
    const when=this.ctx.currentTime+startDelay;
    for(const part of Object.keys(PART_TO_STEM)){
      const buffer=this.buffers.get(PART_TO_STEM[part]);
      if(offset>=buffer.duration)continue;
      const source=this.ctx.createBufferSource();
      const gain=this.ctx.createGain();
      source.buffer=buffer;
      gain.gain.value=0;
      source.connect(gain);
      gain.connect(this.destination);
      const track={source,gain,when,offset};
      source.onended=()=>{
        if(this.tracks.get(part)===track)this.tracks.delete(part);
        source.disconnect();gain.disconnect();
      };
      source.start(when,offset);
      this.tracks.set(part,track);
    }
  }
  hit(part,note,partNotes){
    const track=this.tracks.get(part);
    if(!track || !note)return false;
    // Uma faixa estéreo da bateria pode conter vários componentes no mesmo instante.
    // Evita disparar mais de uma vez a mesma fatia temporal.
    const last=this.lastHits.get(part);
    if(last!==undefined && Math.abs(last-note.t)<.055)return false;
    this.lastHits.set(part,note.t);
    const duration=nextGateDuration(part,note,partNotes);
    const now=Math.max(this.ctx.currentTime+.004,track.when);
    const envelope=track.gain.gain;
    if(typeof envelope.cancelAndHoldAtTime==='function')envelope.cancelAndHoldAtTime(now);
    else envelope.cancelScheduledValues(now);
    const level=part==='drums'?.85:part==='guitar'?.76:.65;
    envelope.setValueAtTime(Math.max(0,envelope.value),now);
    envelope.linearRampToValueAtTime(level,now+.012);
    envelope.setValueAtTime(level,now+Math.max(.022,duration-.045));
    envelope.linearRampToValueAtTime(0,now+duration);
    return true;
  }
  stop(){
    for(const track of this.tracks.values()){
      try{track.source.stop();}catch{}
      try{track.source.disconnect();track.gain.disconnect();}catch{}
    }
    this.tracks.clear();this.lastHits.clear();
  }
}