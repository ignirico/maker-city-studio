import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { MemoryBucket } from './memory-bucket.mjs';
import worker from '../worker/index.js';
const env={BUCKET:new MemoryBucket(),EDITOR_KEY:'local-preview-only'};
const files={'/':'index.html','/index.html':'index.html','/app.js':'app.js','/style.css':'style.css','/script.json':'script.json'};
const types={'html':'text/html','js':'text/javascript','css':'text/css','json':'application/json'};
http.createServer(async(req,res)=>{
  try {
    const pathname=new URL(req.url,'http://localhost').pathname;
    if(files[pathname]){const file=files[pathname];res.setHeader('Content-Type',types[file.split('.').pop()]+'; charset=utf-8');res.end(await readFile(new URL('../public/'+file,import.meta.url)));return;}
    const hasBody=!['GET','HEAD'].includes(req.method);
    const request=new Request('http://127.0.0.1:4173'+req.url,{method:req.method,headers:req.headers,...(hasBody?{body:Readable.toWeb(req),duplex:'half'}:{})});
    const response=await worker.fetch(request,env);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
  }catch(e){res.writeHead(500);res.end(e.message);}
}).listen(4173,'127.0.0.1',()=>console.log('Local preview: http://127.0.0.1:4173'));
