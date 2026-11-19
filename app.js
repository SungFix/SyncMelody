import {createPeerTransport} from './peer-transport.js';
import {instruments, songs, createChart, instrumentLayouts, keyLabel} from './music.js';
import {SampleAudioEngine} from './sample-audio.js';
import {StemPlayer, STEM_LABELS, STEM_PARTS} from './stem-player.js?v=continuous5';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const ui = {
  landing:$('#landing'), game:$('#game'), nickname:$('#nickname'), instrumentOptions:$('#instrument-options'),
  songList:$('#song-list'), joinForm:$('#join-form'), roomCodeInput:$('#room-code-input'),
  entryControls:$('#entry-controls'), roomControls:$('#room-controls'), roomCode:$('#room-code'),
  playerList:$('#player-list'), roomHint:$('#room-hint'), startBtn:$('#start-btn'), toast:$('#toast'),
  canvas:$('#notes-canvas'), board:$('#lane-board'), countdown:$('#countdown'), judgement:$('#judgement'),
  results:$('#results'), gamePlayers:$('#game-players'), score:$('#score-number'), combo:$('#combo-number'),
  accuracy:$('#accuracy'), progressFill:$('#progress-fill'), progressTime:$('#progress-time')
};
const params = new URLSearchParams(location.search);
const invite = (params.get('room') || '').replace(/[^A-Z0-9]/gi,'').toUpperCase().slice(0,6);
let selectedInstrument='guitar';
let selectedSong='fogo-na-garagem';
let socket=null, peerTransport=null, selfId=null, room=null, reconnecting=false, pendingCreateSong=null;
let serverOffset=0, pingSent=0, noticeTimeout=null, gameSession=null, raf=0, soundMuted=false;
let freeKeyCount=0;
let stemPlayer=null;
const currentLayout=()=>instrumentLayouts[gameSession?.part||selectedInstrument];
const laneForCode=code=>currentLayout().keys.indexOf(code);
const LANE_COLORS=['#d5ff6a','#ffabd8','#a4baff','#ffd084'];
const INSTRUMENT_IDS=instruments.map(i=>i.id);

const audio=new SampleAudioEngine();
async function getStems(){
  await audio.unlock();
  if(!stemPlayer)stemPlayer=new StemPlayer(audio.ctx,audio.master);
  return stemPlayer;
}
function updateStemStatus(message=''){
  const status=$('#local-mp3-status');
  const loaded=STEM_PARTS.map(part=>`${stemPlayer?.buffers.has(part)?'✓':'○'} ${STEM_LABELS[part]}`);
  const ready=!!stemPlayer?.ready();
  status.textContent=`${loaded.join('  ·  ')}. ${message || (ready?'PRONTO! Os sons só serão liberados quando acertar as notas.':'Selecione as 3 faixas PREVIA, juntas ou uma de cada vez.')}`;
  status.classList.toggle('ready',ready);
}
async function requireStems(){
  const stems=await getStems();
  if(!stems.ready()){
    await stems.loadBundled();
    updateStemStatus();
  }
  if(!stems.ready())throw new Error('Faltam faixas! Carregue os MP3s separados de GUITARRA, BATERIA e BAIXO, não o MP3 completo.');
  return stems;
}
async function importStemFiles(files,part=null){
  const status=$('#local-mp3-status');
  try{
    const stems=await getStems();
    status.textContent='Lendo as gravações. Isso pode levar alguns segundos…';
    await new Promise(resolve=>requestAnimationFrame(resolve));
    if(part){
      if(files.length!==1)throw new Error('Selecione um arquivo MP3 para esse instrumento.');
      await stems.setFile(part,files[0]);
    }else {
      for(const file of files){
        const matching=/guitarra|guitar/i.test(file.name)?'guitar':/bateria|drums?|percuss/i.test(file.name)?'drums':/baixo|bass/i.test(file.name)?'bass':null;
        if(!matching)throw new Error('Nome não identificado: '+file.name+'. Use os campos individuais de guitarra, bateria e baixo.');
        status.textContent='Carregando '+STEM_LABELS[matching]+'…';
        await new Promise(resolve=>requestAnimationFrame(resolve));
        await stems.setFile(matching,file);
      }
    }
    updateStemStatus();
    if(!room||isHost()){
      selectedSong='arquivo-rock';renderSongs();
      if(room)socketSend({type:'song',songId:selectedSong});
    }
    toast(stems.ready()?'As 3 faixas estão prontas! Jogue e ouça apenas ao acertar.':'Faixa carregada! Selecione as que ainda estão pendentes.');
  }catch(error){updateStemStatus();toast(error.message);}
}

