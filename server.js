import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from './ws-lite.js';

const BASE = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const rooms = new Map();
const clients = new Map();
const SONGS = new Set(['fogo-na-garagem', 'marcha-de-aco', 'ecos-do-asfalto', 'ceu-em-ruinas', 'arquivo-rock']);
const INSTRUMENTS = ['guitar', 'drums', 'bass', 'contrabass'];
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg'
};

const server = http.createServer(async (req, res) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, `http://${req.headers.host || 'localhost'}`).pathname); }
  catch { res.writeHead(400); res.end('URL inválida'); return; }
  if (pathname === '/health') {
    res.writeHead(200, {'Content-Type':'application/json'});
    res.end(JSON.stringify({ok:true, rooms:rooms.size}));
    return;
  }
  const target = path.resolve(BASE, `.${pathname === '/' ? '/index.html' : pathname}`);
  if (!target.startsWith(BASE + path.sep) || !(['index.html','style.css','app.js','music.js','sample-audio.js','peer-transport.js','imported-chart.js','stem-player.js'].includes(path.relative(BASE,target)) || (/^samples\/(drums|soundfonts)\/[a-z0-9_.-]+$/.test(path.relative(BASE,target).replaceAll('\\','/')) || /^stems\/musicqa-(guitarra|bateria|baixo)-PREVIA\.mp3$/.test(path.relative(BASE,target).replaceAll('\\','/'))))) {
    res.writeHead(404); res.end('Não encontrado'); return;
  }
  try {
    const file = await fs.readFile(target);
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(target)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff'
    });
    res.end(file);
  } catch {
    res.writeHead(404, {'Content-Type':'text/plain; charset=utf-8'});
    res.end('Não encontrado');
  }
});
const wss = new WebSocketServer({server, maxPayload: 8192});

function send(ws, payload) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
}
function broadcast(room, payload, except = null) {
  for (const person of room.players) if (person.ws !== except) send(person.ws, payload);
}
function safeName(name) {
  return String(name || 'Jogador').replace(/[<>\\]/g, '').trim().slice(0, 18) || 'Jogador';
}
function code() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let candidate;
  do {candidate = Array.from(crypto.randomBytes(6), b => letters[b % letters.length]).join('');}
  while (rooms.has(candidate));
  return candidate;
}
function publicRoom(room) {
  return {
    code: room.code, hostId: room.hostId, songId: room.songId,
    state: room.state, mode:room.mode||'rhythm', startAt: room.startAt,
    players: room.players.map(p => ({id:p.id, name:p.name, instrument:p.instrument, score:p.score, combo:p.combo}))
  };
}
function sync(room) { broadcast(room, {type:'room', room:publicRoom(room), serverNow:Date.now()}); }
function leave(client) {
  const room = rooms.get(client.roomCode);
  client.roomCode = null;
  if (!room) return;
  room.players = room.players.filter(p => p.id !== client.id);
  if (!room.players.length) {rooms.delete(room.code); return;}
  if (room.hostId === client.id) room.hostId = room.players[0].id;
  if (room.state === 'playing' && room.players.every(p => p.done)) room.state = 'lobby';
  sync(room);
}
function takeRoom(ws, client, room, name, instrument) {
  if (room.players.length >= 4) return send(ws, {type:'error', message:'Esta sala já tem 4 jogadores.'});
  if (room.state !== 'lobby') return send(ws, {type:'error', message:'Esta partida já começou. Aguarde a próxima.'});
  const taken = new Set(room.players.map(p => p.instrument));
  const pick = INSTRUMENTS.includes(instrument) && !taken.has(instrument)
    ? instrument : INSTRUMENTS.find(i => !taken.has(i));
  const player = {id:client.id, ws, name:safeName(name), instrument:pick, score:0, combo:0, done:false};
  room.players.push(player);
  client.roomCode = room.code;
  send(ws, {type:'joined', id:client.id, room:publicRoom(room), serverNow:Date.now()});
  sync(room);
}

