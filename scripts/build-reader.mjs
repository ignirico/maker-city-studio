import {readFile, writeFile, mkdir, rm, rename, copyFile, stat, mkdtemp} from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {tmpdir} from 'node:os';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import path from 'node:path';
import {filePath, renderReader} from '../pages/reader.js';

const run = promisify(execFile);
const output = process.argv[2];
if (!output) throw new Error('Specify the publication directory.');
const source = 'https://mushenzhen-script.pages.dev';

async function get(url) {
  const response = await fetch(url, {signal: AbortSignal.timeout(180000)});
  if (!response.ok) throw new Error('Publication download failed with HTTP ' + response.status);
  return response;
}

async function makePreview(input, target) {
  // Keep the upload untouched. Bound the preview resolution and frame rate for software decoding.
  await run('ffmpeg', ['-nostdin','-v','error','-y','-i',input,'-map','0:V:0','-map','0:a:0?',
    '-vf',"scale=w='min(1280,iw)':h='min(1280,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1",
    '-fpsmax','30','-c:v','libx264','-threads','3','-preset','veryfast','-crf','21',
    '-pix_fmt','yuv420p','-c:a','aac','-b:a','128k','-ac','2','-movflags','+faststart',
    '-map_metadata','-1','-f','mp4',target]);
}

const board = await (await get(source + '/api/board')).json();
if (!board.state?.boards || typeof board.revision !== 'string') throw new Error('Incomplete shared board');
const script = JSON.parse(await readFile('public/script.json','utf8'));
const folder = path.join(output,'published');
const previewDir = path.join(output,'previews');
for (const dir of [folder, previewDir]) {
  await rm(dir,{recursive:true,force:true});
  await mkdir(dir,{recursive:true});
}
const files = new Set(), previews = new Set(), seen = new Set();
const maxFile = (process.argv.includes('--cloudflare') ? 24 : 90) * 1024 * 1024;
let copiedBytes = 0;
const temp = await mkdtemp(path.join(tmpdir(), 'script-publication-'));
try {
  for (const group of Object.values(board.state.boards)) {
    for (const item of group.items) {
      if (item.kind !== 'file' || seen.has(item.file)) continue;
      seen.add(item.file);
      const originalTarget = path.join(output,filePath(item));
      const video = item.mime.startsWith('video/');
      const response = await get(source + '/media/' + item.file);
      const length = Number(response.headers.get('content-length'));
      if (!video && (length > maxFile || copiedBytes + length > 800 * 1024 * 1024)) {
        await response.body.cancel();
        continue;
      }
      const raw = path.join(temp, 'original');
      await pipeline(Readable.fromWeb(response.body), createWriteStream(raw));
      const size = (await stat(raw)).size;
      if (!size || (length && size !== length)) throw new Error('Incomplete published media');
      let result = raw;
      if (video) {
        try {
          const converted = path.join(temp,'preview.mp4');
          await makePreview(raw,converted);
          result = converted;
        } catch (error) {
          if (error.code === 'ENOENT') throw error;
          console.warn('Could not convert uploaded video', item.file, 'Using its original file.');
        }
      }
      if (video) {
        const poster = path.join(previewDir,item.file+'.jpg');
        try {
          await run('ffmpeg',['-nostdin','-v','error','-y','-i',result,'-map','0:V:0',
            '-vf',"scale=w='min(800,iw)':h='min(800,ih)':force_original_aspect_ratio=decrease,thumbnail=30",
            '-frames:v','1','-q:v','3','-threads','1','-update','1',poster]);
        } catch (error) {
          if (error.code === 'ENOENT') throw error;
          console.warn('No poster could be extracted for',item.file);
        }
      }
      const converted = result !== raw;
      const resultSize = (await stat(result)).size;
      if (resultSize <= maxFile && copiedBytes + resultSize <= 800 * 1024 * 1024) {
        const target = converted ? path.join(previewDir,item.file + '.mp4') : originalTarget;
        // The output directory and the system temporary directory can be on different volumes.
        await copyFile(result, target + '.part');
        await rename(target + '.part',target);
        copiedBytes += resultSize;
        (converted ? previews : files).add(item.file);
      }
    }
  }
} finally {
  await rm(temp,{recursive:true,force:true});
}
await writeFile(path.join(folder,'version.json'), JSON.stringify({revision:board.revision, files:[...files], previews:[...previews]}));
await writeFile(path.join(output,'read.html'),renderReader(script,board,files,source,previews));
console.log('Published',previews.size,'MP4 previews and',files.size,'other files;',copiedBytes,'bytes.');