function instrument(id){return instruments.find(i=>i.id===id)||instruments[0];}
function song(id){return songs.find(s=>s.id===id)||songs[0];}
function escapeHtml(value){return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function toast(message){ui.toast.textContent=message;ui.toast.hidden=false;clearTimeout(noticeTimeout);noticeTimeout=setTimeout(()=>ui.toast.hidden=true,3800);}
function cleanName(){return ui.nickname.value.trim().slice(0,18)||'Jogador';}
function formatTime(n){const secs=Math.max(0,Math.floor(n));return `${String(Math.floor(secs/60)).padStart(2,'0')}:${String(secs%60).padStart(2,'0')}`;}
function socketSend(data){if(peerTransport){peerTransport.send(data);return;}if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify(data));}
function isHost(){return room?.hostId===selfId;}
function ownPlayer(){return room?.players?.find(p=>p.id===selfId);}

function renderSongs(){
  ui.songList.innerHTML=songs.map(s=>`<button type="button" class="song-item ${s.id===selectedSong?'active':''}" data-song="${s.id}" aria-pressed="${s.id===selectedSong}" ${room&&!isHost()?'disabled':''}>
    <span class="song-cover" aria-hidden="true">${({'fogo-na-garagem':'⚡','marcha-de-aco':'✳','ecos-do-asfalto':'☾','ceu-em-ruinas':'★','arquivo-rock':'🎧'})[s.id] || '♫'}</span>
    <span class="song-text"><strong>${s.name}</strong><small>${s.genre} · ${s.bpm} BPM</small></span>
    <span class="song-difficulty" title="Dificuldade ${s.difficulty} de 3">${[1,2,3].map(i=>`<span class="${i<=s.difficulty?'filled':''}"></span>`).join('')}</span>
  </button>`).join('');
}
function renderInstrumentChoices(){
  $$('.instrument').forEach(btn=>{
    const id=btn.dataset.instrument;
    const chosen=id===selectedInstrument;
    const owner=room?.players.find(p=>p.instrument===id);
    const occupied=!!(owner&&owner.id!==selfId);
    btn.classList.toggle('selected',chosen);
    btn.classList.toggle('occupied',occupied);
    btn.setAttribute('aria-pressed',String(chosen));
    btn.disabled=occupied || !!(room&&room.state!=='lobby');
    btn.title=occupied?`Escolhido por ${owner.name}`:'';
  });
}
function renderRoom(){
  const inRoom=!!room;
  ui.entryControls.hidden=inRoom;
  ui.roomControls.hidden=!inRoom;
  if(inRoom){
    ui.roomCode.textContent=room.code;
    const parts=INSTRUMENT_IDS.map(id=>{
      const i=instrument(id),p=room.players.find(player=>player.instrument===id);
      return `<div class="player-entry ${p?'':'empty'}"><span class="player-avatar">${i.emoji}</span><span><strong>${p?escapeHtml(p.name):'Vaga disponível'}</strong><small>${i.name.toUpperCase()}</small></span><span class="player-tag">${p?(p.id===room.hostId?'LÍDER':p.id===selfId?'VOCÊ':'PRONTO'):'LIVRE'}</span></div>`;
    });
    ui.playerList.innerHTML=parts.join('');
    ui.roomHint.textContent=room.players.length===1?'Compartilhe o código para chamar seus amigos.':`${room.players.length} de 4 músicos conectados. ${isHost()?'Pode começar quando quiser.':'Aguardando o líder iniciar.'}`;
    ui.startBtn.disabled=!isHost()||room.state!=='lobby';
    $('#start-free-btn').disabled=ui.startBtn.disabled;
    ui.startBtn.textContent=isHost()?'▶ INICIAR APRESENTAÇÃO':'AGUARDANDO O LÍDER…';
  }
  renderSongs();renderInstrumentChoices();
}
function syncRoom(data){
  room=data;
  const player=ownPlayer();
  if(player)selectedInstrument=player.instrument;
  selectedSong=room.songId;
  renderRoom();
  if(gameSession&&room)renderBand();
}
async function connect(mode='join', code=''){
  // GitHub Pages e demais sites estáticos usam WebRTC com líder da sala.
  // Em localhost:3000, o servidor WebSocket antigo permanece disponível.
  if (!(location.hostname==='localhost' && location.port==='3000' && !params.has('p2p'))) {
    if(peerTransport){peerTransport.close();peerTransport=null;}
    const transport=await createPeerTransport({mode, code, onMessage:handleServer, onClose:()=>{
      if(peerTransport!==transport)return;
      peerTransport=null;
      if(room){toast('Conexão com a sala encerrada. O líder pode ter saído.');room=null;renderRoom();if(gameSession)gameSession.online=false;}
    }});
    peerTransport=transport;
    return;
  }
  if(socket?.readyState===WebSocket.OPEN)return Promise.resolve();
  if(socket?.readyState===WebSocket.CONNECTING)return new Promise((resolve,reject)=>{
    socket.addEventListener('open',()=>resolve(),{once:true});
    socket.addEventListener('error',()=>reject(Error('Conexão indisponível')),{once:true});
  });
  return new Promise((resolve,reject)=>{
    const protocol=location.protocol==='https:'?'wss:':'ws:';
    const ws=new WebSocket(`${protocol}//${location.host}`);socket=ws;
    const timeout=setTimeout(()=>{if(ws.readyState!==WebSocket.OPEN){ws.close();reject(Error('O servidor não respondeu.'));}},7500);
    ws.addEventListener('open',()=>{clearTimeout(timeout);resolve();socketSend({type:'ping',sentAt:Date.now()});});
    ws.addEventListener('error',()=>{clearTimeout(timeout);reject(Error('Falha ao conectar ao servidor.'));});
    ws.addEventListener('close',()=>{
      if(socket!==ws)return;
      if(room){toast('Conexão encerrada. Volte para a página inicial para entrar novamente.');room=null;renderRoom();if(gameSession)gameSession.online=false;}
    });
    ws.addEventListener('message',evt=>{
      let message;try{message=JSON.parse(evt.data);}catch{return;}
      handleServer(message);
    });
  });
}
function handleServer(msg){
  if(msg.type==='hello'){selfId=msg.id;serverOffset=msg.serverNow-Date.now();}
  else if(msg.type==='pong'){
    const rtt=Date.now()-Number(msg.echoed||Date.now());
    const measured=msg.serverNow-(Date.now()-rtt/2);
    serverOffset=serverOffset*.25+measured*.75;
  } else if(msg.type==='joined'){
    selfId=msg.id;
    syncRoom(msg.room);
    if(pendingCreateSong&&isHost()){socketSend({type:'song',songId:pendingCreateSong});pendingCreateSong=null;}
    toast(`Você entrou na sala ${msg.room.code}!`);
  } else if(msg.type==='room'){
    syncRoom(msg.room);
  } else if(msg.type==='started'){
    if(msg.mode==='free'){startFree({online:true});}
    else {
      if(msg.songId==='arquivo-rock'){
        if(!stemPlayer?.ready()){toast('Para tocar esta música, carregue os 3 arquivos de instrumentos antes de iniciar.');return;}
      }else audio.prepareAll().catch(e=>toast(e.message));
      beginGame({online:true,startAt:msg.startAt,songId:msg.songId});
    }
  } else if(msg.type==='jam' && gameSession?.mode==='free') {
    if(msg.playerId!==selfId && INSTRUMENT_IDS.includes(msg.instrument)){
      const keys=instrumentLayouts[msg.instrument].keys;
      if(Number.isInteger(msg.lane) && msg.lane>=0 && msg.lane<keys.length){
        audio.play(msg.instrument,{lane:msg.lane,pitch:instrumentLayouts[msg.instrument].notes[msg.lane]},null,.78);
      }
    }
  } else if(msg.type==='scores' && room){
    for(const p of msg.players||[]){const target=room.players.find(x=>x.id===p.id);if(target){target.score=p.score;target.combo=p.combo;}}
    if(gameSession)renderBand();
  } else if(msg.type==='hit'&&gameSession&&gameSession.online){
    const note=gameSession.chart.events[msg.noteIndex];
    if(note&&note.part===msg.instrument&&msg.playerId!==selfId){
      if(gameSession.chart.song.id==='arquivo-rock')stemPlayer?.hit(note.part,note,gameSession.chart.byPart[note.part]);
      else audio.play(note.part,note,null,.9);
    }
  } else if(msg.type==='error'){selectedInstrument=ownPlayer()?.instrument||selectedInstrument;renderInstrumentChoices();toast(msg.message);}
  else if(msg.type==='left'){room=null;renderRoom();}
}