wss.on('connection', ws => {
  const client = {id:crypto.randomUUID(), roomCode:null};
  clients.set(ws, client);
  send(ws, {type:'hello', id:client.id, serverNow:Date.now()});
  ws.on('message', raw => {
    let msg;
    try {msg=JSON.parse(String(raw));} catch {return;}
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'ping') {
      send(ws, {type:'pong', echoed:msg.sentAt, serverNow:Date.now()}); return;
    }
    if (msg.type === 'leave') {leave(client); send(ws, {type:'left'}); return;}
    if (msg.type === 'create') {
      leave(client);
      const id=code();
      const room={code:id, players:[], hostId:client.id, songId:'fogo-na-garagem', state:'lobby', mode:'rhythm', startAt:null};
      rooms.set(id, room);
      takeRoom(ws, client, room, msg.name, msg.instrument);
      return;
    }
    if (msg.type === 'join') {
      const room=rooms.get(String(msg.code || '').toUpperCase().trim());
      if (!room) return send(ws,{type:'error',message:'Sala não encontrada. Confira o código.'});
      leave(client);
      takeRoom(ws,client,room,msg.name,msg.instrument);
      return;
    }
    const room = rooms.get(client.roomCode);
    const player = room?.players.find(p => p.id === client.id);
    if (!room || !player) return;
    if (msg.type === 'instrument' && room.state === 'lobby') {
      if (!INSTRUMENTS.includes(msg.instrument)) return;
      if (room.players.some(p => p.id !== player.id && p.instrument === msg.instrument))
        return send(ws, {type:'error', message:'Este instrumento já está ocupado.'});
      player.instrument = msg.instrument;
      sync(room);
    } else if (msg.type === 'name' && room.state === 'lobby') {
      player.name = safeName(msg.name);
      sync(room);
    } else if (msg.type === 'song' && room.hostId === client.id && room.state === 'lobby') {
      if (SONGS.has(msg.songId)) {room.songId=msg.songId; sync(room);}
    } else if (msg.type === 'start' && room.hostId === client.id && room.state === 'lobby') {
      room.mode=msg.mode==='free'?'free':'rhythm';
      room.state = 'playing';
      room.startAt = Date.now()+(room.mode==='free'?1000:4500);
      for (const p of room.players) {p.score=0; p.combo=0; p.done=false;}
      sync(room);
      broadcast(room, {type:'started', mode:room.mode, startAt:room.startAt, songId:room.songId, serverNow:Date.now()});
    } else if (msg.type === 'jam' && room.state === 'playing' && room.mode==='free') {
      const limits={guitar:2,drums:4,bass:4,contrabass:4};
      if(!Number.isInteger(msg.lane)||msg.lane<0||msg.lane>=limits[player.instrument])return;
      broadcast(room,{type:'jam',playerId:player.id,instrument:player.instrument,lane:msg.lane});
    } else if (msg.type === 'hit' && room.state === 'playing' && room.mode!=='free') {
      if (!Number.isInteger(msg.noteIndex) || msg.noteIndex < 0 || msg.noteIndex > 4000) return;
      const score = Number(msg.score);
      const combo = Number(msg.combo);
      if (!Number.isFinite(score) || !Number.isFinite(combo)) return;
      player.score = Math.min(99999999, Math.max(0, Math.floor(score)));
      player.combo = Math.min(9999, Math.max(0, Math.floor(combo)));
      broadcast(room, {type:'hit', playerId:player.id, instrument:player.instrument, noteIndex:msg.noteIndex});
      broadcast(room, {type:'scores', players:room.players.map(p=>({id:p.id,score:p.score,combo:p.combo}))});
    } else if (msg.type === 'score' && room.state === 'playing') {
      player.score = Math.max(0, Math.min(99999999, Math.floor(Number(msg.score)||0)));
      player.combo = Math.max(0, Math.min(9999, Math.floor(Number(msg.combo)||0)));
      broadcast(room, {type:'scores',players:room.players.map(p=>({id:p.id,score:p.score,combo:p.combo}))});
    } else if (msg.type === 'finished' && room.state === 'playing') {
      player.done=true;
      if (room.players.every(p=>p.done)) {
        room.state='lobby'; room.startAt=null; sync(room);
      }
    }
  });
  ws.on('close', ()=>{leave(client); clients.delete(ws);});
  ws.on('error', ()=>{});
});

server.listen(PORT, HOST, ()=>console.log(`SyncMelody Rock rodando em http://localhost:${PORT}`));
export {server};