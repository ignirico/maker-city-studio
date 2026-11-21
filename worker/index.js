// Assets are embedded by scripts/build.mjs. BUCKET is provisioned by Sites.
const MAX_FILE = 90 * 1024 * 1024;
const MAX_STATE = 2 * 1024 * 1024;
const ORIGIN = 'https://ignirico.github.io';
const MIME_TYPES = new Set(['image/jpeg','image/png','image/webp','image/gif','image/avif','video/mp4','video/webm','video/quicktime','audio/mpeg','audio/mp4','audio/wav']);
const BOARD_IDS = new Set(['global', ...Array.from({length:7},(_,i)=>'chapter-0'+(i+1))]);
const CORS = {'Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Methods':'GET, HEAD, POST, PUT, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization, If-Match','Access-Control-Max-Age':'86400','Vary':'Origin'};
const json = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), {status,headers:{...CORS,'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});
const safeUrl = value => {try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)}catch{return false}};
export function validateState(state) {
  if (!state || typeof state !== 'object' || !state.boards || typeof state.boards !== 'object' || Array.isArray(state.boards)) throw new Error('画板格式无效');
  const clean = {boards:{}}; let total = 0;
  const text = (v,n) => typeof v === 'string' ? v.slice(0,n) : '';
  const num = (v,min,max) => typeof v === 'number' && Number.isFinite(v) ? Math.max(min,Math.min(max,v)) : min;
  for (const [id,b] of Object.entries(state.boards)) {
    if (!BOARD_IDS.has(id) || !b || !Array.isArray(b.items) || b.items.length > 150) throw new Error('画板章节或卡片数量无效');
    total+=b.items.length; if (total>600) throw new Error('参考卡片总数不能超过 600');
    const ids=new Set();
    clean.boards[id]={height:num(b.height,620,20000),items:b.items.map(item=>{
      if (!item || !['file','note','link'].includes(item.kind) || !/^[a-zA-Z0-9-]{1,80}$/.test(item.id) || ids.has(item.id)) throw new Error('卡片格式无效'); ids.add(item.id);
      const w=num(item.w,20,100);
      const result={id:item.id,kind:item.kind,title:text(item.title,120),note:text(item.note,2000),color:['dark','sage','coral','paper'].includes(item.color)?item.color:'dark',x:num(item.x,0,100-w),y:num(item.y,0,18000),w,h:num(item.h,180,1600),z:num(item.z,0,100000)};
      if (item.placement !== undefined) {
        if (!['inline', 'right'].includes(item.placement)) throw new Error('参考显示位置无效');
        result.placement = item.placement;
      }
      if(item.anchor!==undefined){if(item.anchor!=='end'&&!/^\d{1,3}$/.test(item.anchor))throw new Error('参考位置无效');result.anchor=String(item.anchor);}
      if (item.kind==='note') result.text=text(item.text,4000);
      if (item.kind==='link') {if(typeof item.url!=='string'||item.url.length>2048||!safeUrl(item.url))throw new Error('参考链接无效');result.url=item.url;}
      if (item.kind==='file') {if(!/^[0-9a-f-]{36}$/.test(item.file)||!MIME_TYPES.has(item.mime))throw new Error('素材文件无效');result.file=item.file;result.mime=item.mime;}
      return result;
    })};
  }
  return clean;
}
async function authenticated(request, env) {
  if (!env.EDITOR_KEY) return false;
  const token=request.headers.get('Authorization')?.replace(/^Bearer /,'')||'';
  if(token.length>200)return false;
  const hash=async str=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(str)));
  const [a,b]=await Promise.all([hash(token),hash(env.EDITOR_KEY)]);let diff=0;for(let i=0;i<a.length;i++)diff|=a[i]^b[i];return diff===0;
}
export default {
  async fetch(request, env) {
    const url=new URL(request.url),path=url.pathname;
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:CORS});
    try {
      if(path==='/api/auth') {
        if(request.method!=='POST')return json({error:'方法不支持'},405);
        return await authenticated(request,env)?json({ok:true}):json({error:'编辑口令不正确，请检查后重试。'},401);
      }
      if(path==='/api/board') {
        if(request.method==='GET') {
          const object=await env.BUCKET.get('state/board.json');
          if(!object)return json({state:{boards:{}},revision:'seed',updatedAt:null});
          const data=await object.json();return json({...data,revision:object.etag});
        }
        if(request.method!=='PUT')return json({error:'方法不支持'},405);
        if(!await authenticated(request,env))return json({error:'请先输入编辑口令。'},401);
        const raw=await request.text();if(new TextEncoder().encode(raw).length>MAX_STATE)return json({error:'画板内容过大，请精简文字。'},413);
        let state;try{state=validateState(JSON.parse(raw))}catch(error){return json({error:error.message},400)}
        const revision=request.headers.get('If-Match');if(!revision)return json({error:'缺少版本，请刷新后重试。'},428);
        const updatedAt=new Date().toISOString();
        const object=await env.BUCKET.put('state/board.json',JSON.stringify({state,updatedAt}),{httpMetadata:{contentType:'application/json'},onlyIf:revision==='seed'?{etagDoesNotMatch:'*'}:{etagMatches:revision}});
        if(!object)return json({error:'另一位编辑刚发布了新版本。为避免覆盖，你的修改未发布，已下载备份；请先保存当前想法，再刷新合并。'},409);
        return json({ok:true,revision:object.etag,updatedAt});
      }
      if(path==='/api/upload') {
        if(request.method!=='POST')return json({error:'方法不支持'},405);
        if(!await authenticated(request,env))return json({error:'请先输入编辑口令。'},401);
        const mime=request.headers.get('Content-Type')?.split(';')[0];
        if(!MIME_TYPES.has(mime))return json({error:'不支持此文件格式。'},415);
        const size=Number(request.headers.get('Content-Length'));
        if(!Number.isFinite(size)||size<1||size>MAX_FILE)return json({error:'单个文件需为 1 字节至 90 MB。大文件请添加影片链接。'},413);
        const key=crypto.randomUUID();
        await env.BUCKET.put('media/'+key,request.body,{httpMetadata:{contentType:mime,cacheControl:'public, max-age=31536000, immutable'}});
        return json({key,size,mime},201);
      }
      if(path.startsWith('/media/')) {
        if(!['GET','HEAD'].includes(request.method))return json({error:'方法不支持'},405);
        const key=path.slice(7);if(!/^[0-9a-f-]{36}$/.test(key))return json({error:'文件不存在'},404);
        const object=await env.BUCKET.get('media/'+key,{range:request.headers});
        if(!object)return json({error:'文件不存在'},404);
        const headers=new Headers({...CORS,'X-Content-Type-Options':'nosniff','Accept-Ranges':'bytes','ETag':object.httpEtag,'Cache-Control':'public, max-age=31536000, immutable'});object.writeHttpMetadata(headers);
        let code=200;if(object.range){const {offset=0,length}=object.range;headers.set('Content-Range',`bytes ${offset}-${offset+length-1}/${object.size}`);headers.set('Content-Length',String(length));code=206;}else headers.set('Content-Length',String(object.size));
        return new Response(request.method==='HEAD'?null:object.body,{status:code,headers});
      }
      if(path.startsWith('/api/'))return json({error:'接口不存在'},404);
      if(!['GET','HEAD'].includes(request.method))return json({error:'方法不支持'},405);
      const asset=ASSETS[path==='/'?'index.html':path.slice(1)];
      if(!asset)return new Response('Not found',{status:404});
      return new Response(request.method==='HEAD'?null:asset.body,{headers:{'Content-Type':asset.type,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow','Referrer-Policy':'strict-origin-when-cross-origin','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src https: http: data:; media-src https: http:; frame-src https://www.youtube-nocookie.com https://player.vimeo.com https://player.bilibili.com; connect-src 'self' https://maker-city-reference-studio.ignirico.chatgpt.site; base-uri 'self'; object-src 'none'; form-action 'self'"}});
    } catch(error) {console.error('Request failed',error.message);return json({error:'共享服务暂时不可用，请稍后重试。'},503);}
  }
};
