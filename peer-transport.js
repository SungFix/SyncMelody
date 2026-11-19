/**
 * SyncMelody: salas WebRTC sem um servidor de aplicação próprio.
 * O primeiro jogador é o líder e coordena o estado via PeerJS DataConnections.
 * O serviço público PeerJS Cloud é usado apenas para sinalização WebRTC.
 */
const INSTRUMENTS = ['guitar', 'drums', 'bass', 'contrabass'];
const SONGS = new Set(['fogo-na-garagem', 'marcha-de-aco', 'ecos-do-asfalto', 'ceu-em-ruinas']);
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const idForCode = code => `syncmelody-v1-${code.toLowerCase()}`;
const safeName = value => String(value || 'Jogador').replace(/[<>\\]/g, '').trim().slice(0, 18) || 'Jogador';
const clamp = (value, max) => Math.max(0, Math.min(max, Math.floor(Number(value) || 0)));
const randomCode = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), b => ALPHABET[b % ALPHABET.length]).join('');
const readyState = connection => connection && connection.open;

function openPeer(peer, timeoutMs = 13000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => fail(new Error('O serviço de salas não respondeu. Tente novamente.')), timeoutMs);
    function finish(id) { if (settled) return; settled = true; clearTimeout(timeout); resolve(id); }
    function fail(error) { if (settled) return; settled = true; clearTimeout(timeout); reject(error); }
    peer.on('open', finish);
    peer.on('error', fail);
    peer.on('disconnected', () => { if (!settled) fail(new Error('Sem conexão com o serviço de salas.')); });
  });
}
function openConnection(connection, peer, timeoutMs = 17000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => fail(new Error('Não foi possível encontrar ou conectar à sala.')), timeoutMs);
    function finish() { if (settled) return; settled = true; clearTimeout(timeout); resolve(); }
    function fail(error) { if (settled) return; settled = true; clearTimeout(timeout); reject(error); }
    connection.on('open', finish);
    connection.on('error', fail);
    peer.on('error', fail);
    connection.on('close', () => fail(new Error('A conexão com a sala foi encerrada.')));
  });
}

