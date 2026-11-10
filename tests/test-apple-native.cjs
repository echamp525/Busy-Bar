const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const settle=()=>new Promise(r=>setImmediate(r));
let input,frame,number=0;const commands=[];
let live={attached:true,track:{title:'Love Shack',artist:"The B-52's",playing:true,signedIn:true},library:{state:'idle'}};
const c={setInterval(){},clearInterval(){},setTimeout(){},listen(name,fn){input=fn;return ()=>{};},fetch(url,options){
 let data={};if(url.includes('/state'))data=live;
 if(url.includes('/display/draw'))frame=JSON.parse(options.body);
 if(url.includes('/command')){const body=JSON.parse(options.body);commands.push(body);data={ok:true,requestId:'r'+(++number)};}
 return Promise.resolve({ok:true,json:()=>Promise.resolve(data)});
}};
vm.runInNewContext(fs.readFileSync('projects/apple-music/app/scripts/main.template.js','utf8'),c);
const click=()=>{input({key:'ok',action:'press'});input({key:'ok',action:'short'});};
(async()=>{
 await settle();await settle();assert.equal(frame.elements.find(e=>e.id==='header').text,'Love Shack');
 input({key:'ok',action:'long'});assert.equal(c.view,'root');
 input({key:'ok',action:'short'});assert.equal(c.view,'root','Hold release must not select');
 input({key:'encoder',delta:1});click();await settle();await settle();
 assert.equal(commands.at(-1).scope,'playlists');assert.equal(c.view,'loading');
 live={...live,library:{state:'ok',scope:'playlists',requestId:'old',items:[{id:'stale',title:'Stale'}]}};
 c.refresh();await settle();await settle();assert.equal(c.view,'loading','Ignore a stale list response');
 live.library={state:'ok',scope:'playlists',requestId:'r1',items:[{id:'playlist:test',title:'Test playlist'}]};
 c.refresh();await settle();await settle();assert.equal(c.view,'list');click();await settle();await settle();
 assert.equal(commands.at(-1).scope,'playlist');assert.equal(commands.at(-1).parent,'playlist:test');
 live.library={state:'ok',scope:'playlist',requestId:'r2',items:[{id:'track:1',title:'Song',artist:'Artist'}]};
 c.refresh();await settle();await settle();click();await settle();await settle();
 assert.equal(commands.at(-1).action,'play');assert.equal(commands.at(-1).item,'track:1');assert.equal(c.view,'playing');
 input({key:'start',action:'short'});await settle();await settle();assert.equal(commands.at(-1).action,'toggle');
 input({key:'encoder',delta:-1});await settle();await settle();assert.equal(commands.at(-1).action,'previous');
 input({key:'ok',action:'long'});input({key:'back',action:'short'});assert.equal(c.view,'playing');assert.equal(c.stopped,false);
 console.log('Passed metadata, hold/click menu, playlist/song selection, stale-response isolation, playback controls and cancel.');
})().catch(e=>{console.error(e);process.exitCode=1;});
