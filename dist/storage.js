let db;
export async function openStorage() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open("orbit-studio-v1", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("data");
    r.onsuccess = () => {
      db = r.result;
      resolve();
    };
    r.onerror = () =>
      reject(
        Error("Local storage is unavailable. Export your session to keep it."),
      );
  });
}
const pause=()=>new Promise(resolve=>setTimeout(resolve,0));
async function get(key){return new Promise((resolve,reject)=>{const r=db.transaction('data').objectStore('data').get(key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(Error('Saved data could not be read.'));});}
async function put(key,value){return new Promise((resolve,reject)=>{const tx=db.transaction('data','readwrite');tx.objectStore('data').put(value,key);tx.oncomplete=resolve;tx.onerror=()=>reject(Error('Storage is full or unavailable. Export a backup.'));});}
async function deleteKeys(keys){if(!keys.length)return;return new Promise(resolve=>{const tx=db.transaction('data','readwrite');for(const key of keys)tx.objectStore('data').delete(key);tx.oncomplete=resolve;tx.onerror=resolve;});}
function wheelGroups(payload){return Array.isArray(payload)?payload.flatMap(record=>record.configuration?.wheels?[record.configuration.wheels]:[]):payload?.wheels?[payload.wheels]:[];}
function copyMetadata(payload){return Array.isArray(payload)?payload.map(record=>({...record,configuration:{...record.configuration,wheels:record.configuration.wheels.map(w=>({...w,entries:[]}))}})):{...payload,wheels:payload.wheels.map(w=>({...w,entries:[]}))};}
export async function read(key){if(!db)return null;const stored=await get(key);if(stored?.storageFormat!=='orbit-chunked-v1')return stored;const payload=stored.payload;for(const wheels of wheelGroups(payload))for(const wheel of wheels){const entries=new Array(wheel.entryCount);let offset=0;for(const chunkKey of wheel.entryChunks){const rows=await get(chunkKey);if(!Array.isArray(rows))throw Error('A saved list is incomplete. Open an exported backup.');for(const [id,text,weight,color,image,enabled] of rows)entries[offset++]={id,text,weight,color,image,enabled};await pause();}if(offset!==entries.length)throw Error('A saved list is incomplete.');wheel.entries=entries;delete wheel.entryChunks;delete wheel.entryCount;}return payload;}
let saveQueue=Promise.resolve();
export function write(key,data){if(!db)return Promise.reject(Error('Storage is unavailable. Export your session to keep it.'));const revision=data?.revision;const run=()=>writeNow(key,data,revision);const result=saveQueue.then(run,run);saveQueue=result.catch(()=>{});return result;}
async function writeNow(key,data,revision){if(revision!==undefined&&data.revision!==revision)return false;const groups=wheelGroups(data);const total=groups.reduce((n,group)=>n+group.reduce((m,w)=>m+w.entries.length,0),0);const old=await get(key);if(total<=10000){await put(key,data);if(old?.storageFormat==='orbit-chunked-v1')await deleteKeys(old.chunkKeys);return true;}const generation=crypto.randomUUID(),payload=copyMetadata(data),copies=wheelGroups(payload),chunkKeys=[];try{for(let group=0;group<groups.length;group++)for(let wheelIndex=0;wheelIndex<groups[group].length;wheelIndex++){const source=groups[group][wheelIndex],target=copies[group][wheelIndex];target.entryCount=source.entries.length;target.entryChunks=[];for(let from=0;from<source.entries.length;from+=2000){if(revision!==undefined&&data.revision!==revision){await deleteKeys(chunkKeys);return false;}const chunkKey=`orbit/chunks/${key}/${generation}/${group}/${wheelIndex}/${from}`,rows=source.entries.slice(from,from+2000).map(e=>[e.id,e.text,e.weight,e.color,e.image,e.enabled]);await put(chunkKey,rows);chunkKeys.push(chunkKey);target.entryChunks.push(chunkKey);await pause();}}if(revision!==undefined&&data.revision!==revision){await deleteKeys(chunkKeys);return false;}await put(key,{storageFormat:'orbit-chunked-v1',payload,chunkKeys});if(old?.storageFormat==='orbit-chunked-v1')await deleteKeys(old.chunkKeys);return true;}catch(error){await deleteKeys(chunkKeys);throw error;}}
export function download(text, name, type = "application/json") {
  const url = URL.createObjectURL(new Blob([text], { type })),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
export async function optimizeImage(file) {
  if (
    !file ||
    !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
    file.size > 10000000
  )
    throw Error("Choose a PNG, JPEG or WebP image under 10 MB.");
  let image;
  try {
    image = await createImageBitmap(file);
  } catch {
    throw Error("This image could not be opened.");
  }
  const scale = Math.min(1, 256 / image.width, 256 / image.height),
    canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
  image.close();
  return canvas.toDataURL("image/webp", 0.8);
}
