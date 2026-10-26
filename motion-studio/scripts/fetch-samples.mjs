import {mkdir,access,writeFile} from 'node:fs/promises';
const samples={'sample-character.png':'https://v3b.fal.media/files/b/0a90ffa7/TNErq9yD7ZxGRATjfAqnh_EIgJSN67.png','sample-motion.mp4':'https://v3b.fal.media/files/b/0a90ff92/hklvF__w53diz6Rve7f5__JuDW2xl0mr6sJ_Kjz3Vxe_vidoeook%20(1)_1.mp4'};
await mkdir('public/assets',{recursive:true});
for(const [name,url] of Object.entries(samples)){const path='public/assets/'+name;try{await access(path);continue}catch{}const response=await fetch(url,{signal:AbortSignal.timeout(60000)});if(!response.ok)throw new Error(`Sample download failed: ${response.status}`);await writeFile(path,new Uint8Array(await response.arrayBuffer()))}
