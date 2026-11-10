const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
let input,now=1000,commands=[],frames=[],catalog={selected:'a',folders:[{id:'a',name:'Images',available:true},{id:'b',name:'Trips',available:true}]};
const timers=[];
const data={empty:true,revision:'empty-a',folder:'Images',message:'Add images to selected folder'};
const c={Date:{now:()=>now},setInterval(fn,ms){timers.push({fn,ms});return fn},clearInterval(){},setTimeout(){},listen(_name,fn){input=fn;return ()=>{}},fetch(url,opt={}){
 let result={ok:true};
 if(url.includes('/folders?'))result=catalog;
 else if(url.includes('/frame?'))result=data;
 else if(url.includes('/display/draw'))frames.push(JSON.parse(opt.body));
 else if(url.includes('/command?')){const command=JSON.parse(opt.body);commands.push(command);if(command.action==='folder')catalog.selected=command.folderId;}
 return Promise.resolve({ok:true,json:()=>Promise.resolve(result)});
}};
const settle=async()=>{for(let i=0;i<5;i++)await new Promise(r=>setImmediate(r));};
vm.runInNewContext(fs.readFileSync('projects/picture-viewer/app/scripts/main.template.js','utf8'),c);
(async()=>{
 await settle();assert.equal(c.folders.length,2);
 input({key:'ok',action:'long'});await settle();assert(c.menuOpen);
 input({key:'ok',action:'short'});await settle();assert(c.menuOpen,'Release after hold must not select immediately');assert.equal(commands.length,0);
 input({key:'encoder',delta:1});await settle();assert.equal(c.menuChoice,1);
 input({key:'ok',action:'short'});await settle();assert.equal(commands.at(-1).folderId,'b');assert(!c.menuOpen);
 input({key:'ok',action:'long'});await settle();assert.equal(c.menuChoice,1,'Reopen at saved folder');input({key:'ok',action:'short'});
 const before=commands.length;input({key:'encoder',delta:-1});input({key:'back',action:'short'});await settle();assert.equal(commands.length,before,'Back must not change folder');
 catalog.folders.push({id:'c',name:'New folder',available:true});input({key:'ok',action:'long'});await settle();assert.equal(c.folders.length,3,'Folder list refreshes each open');input({key:'ok',action:'short'});
 catalog.folders.push({id:'d',name:'Added in Studio',available:true});now+=2500;timers[0].fn();await settle();assert.equal(c.folders.length,4,'Open settings refreshes when Studio adds a folder');
 input({key:'back',action:'short'});await settle();input({key:'ok',action:'short'});await settle();assert.equal(commands.at(-1).action,'toggle','Short click still pauses outside Settings');
 console.log('Passed live-list refresh, hold/release handling, dial highlight, explicit selection, persisted selection, cancel, and normal playback controls.');
})().catch(e=>{console.error(e);process.exitCode=1});
