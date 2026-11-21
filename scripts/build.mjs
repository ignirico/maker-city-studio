import { readFile, writeFile, mkdir, rm, cp } from 'node:fs/promises';
const types={'index.html':'text/html; charset=utf-8','style.css':'text/css; charset=utf-8','app.js':'text/javascript; charset=utf-8','script.json':'application/json; charset=utf-8'};
const assets=Object.fromEntries(await Promise.all(Object.entries(types).map(async([file,type])=>[file,{type,body:await readFile('public/'+file,'utf8')}])));
await rm('dist',{recursive:true,force:true});await mkdir('dist/server',{recursive:true});await mkdir('dist/.openai',{recursive:true});
await writeFile('dist/server/index.js','const ASSETS = '+JSON.stringify(assets)+';\n'+await readFile('worker/index.js','utf8'));
await writeFile('dist/.openai/hosting.json',await readFile('.openai/hosting.json'));
await rm('docs',{recursive:true,force:true});await cp('public','docs',{recursive:true});await writeFile('docs/.nojekyll','');
console.log('Built embedded Worker and shared-board API.');

// Cloudflare Pages serves the document and streams the existing shared files from the same origin.
await cp('public', 'dist/pages', {recursive:true});
await cp('pages', 'dist/pages', {recursive:true});
