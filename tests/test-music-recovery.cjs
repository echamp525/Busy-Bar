const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const shared=fs.readFileSync('shared/extension-bridge/connection.js','utf8');
const settle=()=>new Promise(r=>setImmediate(r));
function event(){const listeners=[];return {listeners,addListener(fn){listeners.push(fn)}};}
function worker(name,session={}){
 const sirius=name==='siriusxm',origin=sirius?'https://www.siriusxm.com':'https://music.apple.com';
 const path=sirius?'/player/home':'/us/library/songs',version=sirius?'1.3.0':'1.1.0';
 const polls=[],injections=[],messages=[],alarms=[],badge=[],timers=[],contents=new Map();
 let online=true,tabs=[{id:9,url:origin+path,discarded:false}];
 const chrome={runtime:{onMessage:event(),onInstalled:event(),onStartup:event(),getManifest:()=>({version})},
  storage:{session:{async get(key){return {[key]:session[key]};},async set(value){Object.assign(session,value)},async remove(key){delete session[key]}}},
  action:{onClicked:event(),async setBadgeText(v){badge.push(v.text)},async setTitle(){}},
  alarms:{onAlarm:event(),async create(name,opt){alarms.push({name,...opt})}},
  tabs:{onUpdated:event(),onRemoved:event(),async query(){return tabs},async create(){},async sendMessage(id,msg){messages.push({id,msg});if(!contents.has(id))throw Error('No receiver');return {version:contents.get(id)}}},
  scripting:{async executeScript(options){injections.push(options);contents.set(options.target.tabId,version)}}};
 const context={chrome,URL,AbortSignal,console,setTimeout(fn,ms){timers.push({fn,ms});return timers.length},clearTimeout(){},
  async fetch(url,opt){polls.push({url,opt});if(!online)throw Error('offline');return {ok:true,async json(){return {ok:true,command:null}}}}};
 const template=fs.readFileSync('projects/'+name+'/chrome-extension/background.template.js','utf8');
 context.importScripts=()=>vm.runInContext(shared,context);
 vm.createContext(context);vm.runInContext(template,context);
 async function send(id,meta={},url=origin+path){return new Promise(resolve=>{
  const accepted=chrome.runtime.onMessage.listeners[0]({type:sirius?'busy-bar-poll':'busy-apple-poll',metadata:meta},
   {tab:{id},url,frameId:0},resolve);if(!accepted)resolve('rejected');});}
 return {chrome,send,polls,injections,messages,alarms,badge,timers,contents,session,async recover(){await chrome.alarms.onAlarm.listeners[0]({name:'busy-music-recovery'});await settle();await settle();},
  set online(v){online=v},set tabs(v){tabs=v}};
}
(async()=>{
 for(const name of ['siriusxm','apple-music']){
  const w=worker(name);await settle();await settle();
  assert.equal(w.injections.length,1,'Already-open tabs recover without page reload');
  assert.equal(w.alarms[0].periodInMinutes,.5,'Durable alarm recovers terminated worker');
  await w.recover();assert.equal(w.injections.length,1,'Recovery must not duplicate healthy content scripts');
  const [first,second]=await Promise.all([w.send(9,{playing:true}),w.send(10,{playing:true})]);
  assert.equal(first.ok,true);assert.equal(second.ok,false,'Concurrent tabs must not steal pairing');
  assert.equal(w.polls.length,1);assert(w.polls[0].url.startsWith('http://127.0.0.1:'));
  assert.equal(await w.send(9,{},'https://example.com/'),'rejected');
  w.online=false;assert.equal((await w.send(9)).ok,false);assert.equal(w.badge.at(-1),'PC');
  w.online=true;assert.equal((await w.send(9)).ok,true);assert.equal(w.badge.at(-1),'');
  const restored=worker(name,w.session);await settle();assert.equal((await restored.send(10,{playing:true})).ok,true,'A playing tab may replace paused pairing');
  await restored.send(10,{playing:true});assert.equal((await restored.send(11,{playing:true})).ok,false,'Pair survives worker restart');
  w.tabs=[];await w.recover();assert.equal(w.session.pairing,undefined,'Closed tab releases pairing');assert.equal(w.badge.at(-1),'OPEN');
 }
 console.log('Passed missing-script recovery, duplicate prevention, worker restart, paused-tab wake, alarms, offline/reconnect, loopback, sender validation and tab pairing.');
})().catch(e=>{console.error(e);process.exitCode=1});