ui.songList.addEventListener('click',e=>{
  const btn=e.target.closest('[data-song]');
  if(!btn||btn.disabled)return;
  selectedSong=btn.dataset.song;
  renderSongs();
  if(room)socketSend({type:'song',songId:selectedSong});
});
ui.instrumentOptions.addEventListener('click',e=>{
  const btn=e.target.closest('[data-instrument]');
  if(!btn||btn.disabled)return;
  selectedInstrument=btn.dataset.instrument;
  renderInstrumentChoices();
  if(room)socketSend({type:'instrument',instrument:selectedInstrument});
});
ui.nickname.addEventListener('change',()=>{if(room)socketSend({type:'name',name:cleanName()});});
$('#local-mp3').addEventListener('change',async event=>{
  const files=[...(event.target.files||[])];
  if(files.length)await importStemFiles(files);
  event.target.value='';
});
for(const part of STEM_PARTS){
  const input=$(`#stem-${part}`);
  input?.addEventListener('change',async event=>{
    const files=[...(event.target.files||[])];
    if(files.length)await importStemFiles(files,part);
    event.target.value='';
  });
}
updateStemStatus();
$('#toggle-join-btn').addEventListener('click',()=>{ui.joinForm.hidden=!ui.joinForm.hidden;if(!ui.joinForm.hidden)ui.roomCodeInput.focus();});
if(invite){ui.joinForm.hidden=false;ui.roomCodeInput.value=invite;}
ui.roomCodeInput.addEventListener('input',()=>{ui.roomCodeInput.value=ui.roomCodeInput.value.replace(/[^A-Za-z0-9]/g,'').toUpperCase().slice(0,6);});
ui.roomCodeInput.addEventListener('keydown',e=>{if(e.key==='Enter')$('#join-btn').click();});
$('#solo-btn').addEventListener('click',async()=>{
  try{await audio.unlock();if(selectedSong==='arquivo-rock')await requireStems();else{toast('Carregando amostras reais da banda…');await audio.prepareAll();}beginGame({online:false,startAt:Date.now()+3500,songId:selectedSong});}
  catch(e){toast(e.message);}
});
$('#create-btn').addEventListener('click',async()=>{
  try{await audio.unlock();if(selectedSong!=='arquivo-rock')audio.prepareAll().catch(e=>toast(e.message));await connect('create');pendingCreateSong=selectedSong;socketSend({type:'create',name:cleanName(),instrument:selectedInstrument});}
  catch(e){toast(e.message);}
});
$('#join-btn').addEventListener('click',async()=>{
  const code=ui.roomCodeInput.value.toUpperCase().trim();
  if(code.length!==6){toast('Digite o código de 6 caracteres.');return;}
  try{await audio.unlock();if(selectedSong!=='arquivo-rock')audio.prepareAll().catch(e=>toast(e.message));await connect('join',code);socketSend({type:'join',code,name:cleanName(),instrument:selectedInstrument});socketSend({type:'ping',sentAt:Date.now()});}
  catch(e){toast(e.message);}
});
$('#start-btn').addEventListener('click',async()=>{
  if(!isHost())return;
  try{await audio.unlock();if(selectedSong==='arquivo-rock')await requireStems();socketSend({type:'start',mode:'rhythm'});}
  catch(e){toast(e.message);}
});

