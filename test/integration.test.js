import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {setTimeout as pause} from 'node:timers/promises';
import {createChart, instruments, songs, instrumentLayouts} from '../music.js';

function waitMessage(ws,predicate=()=>true,timeoutMs=3500){
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{cleanup();reject(new Error('WebSocket message timeout'));},timeoutMs);
    function onMessage(event){
      const data=JSON.parse(String(event.data));
      if(predicate(data)){cleanup();resolve(data);}
    }
    function cleanup(){clearTimeout(timer);ws.removeEventListener('message',onMessage);}
    ws.addEventListener('message',onMessage);
  });
}
function connect(url){
  return new Promise((resolve,reject)=>{
    const ws=new WebSocket(url);
    const timer=setTimeout(()=>{ws.close();reject(Error('WebSocket connect timeout'));},3500);
    ws.addEventListener('open',()=>{clearTimeout(timer);resolve(ws);},{once:true});
    ws.addEventListener('error',e=>{clearTimeout(timer);reject(e);},{once:true});
  });
}
function send(ws,msg){ws.send(JSON.stringify(msg));}

await test('partituras originais: 4 instrumentos, progressão e duração',()=>{
  assert.equal(songs.length,4);assert.equal(instruments.length,4);
  assert.deepEqual(instruments.map(i=>instrumentLayouts[i.id].keys.length),[6,8,5,4]);
  for(const s of songs){
    const chart=createChart(s.id);
    assert.ok(chart.duration>35);
    assert.ok(chart.events.length>200);
    assert.ok(chart.events.every(e=>e.pitch>=25&&e.pitch<=95));
    assert.ok(chart.byPart.guitar.some(n=>n.chord));
    assert.ok(chart.byPart.contrabass.length>=40);
    assert.deepEqual(Object.keys(chart.byPart),['guitar','drums','bass','contrabass']);
    for(let i=1;i<chart.events.length;i++)assert.ok(chart.events[i].t>=chart.events[i-1].t);
    assert.ok(chart.events.every(n=>Number.isFinite(n.t)&&n.lane>=0&&n.lane<instrumentLayouts[n.part].keys.length&&n.index>=0));
    assert.ok(chart.byPart.guitar.length>60);
  }
});