export async function createPeerTransport({ mode, code, onMessage, onClose, PeerClass = globalThis.Peer }) {
  if (!PeerClass) throw new Error('Não foi possível carregar o sistema de salas. Confira sua internet e atualize a página.');
  if (!globalThis.crypto?.getRandomValues) throw new Error('Este navegador precisa de uma conexão HTTPS para o multiplayer.');

  let peer, selfId, room = null, connection = null, closed = false;
  const guests = new Map();
  const amHost = mode === 'create';
  let activeCode = code;
  let pingTimer = null;
  const emit = message => { if (!closed) onMessage(message); };
  const sendTo = (id, message) => {
    if (id === selfId) emit(message);
    else {
      const target = guests.get(id);
      if (readyState(target)) target.send(message);
    }
  };
  const broadcast = message => {
    if (!room) return;
    for (const player of room.players) sendTo(player.id, message);
  };
  const snapshot = () => ({
    code: room.code, hostId: room.hostId, songId: room.songId,
    state: room.state, startAt: room.startAt,
    players: room.players.map(({id, name, instrument, score, combo}) => ({id, name, instrument, score, combo}))
  });
  const sync = () => broadcast({type:'room', room:snapshot(), serverNow:Date.now()});
  const leave = id => {
    if (!room) return;
    const index = room.players.findIndex(p => p.id === id);
    if (index < 0) return;
    room.players.splice(index, 1);
    if (room.state === 'playing' && room.players.length && room.players.every(p => p.done)) {
      room.state = 'lobby'; room.startAt = null;
    }
    sync();
  };
  const accept = (id, name, instrument) => {
    if (!room) return sendTo(id, {type:'error', message:'Sala indisponível.'});
    if (room.players.length >= 4) return sendTo(id, {type:'error', message:'Esta sala já tem 4 jogadores.'});
    if (room.state !== 'lobby') return sendTo(id, {type:'error', message:'A apresentação já começou. Tente depois.'});
    if (room.players.some(p => p.id === id)) return;
    const taken = new Set(room.players.map(p => p.instrument));
    const picked = INSTRUMENTS.includes(instrument) && !taken.has(instrument)
      ? instrument : INSTRUMENTS.find(i => !taken.has(i));
    room.players.push({id, name:safeName(name), instrument:picked, score:0, combo:0, done:false});
    sendTo(id, {type:'joined', id, room:snapshot(), serverNow:Date.now()});
    sync();
  };
  const handleAsHost = (id, msg) => {
    if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') return;
    if (msg.type === 'ping') return sendTo(id, {type:'pong', echoed:msg.sentAt, serverNow:Date.now()});
    if (msg.type === 'create' && id === selfId) {
      room = {code:activeCode, hostId:selfId, songId:'fogo-na-garagem', state:'lobby', startAt:null, players:[]};
      accept(id, msg.name, msg.instrument); return;
    }
    if (msg.type === 'join') {
      if (msg.code !== activeCode) return sendTo(id, {type:'error', message:'Código inválido.'});
      accept(id, msg.name, msg.instrument); return;
    }
    if (msg.type === 'leave') {
      if (id === selfId) { broadcast({type:'left'}); room = null; }
      else { leave(id); sendTo(id, {type:'left'}); }
      return;
    }
    const player = room?.players.find(p => p.id === id);
    if (!player) return;
    if (msg.type === 'instrument' && room.state === 'lobby') {
      if (!INSTRUMENTS.includes(msg.instrument)) return;
      if (room.players.some(p => p.id !== id && p.instrument === msg.instrument))
        return sendTo(id, {type:'error', message:'Este instrumento já está ocupado.'});
      player.instrument = msg.instrument; sync();
    } else if (msg.type === 'name' && room.state === 'lobby') {
      player.name = safeName(msg.name); sync();
    } else if (msg.type === 'song' && id === room.hostId && room.state === 'lobby') {
      if (SONGS.has(msg.songId)) {room.songId = msg.songId; sync();}
    } else if (msg.type === 'start' && id === room.hostId && room.state === 'lobby') {
      room.state = 'playing'; room.startAt = Date.now() + 5000;
      for (const p of room.players) {p.score=0; p.combo=0; p.done=false;}
      sync();
      broadcast({type:'started', startAt:room.startAt, songId:room.songId, serverNow:Date.now()});
    } else if (msg.type === 'hit' && room.state === 'playing') {
      if (!Number.isInteger(msg.noteIndex) || msg.noteIndex < 0 || msg.noteIndex > 4000) return;
      player.score=clamp(msg.score,99999999); player.combo=clamp(msg.combo,9999);
      broadcast({type:'hit', playerId:id, instrument:player.instrument, noteIndex:msg.noteIndex});
      broadcast({type:'scores', players:room.players.map(p=>({id:p.id, score:p.score, combo:p.combo}))});
    } else if (msg.type === 'score' && room.state === 'playing') {
      player.score=clamp(msg.score,99999999); player.combo=clamp(msg.combo,9999);
      broadcast({type:'scores',players:room.players.map(p=>({id:p.id,score:p.score,combo:p.combo}))});
    } else if (msg.type === 'finished' && room.state === 'playing') {
      player.done = true;
      if (room.players.every(p=>p.done)) {room.state='lobby';room.startAt=null;sync();}
    }
  };

  if (amHost) {
    let lastError;
    for (let attempt=0; attempt<5; attempt++) {
      activeCode = randomCode();
      peer = new PeerClass(idForCode(activeCode));
      try { selfId = await openPeer(peer); break; }
      catch (err) {
        lastError = err;
        peer.destroy();
        if (err.type !== 'unavailable-id') throw err;
      }
    }
    if (!selfId) throw lastError || new Error('Não foi possível criar a sala.');
    peer.on('connection', incoming => {
      if (guests.size >= 8 || closed) {incoming.close();return;}
      guests.set(incoming.peer, incoming);
      incoming.on('data', payload => handleAsHost(incoming.peer, payload));
      incoming.on('close', () => {if(guests.get(incoming.peer)===incoming){guests.delete(incoming.peer);leave(incoming.peer);}});
      incoming.on('error', () => {if(guests.get(incoming.peer)===incoming){guests.delete(incoming.peer);leave(incoming.peer);}});
    });
    emit({type:'hello', id:selfId, serverNow:Date.now()});
  } else {
    if (!/^[A-Z2-9]{6}$/.test(String(activeCode||''))) throw new Error('Código de sala inválido.');
    peer = new PeerClass();
    selfId = await openPeer(peer);
    connection = peer.connect(idForCode(activeCode), {reliable:true, serialization:'json'});
    try {await openConnection(connection,peer);} catch(error){peer.destroy();throw error;}
    connection.on('data', emit);
    connection.on('close', () => {if(!closed){closed=true;clearInterval(pingTimer);onClose();}});
    connection.on('error', () => {if(!closed){closed=true;clearInterval(pingTimer);onClose();}});
    peer.on('error', () => {if(!closed){closed=true;clearInterval(pingTimer);onClose();}});
    // RTT da troca ping/pong permite compensar a diferença de horário dos dispositivos.
    emit({type:'hello', id:selfId, serverNow:Date.now()});
    pingTimer=setInterval(() => {if(readyState(connection))connection.send({type:'ping',sentAt:Date.now()});},7000);
  }
  peer.on('close', () => {if(!closed){closed=true;clearInterval(pingTimer);onClose();}});
  return {
    code: activeCode,
    id: selfId,
    send(message) {
      if (closed) return;
      if (amHost) handleAsHost(selfId, message);
      else if (readyState(connection)) connection.send(message);
    },
    close() {
      if (closed) return;
      closed = true; clearInterval(pingTimer);
      if (amHost) broadcast({type:'left'});
      try {connection?.close();} catch {}
      for (const guest of guests.values()) {try{guest.close();}catch{}}
      peer?.destroy();
      room = null;
    }
  };
}