$('#free-solo-btn').addEventListener('click',async()=>{
  try{await audio.unlock();toast('Carregando o som real do instrumento…');await audio.prepare(selectedInstrument);startFree({online:false});}
  catch(e){toast(e.message);}
});
$('#start-free-btn').addEventListener('click',async()=>{
  if(!isHost())return;
  try{await audio.unlock();await audio.prepare(selectedInstrument);socketSend({type:'start',mode:'free'});}
  catch(e){toast(e.message);}
});
$('#free-instrument-select').addEventListener('change',async e=>{
  if(gameSession?.mode!=='free'||gameSession.online)return;
  const next=e.target.value;if(!INSTRUMENT_IDS.includes(next))return;
  try{await audio.prepare(next);selectedInstrument=next;gameSession.part=next;renderFreeControls();renderBand();e.target.blur();}
  catch(error){toast(error.message);e.target.value=gameSession.part;}
});

$('#copy-link-btn').addEventListener('click',async()=>{
  if(!room)return;
  const link=`${location.origin}${location.pathname}?room=${room.code}`;
  try{await navigator.clipboard.writeText(link);toast('Link de convite copiado!');}
  catch {toast(`Compartilhe este código: ${room.code}`);}
});
$('#leave-btn').addEventListener('click',()=>{socketSend({type:'leave'});peerTransport?.close();peerTransport=null;room=null;renderRoom();history.replaceState(null,'',location.pathname);});
$('#exit-game').addEventListener('click',()=>{
  if(gameSession?.online){socketSend({type:'leave'});peerTransport?.close();peerTransport=null;room=null;}
  exitGame();renderRoom();
});
$('#sound-toggle').addEventListener('click',()=>{
  soundMuted=!soundMuted;audio.setMuted(soundMuted);
  $('#sound-toggle').textContent=soundMuted?'♫ SOM OFF':'♫ SOM ON';
});
$('#back-to-lobby').addEventListener('click',()=>{exitGame();renderRoom();});

