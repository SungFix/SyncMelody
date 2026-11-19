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
const DEFAULT_GATE = Object.freeze({guitar:.61,drums:.25,bass:.48,contrabass:.56});
const LEVELS = Object.freeze({guitar:.96,drums:1,bass:.9,contrabass:.70});

export function identifyStem(filename){
  const name=String(filename).toLowerCase();
  if(/guitarra|guitar/.test(name))return 'guitar';
  if(/bateria|drums?|percuss/.test(name))return 'drums';
  if(/baixo|bass/.test(name))return 'bass';
  return null;
}

export function nextGateDuration(part, note, samePartNotes=[]){
  let duration=DEFAULT_GATE[part] ?? .4;
  for(const candidate of samePartNotes){
    if(candidate.t <= note.t+.055)continue; // acordes simultâneos
    duration=Math.min(duration,Math.max(.095,candidate.t-note.t-.018));
    break;
  }
  return duration;
}


export class StemPlayer {
  constructor(ctx,destination){
    this.ctx=ctx;this.destination=destination;
    this.buffers=new Map();this.active=new Set();this.lastHits=new Map();
    this.started=false;this.origin=0;this.loadJobs=new Map();
  }
  ready(){return STEM_PARTS.every(p=>this.buffers.has(p));}
  has(part){return this.buffers.has(PART_TO_STEM[part]);}
  status(){return STEM_PARTS.map(part=>({part,ready:this.buffers.has(part)}));}
  async setFile(part,file){
    if(!STEM_PARTS.includes(part))throw Error('Instrumento inválido.');
    if(!file||file.size>45*1024*1024)throw Error('O MP3 deve ter até 45 MB.');
    if(this.loadJobs.has(part))await this.loadJobs.get(part);
    const job=(async()=>{
      const buffer=await this.ctx.decodeAudioData(await file.arrayBuffer());
      if(Math.abs(buffer.duration-340.24)>3)throw Error(`O áudio de ${STEM_LABELS[part]} não corresponde à gravação de 5:40.`);
      this.buffers.set(part,buffer);return buffer;
    })();
    this.loadJobs.set(part,job);
    try{return await job;}finally{if(this.loadJobs.get(part)===job)this.loadJobs.delete(part);}
  }
  async setFiles(files){
    const loaded=[];
    for(const file of files){
      const part=identifyStem(file.name);
      if(!part)throw Error(`Não reconheci ${file.name}. Escolha a faixa no campo específico de cada instrumento.`);
      await this.setFile(part,file);loaded.push(part);
    }
    return loaded;
  }
  async loadBundled(fetcher=fetch){
    for(const part of STEM_PARTS){
      if(this.has(part))continue;
      try{
        const response=await fetcher(`./stems/${STEM_FILENAMES[part]}`);
        if(!response?.ok)continue;
        const buffer=await this.ctx.decodeAudioData(await response.arrayBuffer());
        if(Math.abs(buffer.duration-340.24)<3)this.buffers.set(part,buffer);
      }catch{}
    }
    return this.ready();
  }
  start(secondsToStart){
    this.stop();
    if(!this.ready())throw Error('Carregue guitarra, bateria e baixo para tocar a música.');
    this.origin=this.ctx.currentTime+secondsToStart;
    this.started=true;
  }
  hit(part,note,partNotes=[]){
    if(!this.started||!note||!Object.hasOwn(PART_TO_STEM,part))return false;
    const buffer=this.buffers.get(PART_TO_STEM[part]);
    if(!buffer||!Number.isFinite(note.t)||note.t<0)return false;
    const prior=this.lastHits.get(part);
    if(prior!==undefined&&Math.abs(prior-note.t)<.055)return false;
    const t=this.ctx.currentTime;
    const target=this.origin+note.t;
    const when=Math.max(t+.006,target);
    const offset=when-this.origin;
    if(offset>=buffer.duration||offset<0)return false;
    const base=nextGateDuration(part,note,partNotes);
    const late=Math.max(0,when-target);
    const duration=Math.min(buffer.duration-offset,Math.max(.085,base-late));
    if(duration<=.018)return false;
    const source=this.ctx.createBufferSource();
    const envelope=this.ctx.createGain();
    source.buffer=buffer;
    const level=LEVELS[part];
    const attack=Math.min(.012,duration*.15);
    const release=Math.min(part==='drums'?.045:.075,duration*.24);
    envelope.gain.setValueAtTime(0,when);
    envelope.gain.linearRampToValueAtTime(level,when+attack);
    envelope.gain.setValueAtTime(level,when+Math.max(attack,duration-release));
    envelope.gain.linearRampToValueAtTime(0,when+duration);
    source.connect(envelope);envelope.connect(this.destination);
    const voice={source,envelope};this.active.add(voice);
    source.onended=()=>{this.active.delete(voice);try{source.disconnect();envelope.disconnect();}catch{}};
    try{source.start(when,offset,duration);}catch(err){
      this.active.delete(voice);source.disconnect();envelope.disconnect();throw err;
    }
    this.lastHits.set(part,note.t);
    return true;
  }
  stop(){
    for(const {source,envelope} of this.active){
      try{source.stop();}catch{}
      try{source.disconnect();envelope.disconnect();}catch{}
    }
    this.active.clear();this.lastHits.clear();this.started=false;
  }
}
