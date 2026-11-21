// Render the complete public document for native browser playback without JavaScript.
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
})[c]);

export function filePath(item) {
  const extensions = {'video/mp4':'mp4','video/webm':'webm','video/quicktime':'mov',
    'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif',
    'image/avif':'avif','audio/mpeg':'mp3','audio/mp4':'m4a','audio/wav':'wav'};
  if (!extensions[item.mime] || !/^[0-9a-f-]{36}$/.test(item.file)) throw new Error('Invalid published file');
  return './published/' + item.file + '.' + extensions[item.mime];
}

function media(item, files, origin) {
  if (item.kind === 'note') return '<p>' + esc(item.text) + '</p>';
  let source, type, embed;
  if (item.kind === 'file') {
    source = files.has(item.file) ? filePath(item) : origin + '/media/' + encodeURIComponent(item.file);
    type = item.mime.split('/')[0];
  } else {
    let link;
    try { link = new URL(item.url); } catch { return ''; }
    if (!['https:','http:'].includes(link.protocol)) return '';
    source = link.href;
    const host = link.hostname.replace(/^www\./,'');
    if (['youtu.be','youtube.com','m.youtube.com'].includes(host)) {
      const id = host === 'youtu.be' ? link.pathname.slice(1) : link.searchParams.get('v') || link.pathname.split('/')[2] || '';
      if (/^[\w-]{11}$/.test(id)) embed = 'https://www.youtube-nocookie.com/embed/' + id;
    } else if (['vimeo.com','player.vimeo.com'].includes(host)) {
      const id = link.pathname.match(/\/(\d+)(?:\/|$)/)?.[1];
      if (id) embed = 'https://player.vimeo.com/video/' + id;
    } else if (['bilibili.com','m.bilibili.com'].includes(host)) {
      const id = link.pathname.match(/\/(BV\w+)/)?.[1];
      if (id) embed = 'https://player.bilibili.com/player.html?bvid=' + id + '&autoplay=0';
    }
    if (/\.(mp4|mov|webm)$/i.test(link.pathname)) type='video';
    if (/\.(jpg|jpeg|png|webp|avif|gif)$/i.test(link.pathname)) type='image';
    if (/\.(mp3|m4a|ogg|wav)$/i.test(link.pathname)) type='audio';
  }
  const src=esc(source), title=esc(item.title || '参考素材');
  let preview='';
  if(type==='video') preview='<video controls playsinline preload="metadata" src="'+src+'"></video>';
  if(type==='audio') preview='<audio controls preload="metadata" src="'+src+'"></audio>';
  if(type==='image') preview='<img loading="lazy" alt="'+title+'" src="'+src+'">';
  if(embed) preview='<iframe title="'+title+'" src="'+esc(embed)+'" loading="lazy" allowfullscreen></iframe>';
  return preview+'<a href="'+src+'">'+(type==='video'?'单独打开影片':'打开原素材')+'</a>';
}

export function renderReader(script, board, files, origin) {
  function figure(item, sectionId) {
    const width=Math.max(20,Math.min(100,Number(item.w)||60));
    return '<figure id="ref-'+esc(sectionId)+'-'+esc(item.id)+'" style="--width:'+width+'%"><figcaption>'+esc(item.title)+'</figcaption>'+media(item, files, origin)+(item.note?'<p>'+esc(item.note)+'</p>':'')+'</figure>';
  }
  function section(id, lines) {
    const items=board.state.boards[id]?.items || [];
    const rows=[...lines,''].map(text=>({text,inline:[],right:[]}));
    for(const item of items){
      const index=/^\d+$/.test(item.anchor) ? Number(item.anchor) : rows.length-1;
      (rows[index]||rows[rows.length-1])[item.placement==='right'?'right':'inline'].push(item);
    }
    // Right references sit outside desktop text flow and follow their paragraph on mobile.
    const right=items.some(item=>item.placement==='right');
    const figures = references => references.map(item => figure(item, id)).join('');
    const content = rows.map(row => {
      const paragraph = row.text ? '<p>'+esc(row.text)+'</p>' : '';
      const side = row.right.length ? '<aside>'+figures(row.right)+'</aside>' : '';
      return paragraph + figures(row.inline) + side;
    }).join('');
    return '<div class="'+(right?'columns':'')+'">'+content+'</div>';
  }
  const chapters=script.chapters.map(c=>'<section id="'+esc(c.id)+'"><h2>'+esc(c.start+'–'+c.end+'｜'+c.number+' '+c.title)+'</h2>'+(c.id==='chapter-01'?'':'<p>'+esc(c.subtitle)+'</p>')+section(c.id,c.paragraphs)+'</section>').join('');
  const stamp=board.updatedAt?' · '+new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(board.updatedAt)):'';
  return '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>muShenzhen 2026 — 脚本与参考</title><style>'+
    'body{font:16px/1.8 system-ui,sans-serif;color:#111;background:white;margin:0}header,main{max-width:1120px;margin:auto;padding:12px 20px}header{font-size:14px;border-bottom:1px solid #ddd}header span{margin-left:1em;color:#555}a{color:#185abc}h1{font-size:26px}h2{font-size:20px}p,figcaption{white-space:pre-wrap;overflow-wrap:anywhere}section{margin:2.5rem 0}figure{margin:1rem 0;width:var(--width);min-width:min(180px,100%);max-width:100%}img,video,audio,iframe{display:block;width:100%;height:auto;max-height:75vh}iframe{border:0;aspect-ratio:16/9}figure a{font-size:14px}@media(min-width:900px){.columns{display:flow-root;padding-right:33%}.columns aside{float:right;clear:right;width:44%;margin-right:-49%}.columns aside figure:first-child{margin-top:0}}@media(max-width:899px){figure{width:100%}}'+
    '</style></head><body><header><a href="./index.html?edit=1">编辑参考</a><span>已发布'+esc(stamp)+'</span></header><main><h1>'+esc(script.intro[0])+'</h1><h2>'+esc(script.intro[1])+'</h2><p>'+esc(script.intro[2])+'</p>'+section('global',script.intro.slice(3))+chapters+'</main></body></html>';
}