function beginGame({online,startAt,songId}){
  if(songId==='arquivo-rock'&&!stemPlayer?.ready()){toast('Escolha as 3 faixas antes de iniciar esta música.');return;}
  if(gameSession){stopGame();}
  const chart=createChart(songId);
  const part=online?(ownPlayer()?.instrument||selectedInstrument):selectedInstrument;
  const occupied=new Set(online?(room?.players||[]).map(p=>p.instrument):[part]);
  const player=online?ownPlayer():null;
  const session={mode:'rhythm',online,chart,startAt,part,occupied,score:0,combo:0,maxCombo:0,perfect:0,great:0,good:0,miss:0,
    notes:chart.byPart[part], hit:new Set(), nextMiss:0,nextAudio:0,ended:false,laneUntil:Array(instrumentLayouts[part].keys.length).fill(0), lastJudge:0,
    timeOffset:online?serverOffset:0};
  gameSession=session;
  if(player){player.score=0;player.combo=0;}
  ui.landing.hidden=true;ui.game.hidden=false;ui.results.hidden=true;
  setStageMode('rhythm');renderRhythmControls(part);
  ui.countdown.hidden=false;ui.judgement.classList.remove('show');
  $('#game-song').textContent=chart.song.name;
  $('#game-bpm').textContent=`${chart.song.bpm} BPM`;
  $('#game-room-label').textContent=online?`SALA ${room?.code}`:'MODO SOLO';
  const inst=instrument(part);
  $('#active-instrument-name').innerHTML=`${inst.name.toUpperCase()} <span>${inst.emoji}</span>`;
  updateScore();renderBand();
  ui.progressFill.style.width='0%';
  ui.progressTime.textContent=`00:00 / ${formatTime(chart.duration)}`;
  audio.stopAll();
  stemPlayer?.stop();
  if(songId==='arquivo-rock'){
    if(!stemPlayer?.ready()){toast('As 3 faixas ainda não foram carregadas.');return;}
    const delay=(startAt-(Date.now()+(online?serverOffset:0)))/1000;
    stemPlayer.start(delay);
  }
  requestAnimationFrame(()=>{resizeCanvas();drawFrame();});
}
function setStageMode(mode){
  const free=mode==='free';
  ui.board.hidden=free;$('#free-panel').hidden=!free;
  $$('.rhythm-only').forEach(element=>element.hidden=free);
  ui.game.classList.toggle('is-free',free);
}
function renderRhythmControls(part){
  const keys=instrumentLayouts[part].keys;
  $('#rhythm-keys').style.setProperty('--lanes',keys.length);
  $('#rhythm-keys').innerHTML=keys.map((code,lane)=>`<button type="button" data-lane="${lane}" aria-label="${escapeHtml(keyLabel(code))} — faixa ${lane+1}"><span>${escapeHtml(keyLabel(code))}</span></button>`).join('');
  $('#game-instructions').innerHTML=`PRESSIONE ${keys.map(k=>`<kbd>${escapeHtml(keyLabel(k))}</kbd>`).join(' ')} NO RITMO DAS NOTAS <span>OU TOQUE NOS BOTÕES</span>`;
  $('#rhythm-keys').querySelectorAll('button').forEach(button=>bindPointerButton(button,()=>playLane(Number(button.dataset.lane))));
}
function renderFreeControls(){
  if(!gameSession||gameSession.mode!=='free')return;
  const part=gameSession.part,layout=instrumentLayouts[part],inst=instrument(part);
  $('#active-instrument-name').innerHTML=`${inst.name.toUpperCase()} <span>${inst.emoji}</span>`;
  $('#free-instrument-select').innerHTML=instruments.map(i=>`<option value="${i.id}" ${i.id===part?'selected':''}>${escapeHtml(i.name)} — ${instrumentLayouts[i.id].keys.length} teclas</option>`).join('');
  $('#free-instrument-select').disabled=gameSession.online;
  const grid=$('#free-key-grid');grid.style.setProperty('--free-cols',layout.keys.length===8?4:layout.keys.length===6?3:layout.keys.length);
  grid.innerHTML=layout.keys.map((code,lane)=>`<button type="button" class="free-key" data-lane="${lane}" aria-label="Tocar ${escapeHtml(layout.names[lane])}"><kbd>${escapeHtml(keyLabel(code))}</kbd><small>${escapeHtml(layout.names[lane])}</small></button>`).join('');
  grid.querySelectorAll('button').forEach(button=>bindPointerButton(button,()=>playFreeLane(Number(button.dataset.lane))));
  $('#free-note-count').textContent=`${freeKeyCount} TOQUES`;
}
function startFree({online}){
  if(gameSession)stopGame();
  stemPlayer?.stop();
  gameSession={mode:'free',online,part:online?(ownPlayer()?.instrument||selectedInstrument):selectedInstrument,ended:false};
  freeKeyCount=0;
  ui.landing.hidden=true;ui.game.hidden=false;ui.results.hidden=true;
  setStageMode('free');renderFreeControls();
  $('#game-song').textContent='Ensaio Livre';
  $('#game-bpm').textContent='SEM RITMO FIXO';
  $('#game-room-label').textContent=online?`SALA ${room?.code}`:'MODO LIVRE SOLO';
  $('#free-status').textContent=online?'TOCANDO COM A BANDA':'PRONTO PARA EXPERIMENTAR';
  renderBand();audio.stopAll();
}
function playFreeLane(lane){
  const g=gameSession;if(!g||g.mode!=='free'||g.ended)return;
  const layout=instrumentLayouts[g.part];if(lane<0||lane>=layout.keys.length)return;
  audio.play(g.part,{lane,pitch:layout.notes[lane]},null,1);
  freeKeyCount++;
  $('#free-note-count').textContent=`${freeKeyCount} TOQUES`;
  const button=$(`#free-key-grid button[data-lane="${lane}"]`);
  button?.classList.add('active');
  if(button){clearTimeout(button.releaseTimer);button.releaseTimer=setTimeout(()=>button.classList.remove('active'),115);}
  if(g.online)socketSend({type:'jam',lane});
}
function bindPointerButton(button,fn){
  button.addEventListener('pointerdown',event=>{
    event.preventDefault();button.setPointerCapture(event.pointerId);fn();button.classList.add('active');
  });
  const release=()=>button.classList.remove('active');
  button.addEventListener('pointerup',release);button.addEventListener('pointercancel',release);button.addEventListener('lostpointercapture',release);
}
function resizeCanvas(){
  const c=ui.canvas,rect=c.getBoundingClientRect();
  if(rect.width<=0||rect.height<=0)return;
  const dpr=Math.min(window.devicePixelRatio||1,2);
  const w=Math.round(rect.width*dpr),h=Math.round(rect.height*dpr);
  if(c.width!==w||c.height!==h){c.width=w;c.height=h;}
}
window.addEventListener('resize',resizeCanvas);
function nowElapsed(g){return (Date.now()+g.timeOffset-g.startAt)/1000;}
function updateScore(){
  const g=gameSession;if(!g||g.mode==='free')return;
  ui.score.textContent=String(g.score).padStart(6,'0');
  ui.combo.textContent=g.combo;
  const total=g.perfect+g.great+g.good+g.miss;
  const accuracy=total?Math.round((g.perfect+g.great*.78+g.good*.5)/total*100):100;
  ui.accuracy.textContent=`${accuracy}% PRECISÃO`;
  if(g.online){const me=ownPlayer();if(me){me.score=g.score;me.combo=g.combo;}}
}
function renderBand(){
  const g=gameSession;
  if(!g)return;
  const members=g.online?(room?.players||[]):[{id:'solo',name:cleanName(),instrument:g.part,score:g.score,combo:g.combo}];
  $('#band-count').textContent=`${members.length} / 4`;
  ui.gamePlayers.innerHTML=INSTRUMENT_IDS.map(id=>{
    const i=instrument(id),p=members.find(m=>m.instrument===id);
    return `<div class="band-member ${p?'':'empty'}"><span class="band-member-icon">${i.emoji}</span><span class="band-member-text"><strong>${p?escapeHtml(p.name):(g.mode==='free'?'Vaga livre':'Instrumento automático')}</strong><small>${i.name}${p?.id===selfId||(!g.online&&p)?' · VOCÊ':''}</small></span><span class="band-member-points">${p?(g.mode==='free'?'TOCANDO':Number(p.score||0).toLocaleString('pt-BR')):(g.mode==='free'?'LIVRE':'AUTO')}</span></div>`;
  }).join('');
}
function scheduleBacking(g,elapsed){
  if(g.chart.song.id==='arquivo-rock')return;
  const events=g.chart.events;
  while(g.nextAudio<events.length && events[g.nextAudio].t<=elapsed+.16){
    const note=events[g.nextAudio++];
    if(g.occupied.has(note.part))continue;
    const time=audio.ctx?.currentTime+Math.max(.005,note.t-elapsed);
    audio.play(note.part,note,time,.51);
  }
}
function showJudge(grade){
  const colors={PERFECT:'#d5ff6a',GREAT:'#a4baff',GOOD:'#ffcf8d',MISS:'#ff8c9d'};
  ui.judgement.textContent=grade+'!';
  ui.judgement.style.color=colors[grade];
  ui.judgement.classList.add('show');
  if(gameSession)gameSession.lastJudge=performance.now();
}
function updateMissed(g,elapsed){
  while(g.nextMiss<g.notes.length && g.notes[g.nextMiss].t < elapsed-.2){
    const note=g.notes[g.nextMiss++];
    if(g.hit.has(note.index))continue;
    g.hit.add(note.index);g.combo=0;g.miss++;
    if(g.chart.song.id==='arquivo-rock')stemPlayer?.miss(g.part,note);
    showJudge('MISS');
    if(g.online)socketSend({type:'score',score:g.score,combo:g.combo});
    updateScore();
  }
}
function playLane(lane){
  const g=gameSession;if(!g||g.ended||g.mode==='free')return;
  const elapsed=nowElapsed(g);
  if(elapsed<0||elapsed>g.chart.duration)return;
  let chosen=null,smallest=.205;
  for(const n of g.notes){
    if(n.lane!==lane||g.hit.has(n.index))continue;
    const distance=Math.abs(n.t-elapsed);
    if(distance<smallest){smallest=distance;chosen=n;}
    if(n.t>elapsed+.205)break;
  }
  g.laneUntil[lane]=performance.now()+120;
  const key=$(`.lane-buttons button[data-lane="${lane}"]`);
  key?.classList.add('active');
  if(!chosen)return;
  g.hit.add(chosen.index);
  const grade=smallest<=.075?'PERFECT':smallest<=.13?'GREAT':'GOOD';
  g.combo++;g.maxCombo=Math.max(g.maxCombo,g.combo);
  if(grade==='PERFECT'){g.perfect++;g.score+=300+Math.min(200,g.combo*2);}
  else if(grade==='GREAT'){g.great++;g.score+=170+Math.min(100,g.combo);}
  else{g.good++;g.score+=80;}
  showJudge(grade);
  if(g.chart.song.id==='arquivo-rock')stemPlayer?.hit(g.part,chosen,g.chart.byPart[g.part]);
  else audio.play(g.part,chosen,null,1);
  if(g.online)socketSend({type:'hit',noteIndex:chosen.index,score:g.score,combo:g.combo});
  updateScore();renderBand();
}
window.addEventListener('keydown',e=>{
  if(!gameSession||e.repeat||e.altKey||e.ctrlKey||e.metaKey)return;
  if(e.target instanceof HTMLElement && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName))return;
  const lane=laneForCode(e.code);if(lane<0)return;
  e.preventDefault();
  if(gameSession.mode==='free')playFreeLane(lane);else playLane(lane);
});
window.addEventListener('keyup',e=>{
  if(!gameSession)return;
  const lane=laneForCode(e.code);if(lane<0)return;
  if(gameSession.mode==='free')$(`#free-key-grid button[data-lane="${lane}"]`)?.classList.remove('active');
  else $(`.lane-buttons button[data-lane="${lane}"]`)?.classList.remove('active');
});
function drawFrame(){
  const g=gameSession;if(!g||g.ended)return;
  raf=requestAnimationFrame(drawFrame);
  const elapsed=nowElapsed(g);
  const secToStart=-elapsed;
  if(secToStart>0){ui.countdown.hidden=false;ui.countdown.textContent=secToStart>3.5?'PREPARE-SE':Math.max(1,Math.ceil(secToStart));}
  else {ui.countdown.hidden=true;}
  if(performance.now()-g.lastJudge>650)ui.judgement.classList.remove('show');
  if(elapsed>=0){scheduleBacking(g,elapsed);updateMissed(g,elapsed);}
  const percent=Math.max(0,Math.min(100,(elapsed/g.chart.duration)*100));
  ui.progressFill.style.width=`${percent}%`;
  ui.progressTime.textContent=`${formatTime(elapsed)} / ${formatTime(g.chart.duration)}`;
  const c=ui.canvas,ctx=c.getContext('2d');
  if(!ctx)return;
  const dpr=c.width/(c.clientWidth||1);
  const w=c.clientWidth,h=c.clientHeight;
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,w,h);
  const laneCount=instrumentLayouts[g.part].keys.length;
  const laneW=w/laneCount,lineY=h-108;
  // A pista e os limites permanecem visíveis mesmo antes das notas surgirem.
  for(let lane=0;lane<laneCount;lane++){
    ctx.fillStyle=lane%2===0?'#161729':'#1b1b2e';ctx.fillRect(lane*laneW,0,laneW,h);
    ctx.fillStyle='#ffffff0b';ctx.fillRect(lane*laneW,0,1,h);
    if(g.laneUntil[lane]>performance.now()){
      ctx.fillStyle=LANE_COLORS[lane]+'20';ctx.fillRect(lane*laneW,0,laneW,h);
    }
  }
  const beatPhase=Math.max(0,elapsed)/g.chart.beat;
  const visibleBeats=8;
  for(let b=Math.floor(beatPhase)-3;b<Math.floor(beatPhase)+visibleBeats;b++){
    if(b<0)continue;
    const t=b*g.chart.beat;
    const y=lineY-(t-elapsed)*((lineY-35)/2.0);
    if(y<0||y>lineY+30)continue;
    ctx.fillStyle=b%4===0?'#9e99cf21':'#ded9f40e';ctx.fillRect(0,y,w,b%4===0?2:1);
  }
  const grd=ctx.createLinearGradient(0,0,0,lineY+10);
  grd.addColorStop(0,'#13152700');grd.addColorStop(.86,'#d4ff6a06');grd.addColorStop(1,'#d4ff6a27');
  ctx.fillStyle=grd;ctx.fillRect(0,0,w,lineY+10);
  const notes=g.notes;
  const speed=(lineY-35)/2.0;
  for(const n of notes){
    if(g.hit.has(n.index))continue;
    const delta=n.t-elapsed;
    if(delta>2.25||delta<-.3)continue;
    const y=lineY-delta*speed;
    const x=n.lane*laneW+Math.max(8,laneW*.12),nw=laneW-Math.max(16,laneW*.24),nh=19;
    if(y+nh<-10||y>h+10)continue;
    ctx.shadowColor=LANE_COLORS[n.lane%LANE_COLORS.length];ctx.shadowBlur=13;
    ctx.fillStyle=LANE_COLORS[n.lane%LANE_COLORS.length];
    ctx.beginPath();ctx.roundRect(x,y,nw,nh,5);ctx.fill();
    ctx.shadowBlur=0;ctx.fillStyle='#ffffff65';ctx.fillRect(x+6,y+3,nw-12,2);
  }
  ctx.fillStyle='#eaffaa26';ctx.fillRect(0,lineY-3,w,13);
  ctx.fillStyle='#e2ff8f';ctx.fillRect(0,lineY,w,3);
  ctx.shadowBlur=12;ctx.shadowColor='#d5ff6a';ctx.fillRect(0,lineY,w,2);ctx.shadowBlur=0;
  if(elapsed>g.chart.duration){finishGame();}
}
function finishGame(){
  const g=gameSession;if(!g||g.ended)return;
  g.ended=true;cancelAnimationFrame(raf);updateMissed(g,Number.POSITIVE_INFINITY);audio.stopAll();stemPlayer?.stop();
  const total=g.perfect+g.great+g.good+g.miss;
  const accuracy=total?Math.round((g.perfect+g.great*.78+g.good*.5)/total*100):100;
  $('#result-score').textContent=g.score.toLocaleString('pt-BR');
  $('#result-accuracy').textContent=`${accuracy}%`;
  $('#result-combo').textContent=g.maxCombo;
  $('#result-message').textContent=accuracy>=85?'Você mandou muito bem nessa apresentação!':accuracy>=55?'Boa! A próxima música vai sair ainda melhor.':'Todo show começa com um primeiro ensaio. Bora de novo!';
  ui.results.hidden=false;
  if(g.online)socketSend({type:'finished'});
}
function stopGame(){
  cancelAnimationFrame(raf);
  gameSession=null;
  stemPlayer?.stop();
  audio.stopAll();
  $$('.lane-buttons button,.free-key').forEach(b=>b.classList.remove('active'));
}
function exitGame(){
  stopGame();ui.game.hidden=true;ui.landing.hidden=false;ui.results.hidden=true;setStageMode('rhythm');
  window.scrollTo({top:0,behavior:'instant'});
}
window.addEventListener('pagehide',()=>{socket?.close();peerTransport?.close();});
renderSongs();renderInstrumentChoices();