import {readFile,writeFile,mkdir,rm,rename,stat} from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import path from 'node:path';
import {filePath,renderReader} from '../pages/reader.js';

const output=process.argv[2];
if(!output) throw new Error('Specify the publication directory.');
const source='https://mushenzhen-script.pages.dev';
async function get(url) {
  const response=await fetch(url,{signal:AbortSignal.timeout(120000)});
  if(!response.ok) throw new Error('Publication download failed with HTTP '+response.status);
  return response;
}
const board=await (await get(source+'/api/board')).json();
if (!board.state?.boards || typeof board.revision!=='string') throw new Error('Incomplete shared board');
const script=JSON.parse(await readFile('public/script.json','utf8'));
const folder=path.join(output,'published');
await rm(folder,{recursive:true,force:true}); await mkdir(folder,{recursive:true});
const files=new Set();
let copiedBytes=0;
const maxFile=process.argv.includes('--cloudflare') ? 24*1024*1024 : 90*1024*1024;
for (const group of Object.values(board.state.boards)){
  for (const item of group.items){
    if(item.kind!=='file'||files.has(item.file))continue;
    const target=path.join(output,filePath(item));
    const response=await get(source+'/media/'+item.file);
    const length=Number(response.headers.get('content-length'));
    if(!length || length>maxFile || copiedBytes+length>800*1024*1024){
      await response.body.cancel();
      continue;
    }
    await pipeline(Readable.fromWeb(response.body),createWriteStream(target+'.part'));
    if((await stat(target+'.part')).size!==length) throw new Error('Incomplete published media');
    await rename(target+'.part',target);
    copiedBytes+=length;files.add(item.file);
  }
}
await writeFile(path.join(folder,'version.json'),JSON.stringify({revision:board.revision,files:[...files]}));
await writeFile(path.join(output,'read.html'),renderReader(script,board,files,source));
console.log('Prepared published reader:',files.size,'static media files,',copiedBytes,'bytes.');
