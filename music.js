/**
 * SyncMelody Rock Edition — partituras e músicas 100% originais.
 * Nenhuma melodia, riff ou gravação comercial é reproduzida.
 * Os quatro músicos tocam partes diferentes do mesmo arranjo.
 */
export const instruments = [
  {id:'guitar', name:'Guitarra', sub:'Riffs e power chords', symbol:'⚡', color:'#FF916D', emoji:'🎸'},
  {id:'drums', name:'Bateria', sub:'Bumbo, caixa e pratos', symbol:'✳', color:'#FFD17D', emoji:'🥁'},
  {id:'bass', name:'Baixo elétrico', sub:'Groove com palhetada', symbol:'◉', color:'#70EBC4', emoji:'🎸'},
  {id:'contrabass', name:'Contrabaixo', sub:'Graves acústicos profundos', symbol:'♩', color:'#B4A4FF', emoji:'🎻'}
];

// Controles adaptados ao instrumento — também usados no modo livre.
// Os números indicam notas MIDI reais de cordas soltas e os nomes das peças.
export const instrumentLayouts = {
  guitar: {keys:['KeyA','KeyS','KeyD','KeyJ','KeyK','KeyL'], notes:[40,45,50,55,59,64],
    names:['Mi grave','Lá','Ré','Sol','Si','Mi agudo']},
  drums: {keys:['KeyA','KeyS','KeyD','KeyF','KeyJ','KeyK','KeyL','Semicolon'], notes:[36,38,42,46,45,51,41,49],
    names:['Bumbo','Caixa','Chimbal fechado','Chimbal aberto','Tom alto','Prato ride','Tom grave','Crash']},
  bass: {keys:['KeyA','KeyS','KeyD','KeyJ','KeyK'], notes:[35,40,45,50,55],
    names:['Si grave','Mi','Lá','Ré','Sol']},
  contrabass: {keys:['KeyA','KeyS','KeyJ','KeyK'], notes:[28,33,38,43],
    names:['Mi','Lá','Ré','Sol']}
};
export const keyLabel = code => code==='Semicolon'?';':code.replace(/^Key/,'');

// Progressões em semitons; os nomes e arranjos são criados para este jogo.
export const songs = [
  {id:'fogo-na-garagem', name:'Fogo na Garagem', artist:'SYNCMelody Original', bpm:108, bars:24, root:52,
    genre:'GRUNGE ROCK', difficulty:2, description:'Guitarras sujas, refrão forte e batida de garagem', progression:[0,3,8,5], style:'grunge'},
  {id:'marcha-de-aco', name:'Marcha de Aço', artist:'SYNCMelody Original', bpm:156, bars:28, root:52,
    genre:'THRASH METAL', difficulty:3, description:'Riffs rápidos e bateria acelerada', progression:[0,0,3,5], style:'metal'},
  {id:'ecos-do-asfalto', name:'Ecos do Asfalto', artist:'SYNCMelody Original', bpm:92, bars:24, root:50,
    genre:'ROCK ALTERNATIVO', difficulty:1, description:'Clima melancólico, peso e espaço para tocar', progression:[0,8,3,5], style:'alternative'},
  {id:'ceu-em-ruinas', name:'Céu em Ruínas', artist:'SYNCMelody Original', bpm:124, bars:24, root:55,
    genre:'HARD ROCK', difficulty:2, description:'Refrão de arena e riffs marcantes', progression:[0,5,10,7], style:'hardrock'}
];

const riffs = {
  grunge: [0,0,3,5,7,5,3,0],
  metal: [0,0,0,3,0,5,3,0],
  alternative: [0,3,5,3,0,7,5,3],
  hardrock: [0,5,7,10,7,5,3,0]
};

export function createChart(songId) {
  const song = songs.find(track => track.id === songId) || songs[0];
  const beat = 60 / song.bpm;
  const events = [];
  let eventId = 0;
  const heavy = song.style === 'metal';
  const relaxed = song.style === 'alternative';

  function put(part, bar, beatAt, lane, pitch, length = .25, options = {}) {
    events.push({id:eventId++, part, t:2*beat+(bar*4+beatAt)*beat,
      lane: lane % instrumentLayouts[part].keys.length, pitch, length, ...options});
  }

  for(let bar=0;bar<song.bars;bar++) {
    const root = song.root+song.progression[bar%4];
    const ending = bar%4===3;
    const chorus = Math.floor(bar/4)%2===1;
    const riff = riffs[song.style];

    // Guitarra: power chords e palhetadas abafadas; nenhuma melodia conhecida.
    const guitarSteps = heavy?[0,.5,1,1.5,2,2.5,3,3.5]
      : relaxed?[0,1,2,3]:[0,1,1.5,2,3,3.5];
    guitarSteps.forEach((step,i)=>{
      const chord = !heavy ? (step===0 || step===2 || (chorus && step===3)) : (step===0 || step===2 || step===3);
      const offset = !chord ? riff[(i+bar)%riff.length] : 0;
      const lane = (i+bar+(chord?0:1))%instrumentLayouts.guitar.keys.length;
      put('guitar',bar,step,lane,root+offset, chord?.44:.19,
        {chord, muted:heavy&&!chord, accent:step===0||step===2});
    });

    // Baixo elétrico: uma linha firme que acompanha o riff sem duplicar a guitarra.
    const bassSteps = heavy?[0,.5,1.5,2,2.5,3.5]:relaxed?[0,1.5,2.5]:[0,1,2,3];
    bassSteps.forEach((step,i)=>{
      const tone = (i%4===3?7:i%4===2?3:0);
      put('bass',bar,step,(i+bar)%instrumentLayouts.bass.keys.length,root-12+tone,.31,{accent:step===0});
    });

    // Contrabaixo acústico: menos notas, ataque macio e muito corpo grave.
    // Sua linha é independente da do baixo elétrico.
    const uprightSteps = heavy?[0,1,2,3]:relaxed?[0,2]:[0,1.5,2,3.5];
    uprightSteps.forEach((step,i)=>{
      const walk = i===0?0:i%3===1?7:i%3===2?5:10;
      put('contrabass',bar,step,(bar+i*2)%instrumentLayouts.contrabass.keys.length,root-19+walk,.58,{accent:step===0});
    });

    // Bateria: D=bombo, F=caixa, J=chimbal, K=tom/prato.
    for(let b=0;b<4;b++) {
      if(b===0||b===2||heavy&&b===3)put('drums',bar,b,0,36,.12,{accent:b===0});
      if(b===1||b===3)put('drums',bar,b,1,38,.16);
      if(!relaxed || b%2===0)put('drums',bar,b+.5,2,42,.10);
      if(heavy&&b===2)put('drums',bar,b+.75,2,42,.09);
      if(b===0&&(chorus||bar===0))put('drums',bar,0,7,49,.35);
      if(ending&&b===3)put('drums',bar,3.5,6,41,.22);
      if(heavy&&b===3)put('drums',bar,3.75,5,51,.10);
    }
  }

  events.sort((a,b)=>a.t-b.t || a.id-b.id);
  events.forEach((event,index)=>{event.index=index;});
  return {
    song,events,
    byPart:Object.fromEntries(instruments.map(i=>[i.id,events.filter(e=>e.part===i.id)])),
    duration:2*beat+song.bars*4*beat+1.5,
    beat
  };
}