await test('servidor, salas para 4 pessoas, troca de música e início sincronizado',async t=>{
  const temp=net.createServer();
  await new Promise(resolve=>temp.listen(0,'127.0.0.1',resolve));
  const port=temp.address().port;
  await new Promise(resolve=>temp.close(resolve));
  const proc=spawn(process.execPath,['server.js'],{cwd:new URL('..',import.meta.url).pathname,env:{...process.env,PORT:String(port),HOST:'127.0.0.1'},stdio:['ignore','pipe','pipe']});
  t.after(()=>proc.kill('SIGTERM'));
  let up=false;
  for(let i=0;i<60;i++){
    try{const res=await fetch(`http://127.0.0.1:${port}/health`);if(res.ok){up=true;break;}}catch{}
    await pause(30);
  }
  assert.ok(up,'servidor deve iniciar');
  const html=await (await fetch(`http://127.0.0.1:${port}/`)).text();
  assert.match(html,/QUATRO/);
  assert.match(html,/INSTRUMENTOS/);
  assert.equal((await fetch(`http://127.0.0.1:${port}/app.js`)).status,200);
  assert.equal((await fetch(`http://127.0.0.1:${port}/foo-no-exists`)).status,404);
  assert.equal((await fetch(`http://127.0.0.1:${port}/%2e%2e/server.js`)).status,404);
  const base=`ws://127.0.0.1:${port}`;
  const a=await connect(base);const b=await connect(base);const c=await connect(base);const d=await connect(base);const e=await connect(base);
  t.after(()=>{for(const ws of [a,b,c,d,e])ws.close();});
  const joinA=waitMessage(a,m=>m.type==='joined');
  send(a,{type:'create',name:'Ana',instrument:'guitar'});
  const first=await joinA;
  assert.equal(first.room.players.length,1);
  assert.match(first.room.code,/^[A-Z2-9]{6}$/);
  const roomCode=first.room.code;
  const joinB=waitMessage(b,m=>m.type==='joined');
  send(b,{type:'join',code:roomCode,name:'Bia',instrument:'bass'});
  const second=await joinB;assert.equal(second.room.players.length,2);
  const joinC=waitMessage(c,m=>m.type==='joined');
  send(c,{type:'join',code:roomCode,name:'Caio',instrument:'bass'});
  const third=await joinC;assert.equal(third.room.players[2].instrument,'drums');
  const joinD=waitMessage(d,m=>m.type==='joined');
  send(d,{type:'join',code:roomCode,name:'Dani',instrument:'drums'});
  const fourth=await joinD;assert.equal(fourth.room.players.length,4);
  assert.deepEqual(new Set(fourth.room.players.map(p=>p.instrument)),new Set(['guitar','drums','bass','contrabass']));
  const fullError=waitMessage(e,m=>m.type==='error');
  send(e,{type:'join',code:roomCode,name:'E',instrument:'guitar'});
  assert.match((await fullError).message,/4 jogadores/);
  const changed=waitMessage(b,m=>m.type==='room'&&m.room.songId==='marcha-de-aco');
  send(a,{type:'song',songId:'marcha-de-aco'});
  assert.equal((await changed).room.songId,'marcha-de-aco');
  const started=waitMessage(b,m=>m.type==='started');
  send(a,{type:'start'});
  const start=await started;
  assert.equal(start.songId,'marcha-de-aco');
  assert.ok(start.startAt>Date.now()+2000);
  const hit=waitMessage(b,m=>m.type==='hit');
  send(a,{type:'hit',noteIndex:0,score:300,combo:1});
  assert.equal((await hit).instrument,'guitar');
  const sync=waitMessage(b,m=>m.type==='room'&&m.room.hostId!==first.id);
  a.close();
  const newRoom=await sync;
  assert.equal(newRoom.room.hostId,second.id);
});

await test('modo livre: inicio multiplayer, evento de bateria e validacao de teclas',async t=>{
  const temp=net.createServer();await new Promise(r=>temp.listen(0,'127.0.0.1',r));
  const port=temp.address().port;await new Promise(r=>temp.close(r));
  const proc=spawn(process.execPath,['server.js'],{cwd:new URL('..',import.meta.url).pathname,env:{...process.env,PORT:String(port),HOST:'127.0.0.1'},stdio:'ignore'});
  t.after(()=>proc.kill('SIGTERM'));
  let healthy=false;for(let i=0;i<60;i++){
    try{healthy=(await fetch(`http://127.0.0.1:${port}/health`)).ok;if(healthy)break;}catch{}
    await pause(25);
  }
  assert.ok(healthy);
  const host=await connect(`ws://127.0.0.1:${port}`);
  const guest=await connect(`ws://127.0.0.1:${port}`);
  t.after(()=>{host.close();guest.close();});
  const created=waitMessage(host,m=>m.type==='joined');
  send(host,{type:'create',instrument:'guitar',name:'Host'});
  const code=(await created).room.code;
  const joined=waitMessage(guest,m=>m.type==='joined');
  send(guest,{type:'join',code,instrument:'drums',name:'Drummer'});
  await joined;
  const started=waitMessage(guest,m=>m.type==='started');
  send(host,{type:'start',mode:'free'});
  assert.equal((await started).mode,'free');
  const note=waitMessage(host,m=>m.type==='jam');
  send(guest,{type:'jam',lane:7});
  const hit=await note;
  assert.equal(hit.instrument,'drums');assert.equal(hit.lane,7);
  const invalid=waitMessage(host,m=>m.type==='jam'&&m.lane===99,250).then(()=>true,()=>false);
  send(guest,{type:'jam',lane:99});
  assert.equal(await invalid,false);
});
