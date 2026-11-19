/**
 * Player de musica continua: fontes sincronizadas na gravacao original, com ganhos
 * em silencio ate o primeiro acerto e fades suaves entre erros/acertos.
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
const DEFAULT_GATE = Object.freeze({guitar:2.6,drums:2.6,bass:2.6,contrabass:2.6});
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
    this.buffers=new Map();this.tracks=new Map();this.lastHits=new Map();
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
    const now=this.ctx.currentTime;
    this.origin=now+Number(secondsToStart||0);
    try{
      // Uma fonte para cada um dos quatro instrumentos: reproduz o MP3 inteiro,
      // no tempo original, mas em SILENCIO ate um acerto correto.
      for(const [part,stem] of Object.entries(PART_TO_STEM)){
        const buffer=this.buffers.get(stem);
        const when=Math.max(this.origin,now+.01);
        const offset=Math.max(0,when-this.origin);
        if(offset>=buffer.duration)continue;
        const source=this.ctx.createBufferSource();
        const envelope=this.ctx.createGain();
        source.buffer=buffer;
        envelope.gain.setValueAtTime(0,now);
        source.connect(envelope);envelope.connect(this.destination);
        const track={source,envelope,part};
        this.tracks.set(part,track);
        source.onended=()=>{
          if(this.tracks.get(part)===track)this.tracks.delete(part);
          try{source.disconnect();envelope.disconnect();}catch{}
        };
        source.start(when,offset);
      }
      this.started=true;
    }catch(error){this.stop();throw error;}
  }
  hit(part,note){
    if(!this.started||!note||!Object.hasOwn(PART_TO_STEM,part))return false;
    const track=this.tracks.get(part),buffer=this.buffers.get(PART_TO_STEM[part]);
    if(!track||!buffer||!Number.isFinite(note.t)||note.t<0)return false;
    const prior=this.lastHits.get(part);
    if(prior!==undefined&&Math.abs(prior-note.t)<.055)return false;
    const when=Math.max(this.ctx.currentTime+.006,this.origin+note.t);
    if(when-this.origin<0||when-this.origin>=buffer.duration)return false;
    const gain=track.envelope.gain;
    // Mantem a amplitude atual: sem cliques e sem reinicio entre notas.
    if(typeof gain.cancelAndHoldAtTime==='function')gain.cancelAndHoldAtTime(when);
    else {gain.cancelScheduledValues(when);gain.setValueAtTime(gain.value,when);}
    gain.setTargetAtTime(LEVELS[part],when,.028);
    // Acertos consecutivos cancelam o fade programado e prolongam o riff.
    // Somente apos 2,6 segundos sem acerto ocorre uma saida suave.
    gain.setTargetAtTime(0,Math.min(this.origin+buffer.duration,when+2.6),.27);
    this.lastHits.set(part,note.t);
    return true;
  }
  miss(part,note){
    if(!this.started||!Object.hasOwn(PART_TO_STEM,part))return false;
    const track=this.tracks.get(part);
    if(!track)return false;
    const last=this.lastHits.get(part);
    // Um acerto em um acorde nao deve ser anulado por uma nota simultanea perdida.
    if(Number.isFinite(note?.t)&&last!==undefined&&note.t<=last+.055)return false;
    const when=this.ctx.currentTime+.006;
    const gain=track.envelope.gain;
    if(typeof gain.cancelAndHoldAtTime==='function')gain.cancelAndHoldAtTime(when);
    else {gain.cancelScheduledValues(when);gain.setValueAtTime(gain.value,when);}
    gain.setTargetAtTime(0,when,.15);
    return true;
  }
  stop(){
    for(const {source,envelope} of this.tracks.values()){
      try{source.stop();}catch{}
      try{source.disconnect();envelope.disconnect();}catch{}
    }
    this.tracks.clear();this.lastHits.clear();this.started=false;
  }
}
