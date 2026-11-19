// Todas as músicas e melodias são composições originais criadas para este jogo.
export const instruments = [
  {id:'keys', name:'Teclado', sub:'Acordes cristalinos', symbol:'✦', color:'#AAB1FF', emoji:'🎹'},
  {id:'bass', name:'Baixo', sub:'Graves marcantes', symbol:'◉', color:'#70EBC4', emoji:'🎸'},
  {id:'lead', name:'Synth', sub:'Melodia elétrica', symbol:'⌁', color:'#FF9CD4', emoji:'🎛️'},
  {id:'drums', name:'Bateria', sub:'Ritmo e impacto', symbol:'✳', color:'#FFD17D', emoji:'🥁'}
];
export const songs = [
  {id:'neon-rush', name:'Neon Rush', artist:'SYNCBEAT ORIGINAL', bpm:112, bars:24, root:60, genre:'SYNTH POP', difficulty:2, description:'Luzes, pulso e adrenalina', progression:[0,5,9,7]},
  {id:'pixel-parade', name:'Pixel Parade', artist:'SYNCBEAT ORIGINAL', bpm:138, bars:24, root:62, genre:'ARCADE POP', difficulty:3, description:'Um desfile de notas coloridas', progression:[0,7,5,9]},
  {id:'midnight-drive', name:'Midnight Drive', artist:'SYNCBEAT ORIGINAL', bpm:96, bars:20, root:57, genre:'CHILLWAVE', difficulty:1, description:'Uma viagem sob o céu noturno', progression:[0,5,3,7]}
];
const melodies = {
  'neon-rush': [[0,2,4,7,4,2,7,9],[7,4,2,0,2,4,7,4],[9,7,4,2,4,7,11,9],[7,4,2,4,0,2,4,7]],
  'pixel-parade': [[0,4,7,9,7,4,2,4],[7,9,12,9,7,4,7,9],[5,7,9,12,9,7,5,4],[9,7,4,2,4,7,9,12]],
  'midnight-drive': [[0,2,4,7,4,2,0,2],[5,4,2,0,2,4,5,7],[4,7,9,7,4,2,4,7],[7,4,2,0,2,0,4,2]]
};
function scale(base, degree) {
  const major = [0,2,4,5,7,9,11];
  const octave = Math.floor(degree/7);
  return base + major[((degree%7)+7)%7] + octave*12;
}
export function createChart(songId) {
  const song = songs.find(s => s.id===songId) || songs[0];
  const beat = 60/song.bpm;
  const events = [];
  let id=0;
  const melody=melodies[song.id];
  function put(part, bar, beatAt, lane, pitch, length=0.24) {
    events.push({id:id++, part, t:2*beat+(bar*4+beatAt)*beat, lane, pitch, length});
  }
  for(let bar=0;bar<song.bars;bar++) {
    const root = song.root+song.progression[bar%4];
    const phrase=melody[bar%4];
    const dense=song.id==='pixel-parade';
    // Teclas: arpejos em quatro alturas para oferecer uma partitura rítmica variada.
    for(let b=0;b<4;b++) {
      const lane=[0,2,1,3][(b+bar)%4];
      const pitch=root+[0,4,7,12][lane];
      put('keys',bar,b,lane,pitch,0.44);
      if (dense && b%2===0) put('keys',bar,b+0.5,(lane+1)%4,root+[0,4,7,12][(lane+1)%4],0.18);
    }
    // Baixo: uma linha diferente para acompanhar o refrão.
    for(const [b,lane] of [[0,0],[1.5,2],[2,1],[3.5,2]])
      put('bass',bar,b,lane,root-24+[0,0,7,12][lane],0.35);
    // Synth: pequenas frases de oito colcheias, com pausas nas faixas mais tranquilas.
    for(let k=0;k<8;k++) {
      if(song.id==='midnight-drive' && [1,5].includes(k)) continue;
      if(song.id==='neon-rush' && k===5 && bar%2===0) continue;
      const note=phrase[k];
      put('lead',bar,k*0.5,(note + k)%4,scale(root+12,note),0.20);
    }
    // Bateria: kick, caixa, chimbal e tom nos quatro comandos.
    for(let b=0;b<4;b++) {
      put('drums',bar,b,b===0||b===2?0:1,b===0||b===2?36:38,0.10);
      if (song.id!=='midnight-drive' || b%2===0) put('drums',bar,b+0.5,2,42,0.10);
      if(dense && b===3) put('drums',bar,b+0.75,3,45,0.10);
    }
  }
  events.sort((a,b)=>a.t-b.t || a.id-b.id);
  for(let i=0;i<events.length;i++) events[i].index=i;
  return {song, events, byPart:Object.fromEntries(instruments.map(i => [i.id,events.filter(e=>e.part===i.id)])),
    duration:2*beat+song.bars*4*beat+1.5, beat};
}
