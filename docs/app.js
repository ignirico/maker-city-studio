const mobileOrigin = 'https://mushenzhen-script.pages.dev';
const storageOrigin = 'https://maker-city-reference-studio.ignirico.chatgpt.site';
const sharedOrigins = location.hostname === 'ignirico.github.io'
  ? [mobileOrigin, storageOrigin]
  : [location.origin];
let activeOrigin = sharedOrigins[0];

function editorSession(value) {
  try {
    if (value === undefined) return sessionStorage.getItem('maker-editor') || '';
    if (value) sessionStorage.setItem('maker-editor', value);
    else sessionStorage.removeItem('maker-editor');
  } catch {
    // Reading and editing still work when the browser disables session storage.
  }
  return '';
}
const $ = (selector,root=document) => root.querySelector(selector);
const $$ = (selector,root=document) => [...root.querySelectorAll(selector)];
const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let script, state={boards:{}}, revision='seed', token=editorSession(), editing=false, dirty=false, busy=false, online=false, editVersion=0, chapter='global', anchor='end', editingItem=null, dragged=null, messageTimer;
const names={global:'影片概述 / 整体参考'};
const wideScreen = window.matchMedia('(min-width: 900px)');
let layoutFrame = 0;
const railObserver = window.ResizeObserver ? new ResizeObserver(queueRailLayout) : null;

function queueRailLayout() {
  if (layoutFrame) return;
  layoutFrame = requestAnimationFrame(() => {
    layoutFrame = 0;
    for (const rail of $$('.reference-rail:not([hidden])')) alignRail(rail);
  });
}

// Place references beside their paragraphs when space allows. Resolve collisions
// in the rail only, so media loading or resizing cannot add gaps between paragraphs.
function alignRail(rail) {
  const scriptColumn = rail.previousElementSibling;
  const columnTop = scriptColumn.getBoundingClientRect().top;
  const groups = [...rail.children];
  const gap = 16;
  const heights = groups.map(group => group.getBoundingClientRect().height);
  const positions = groups.map(group => {
    const anchorZone = $(`.reference-zone[data-anchor="${group.dataset.anchor}"]`, scriptColumn);
    return anchorZone.parentElement.getBoundingClientRect().top - columnTop;
  });
  let bottom = scriptColumn.getBoundingClientRect().height;
  for (let i = groups.length - 1; i >= 0; i--) {
    positions[i] = Math.min(positions[i], bottom - heights[i]);
    bottom = positions[i] - gap;
  }
  let previousBottom = 0;
  groups.forEach((group, i) => {
    const top = Math.max(positions[i], previousBottom + (i ? gap : 0));
    group.style.marginTop = (top - previousBottom) + 'px';
    previousBottom = top + heights[i];
  });
}

// A media element has one home at a time, including on narrow screens.
function arrangeSideReferences() {
  railObserver?.disconnect();
  let hasSideReferences = false;
  for (const layout of $$('.chapter-layout')) {
    const rail = $('.reference-rail', layout);
    const scriptColumn = $('.script-column', layout);
    const groups = [...$$('.side-zone', layout)].sort((a, b) =>
      anchorOrder(a.dataset.anchor) - anchorOrder(b.dataset.anchor));
    rail.hidden = !groups.length || !wideScreen.matches;
    layout.classList.toggle('has-rail', !rail.hidden);
    if (groups.length) hasSideReferences = true;
    for (const group of groups) {
      if (wideScreen.matches) {
        rail.append(group);
        railObserver?.observe(group);
      } else {
        const inlineZone = $(`.reference-zone:not(.side-zone)[data-anchor="${group.dataset.anchor}"]`, scriptColumn);
        inlineZone.after(group);
        group.style.marginTop = '';
      }
    }
    if (!rail.hidden) railObserver?.observe(scriptColumn);
  }
  $('#document').classList.toggle('with-side-references', hasSideReferences);
  queueRailLayout();
}

function anchorOrder(anchor) {
  return anchor === 'end' ? Infinity : Number(anchor);
}

function referenceZone(chapterId, item) {
  const layout = document.getElementById(chapterId === 'global' ? 'global' : 'content-' + chapterId);
  if (!layout) return null;
  const anchor = /^\d+$/.test(item.anchor || '') ? item.anchor : 'end';
  const inlineZone = $(`.script-column .reference-zone:not(.side-zone)[data-anchor="${anchor}"]`, layout)
    || $('.script-column .reference-zone[data-anchor="end"]', layout);
  if (item.placement !== 'right') return inlineZone;
  let sideZone = $(`.side-zone[data-anchor="${inlineZone.dataset.anchor}"]`, layout);
  if (!sideZone) {
    sideZone = document.createElement('div');
    sideZone.className = 'reference-zone side-zone';
    sideZone.dataset.chapter = chapterId;
    sideZone.dataset.anchor = inlineZone.dataset.anchor;
    inlineZone.after(sideZone);
  }
  return sideZone;
}

if (wideScreen.addEventListener) wideScreen.addEventListener('change', arrangeSideReferences);
else wideScreen.addListener(arrangeSideReferences);
if (!railObserver) window.addEventListener('resize', queueRailLayout);
function message(text){$('#message').textContent=text;$('#message').hidden=false;clearTimeout(messageTimer);messageTimer=setTimeout(()=>$('#message').hidden=true,6000)}
function status(text){$('#status').textContent=text}
function changed(){dirty=true;editVersion++;status('有未发布的修改')}
function board(id){return state.boards[id] ||= {items:[],height:720}}
function safeURL(value){try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)?u:null}catch{return null}}
async function api(path,options={}){const r=await fetch(activeOrigin+path,{...options,headers:{...(token?{Authorization:'Bearer '+token}:{}),...options.headers}});let data;try{data=await r.json()}catch{throw new Error('共享服务暂时无法连接，请稍后重试。')}if(!r.ok){const e=new Error(data.error||'请求失败');e.status=r.status;throw e}return data}
async function fetchBoard(origin) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    // Public reads need no editor credential or CORS preflight.
    const response = await fetch(origin + '/api/board', {
      signal: controller.signal, credentials: 'omit', cache: 'no-store',
    });
    if (!response.ok) throw new Error('共享资料读取失败');
    const data = await response.json();
    if (!data?.state?.boards || typeof data.revision !== 'string') throw new Error('共享资料格式错误');
    return data;
  } finally {
    clearTimeout(timer);
  }
}

async function load() {
  $('#retry').hidden = true;
  $('#edit').disabled = true;
  status('正在读取共享参考…');
  let boardData;
  for (const origin of sharedOrigins) {
    try {
      boardData = await fetchBoard(origin);
      activeOrigin = origin;
      break;
    } catch {
      // Try the next read endpoint. Mutations are sent only once.
    }
  }
  if (!boardData) {
    const reader = location.hostname.endsWith('.chatgpt.site') ? 'https://ignirico.github.io/maker-city-studio/read.html' : './read.html';
    const link = $('#read-published');
    link.href = reader + location.hash;
    link.hidden = false;
    if (!new URLSearchParams(location.search).has('edit') && ['ignirico.github.io','mushenzhen-script.pages.dev'].includes(location.hostname)) {
      location.replace(link.href);
      return;
    }
    online = false;
    status('未能连接共享参考');
    $('#retry').hidden = false;
    return;
  }
  $('#read-published').hidden = true;
  state = boardData.state;
  revision = boardData.revision;
  online = true;
  try {
    renderReferences();
    status('已连接共享参考');
    $('#edit').disabled = false;
  } catch {
    online = false;
    status('已读取共享参考，显示时遇到问题');
    $('#retry').hidden = false;
  }
}
$('#retry').onclick = load;
function paragraphs(id){return id==='global'?script.intro.slice(3):script.chapters.find(c=>c.id===id).paragraphs}
function renderDocument(){
 $('#document').innerHTML=`<h1>${esc(script.intro[0])}</h1><h2 style="margin-top:5px">${esc(script.intro[1])}</h2><p>${esc(script.intro[2])}</p><p class="editor-help" hidden>添加或编辑参考时，可选择「段落下方」或「右栏」。拖动「移动」可换位置；拖右下角可调宽度；完成后点击「发布更新」。手机可通过「编辑」选择放置段落。</p>`+renderSection('global')+script.chapters.map(c=>`<section id="${c.id}"><h2>${c.start}–${c.end}｜${c.number} ${esc(c.title)}<a class="chapter-link" href="#${c.id}">本节链接</a></h2>${c.id==='chapter-01'?'':`<p class="subtitle">${esc(c.subtitle)}</p>`}${renderSection(c.id)}</section>`).join('');
 $$('.add-reference,.inline-add').forEach(b=>b.onclick=()=>openReference(b.dataset.chapter,b.dataset.anchor));
 const documentView = $('#document');
 documentView.ondragover = event => {
   const zone = event.target.closest('.reference-zone');
   if (!editing || !zone || (!dragged && !event.dataTransfer.types.includes('Files'))) return;
   event.preventDefault();
   zone.classList.add('drop-over');
 };
 documentView.ondragleave = event => {
   const zone = event.target.closest('.reference-zone');
   if (zone && !zone.contains(event.relatedTarget)) zone.classList.remove('drop-over');
 };
 documentView.ondrop = event => {
   const zone = event.target.closest('.reference-zone');
   if (!editing || !zone) return;
   event.preventDefault();
   zone.classList.remove('drop-over');
   if (dragged) {
     const source = board(dragged.chapter);
     const index = source.items.findIndex(item => item.id === dragged.id);
     if (index < 0) return;
     const [item] = source.items.splice(index, 1);
     item.anchor = zone.dataset.anchor;
     item.placement = zone.classList.contains('side-zone') ? 'right' : 'inline';
     board(zone.dataset.chapter).items.push(item);
     dragged = null;
     changed();
     renderReferences();
   } else if (event.dataTransfer.files.length) {
     openReference(zone.dataset.chapter, zone.dataset.anchor);
     $('#files').files = event.dataTransfer.files;
     if (zone.classList.contains('side-zone')) $('#placement').value = 'right';
   }
 };
 renderReferences();
}
function renderSection(id){const zone=a=>`<div class="reference-zone" data-chapter="${id}" data-anchor="${a}"></div>`;return `<div class="chapter-layout" id="${id==='global'?'global':'content-'+id}"><div class="script-column">`+paragraphs(id).map((p,index)=>`<div class="paragraph"><p>${esc(p)}</p>${zone(String(index))}</div>`).join('')+`<div class="section-end">${zone('end')}<button class="add-reference" data-chapter="${id}" data-anchor="end" hidden>添加参考</button></div></div><aside class="reference-rail" aria-label="右栏参考" hidden></aside></div>`}
function mediaInfo(item){
 if(item.kind==='file')return {kind:item.mime.startsWith('image/')?'image':item.mime.startsWith('audio/')?'audio':'video',url:activeOrigin+'/media/'+item.file};
 const u=safeURL(item.url);if(!u)return {kind:'link'};const host=u.hostname.replace(/^www\./,''),path=u.pathname;
 if(/\.(mp4|webm|mov)$/i.test(path))return {kind:'video',url:u.href};
 if(/\.(jpg|jpeg|png|gif|webp|avif)$/i.test(path))return {kind:'image',url:u.href};
 if(/\.(mp3|m4a|wav|ogg)$/i.test(path))return {kind:'audio',url:u.href};
 if(['youtube.com','m.youtube.com','youtu.be'].includes(host)){const id=host==='youtu.be'?path.slice(1):u.searchParams.get('v')||path.match(/\/(?:embed|shorts)\/([\w-]+)/)?.[1];if(/^[\w-]{11}$/.test(id||''))return {kind:'embed',url:'https://www.youtube-nocookie.com/embed/'+id}}
 if(['vimeo.com','player.vimeo.com'].includes(host)){const id=path.match(/\/(\d+)(?:\/|$)/)?.[1];if(id)return {kind:'embed',url:'https://player.vimeo.com/video/'+id}}
 if(['bilibili.com','m.bilibili.com'].includes(host)){const id=path.match(/\/(BV\w+)/)?.[1];if(id)return {kind:'embed',url:'https://player.bilibili.com/player.html?bvid='+id+'&autoplay=0'}}
 return {kind:'link',url:u.href};
}
function mediaHTML(item){
 const m=mediaInfo(item),src=esc(m.url||item.url);
 if(item.kind==='file' && item.mime.startsWith('video/')){
   const base=location.hostname.endsWith('.chatgpt.site') ? mobileOrigin+'/' : './';
   const preview=esc(base+'previews/'+encodeURIComponent(item.file));
   return `<video controls playsinline preload="metadata" poster="${preview}.jpg"><source src="${preview}.mp4" type="video/mp4"><source src="${src}"></video>`;
 }
 if(m.kind==='image')return `<img src="${src}" alt="${esc(item.title)}" loading="lazy" draggable="false">`;if(m.kind==='video')return `<video src="${src}" controls playsinline preload="metadata"></video>`;if(m.kind==='audio')return `<audio src="${src}" controls preload="metadata"></audio>`;if(m.kind==='embed')return `<iframe src="${src}" title="${esc(item.title)}" loading="lazy" allow="fullscreen;encrypted-media;picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`;return `<a href="${src}" target="_blank" rel="noopener noreferrer">打开参考影片</a>`}
function renderReferences(){
 if(!script)return;
 document.body.classList.toggle('editing',editing);$('#edit').hidden=editing;$('#save').hidden=!editing;$('#finish').hidden=!editing;$('#save').disabled=!online||busy;$('.editor-help').hidden=!editing;
 $$('.add-reference').forEach(b=>b.hidden=!editing);
 $$('.side-zone').forEach(zone => zone.remove());
 $$('.reference-zone').forEach(zone=>{zone.replaceChildren();if(editing&&zone.dataset.anchor!=='end'){const b=document.createElement('button');b.className='inline-add';b.textContent='＋ 参考';b.title='在这段文字后添加参考';b.onclick=()=>openReference(zone.dataset.chapter,zone.dataset.anchor);zone.append(b)}});
 for(const [id,b]of Object.entries(state.boards))for(const item of b.items){
  const zone = referenceZone(id, item);
  if (!zone) continue;
  const ref=document.createElement('div');ref.className='reference'+(item.kind==='note'?' reference-note':'');ref.style.width=item.w+'%';ref.dataset.id=item.id;
  ref.innerHTML=(item.title?`<p class="ref-title">${esc(item.title)}</p>`:'')+(item.kind==='note'?`<p class="ref-text">${esc(item.text)}</p>`:`<div class="reference-media">${mediaHTML(item)}</div>`)+(item.note?`<p>${esc(item.note)}</p>`:'')+(item.kind==='link'?`<a class="source-link" href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">原链接</a>`:'')+(editing?`<div class="reference-controls"><button class="drag-handle" draggable="true">移动</button><button data-action="edit">编辑</button><button data-action="before">前移</button><button data-action="after">后移</button><button data-action="smaller">缩小</button><button data-action="bigger">放大</button><button data-action="remove">移除</button></div><span class="resize-handle" role="button" tabindex="0" aria-label="调整参考宽度">◢</span>`:`<button class="source-link" data-action="preview">放大查看</button>`);
  zone.append(ref);
  $$('[data-action]',ref).forEach(button=>button.onclick=()=>{const action=button.dataset.action;if(action==='edit')openReference(id,item.anchor||'end',item);if(action==='remove'&&confirm('移除这份参考？')){b.items=b.items.filter(i=>i.id!==item.id);changed();renderReferences()}if(action==='smaller'||action==='bigger'){item.w=Math.max(20,Math.min(100,item.w+(action==='bigger'?10:-10)));ref.style.width=item.w+'%';changed()}if(action==='before'||action==='after'){const index=b.items.indexOf(item),step=action==='before'?-1:1;let other=index+step;while(other>=0&&other<b.items.length&&((b.items[other].anchor||'end')!==(item.anchor||'end') || (b.items[other].placement||'inline')!==(item.placement||'inline')))other+=step;if(other>=0&&other<b.items.length){[b.items[index],b.items[other]]=[b.items[other],b.items[index]];changed();renderReferences()}}if(action==='preview'){const content=$('#preview-content');content.innerHTML=`<h3>${esc(item.title)}</h3>`+(item.kind==='note'?`<p>${esc(item.text)}</p>`:mediaHTML(item))+(item.note?`<p>${esc(item.note)}</p>`:'');$('#preview').showModal()}});
  if(editing){const handle=$('.drag-handle',ref);handle.ondragstart=e=>{dragged={chapter:id,id:item.id};e.dataTransfer.setData('text/plain',item.id);e.dataTransfer.effectAllowed='move'};handle.ondragend=()=>{dragged=null;$$('.drop-over').forEach(z=>z.classList.remove('drop-over'))};const resize=$('.resize-handle',ref);resize.onpointerdown=e=>{if(e.button!==0)return;e.preventDefault();resize.setPointerCapture(e.pointerId);const x=e.clientX,w=item.w,parentWidth=zone.clientWidth;const move=event=>{item.w=Math.max(20,Math.min(100,w+(event.clientX-x)/parentWidth*100));ref.style.width=item.w+'%'};const end=()=>{resize.removeEventListener('pointermove',move);resize.removeEventListener('pointerup',end);resize.removeEventListener('pointercancel',end);changed()};resize.addEventListener('pointermove',move);resize.addEventListener('pointerup',end);resize.addEventListener('pointercancel',end)};resize.onkeydown=e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();item.w=Math.max(20,Math.min(100,item.w+(e.key==='ArrowRight'?5:-5)));ref.style.width=item.w+'%';changed()}}}
 }
 arrangeSideReferences();
}
function populateAnchors(selected='end'){const id=$('#chapter').value;$('#anchor').innerHTML='<option value="end">本节末尾</option>'+paragraphs(id).map((p,i)=>`<option value="${i}">${esc(p.slice(0,34))}${p.length>34?'…':''}</option>`).join('');$('#anchor').value=selected}
function updateType(){const type=$('#type').value;$('#file-label').hidden=type!=='file'||!!editingItem;$('#url-label').hidden=type!=='link';$('#url').required=type==='link';$('#text-label').hidden=type!=='note';$('#upload-help').hidden=type!=='file'||!!editingItem}
function openReference(id='global',a='end',item=null){if(!editing){$('#login').showModal();return}chapter=id;anchor=a;editingItem=item;$('#reference-form').reset();$('#form-error').textContent='';$('#chapter').value=id;populateAnchors(a);$('#placement').value=item?.placement||'inline';$('#type').value=item?.kind||'file';$('#type').disabled=!!item;$('#form-title').textContent=item?'编辑参考':'添加参考';$('#submit-reference').textContent=item?'保存修改':'添加';if(item){$('#url').value=item.url||'';$('#title').value=item.title;$('#text').value=item.text||'';$('#note').value=item.note||''}updateType();$('#reference-dialog').showModal()}
$('#type').onchange=updateType;$('#chapter').onchange=()=>populateAnchors();
const mimes={jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',gif:'image/gif',avif:'image/avif',mp4:'video/mp4',webm:'video/webm',mov:'video/quicktime',mp3:'audio/mpeg',m4a:'audio/mp4',wav:'audio/wav'};
function upload(file,mime){return new Promise((resolve,reject)=>{const xhr=new XMLHttpRequest();xhr.open('POST',activeOrigin+'/api/upload');xhr.timeout=600000;xhr.setRequestHeader('Authorization','Bearer '+token);xhr.setRequestHeader('Content-Type',mime);xhr.upload.onprogress=e=>{if(e.lengthComputable)$('#submit-reference').textContent='上传 '+Math.round(e.loaded/e.total*100)+'%'};xhr.onload=()=>{let d;try{d=JSON.parse(xhr.responseText)}catch{reject(new Error('上传服务异常，请重试。'));return}xhr.status>=200&&xhr.status<300?resolve(d):reject(new Error(d.error||'上传失败'))};xhr.onerror=()=>reject(new Error('上传连接中断，请重试。'));xhr.ontimeout=()=>reject(new Error('上传超时，请重试。'));xhr.send(file)})}
$('#reference-form').onsubmit=async e=>{
 e.preventDefault();if(busy)return;const type=$('#type').value,id=$('#chapter').value,a=$('#anchor').value,title=$('#title').value.trim(),note=$('#note').value,text=$('#text').value,url=$('#url').value.trim();$('#form-error').textContent='';
 if(type==='link'&&!safeURL(url)){$('#form-error').textContent='请输入完整的 http 或 https 链接。';return}
 if(type==='note'&&!title&&!text){$('#form-error').textContent='请填写文字或标题。';return}
 const placement = $('#placement').value;
 const fields = {kind:type, title, note, text, url, anchor:a, placement};
 if (editingItem) {
   Object.assign(editingItem, fields);
   if (chapter !== id) {
     board(chapter).items = board(chapter).items.filter(item => item.id !== editingItem.id);
     board(id).items.push(editingItem);
   }
   changed();
   renderReferences();
   $('#reference-dialog').close();
   return;
 }
 const base = {...fields, color:'dark', x:0, y:0, w:placement === 'right' ? 100 : 60, h:300, z:1};
 if(type!=='file'){board(id).items.push({...base,id:crypto.randomUUID()});changed();renderReferences();$('#reference-dialog').close();return}
 const files=[...$('#files').files];if(!files.length){$('#form-error').textContent='请先选择文件。';return}if(!online){$('#form-error').textContent='共享服务未连接，请稍后重试。';return}
 busy=true;$('#submit-reference').disabled=true;$('#save').disabled=true;let count=0,errors=[];
 for(const file of files){const mime=mimes[file.name.split('.').pop().toLowerCase()];if(!mime){errors.push(file.name+'：不支持此格式');continue}if(!file.size||file.size>90*1024*1024){errors.push(file.name+'：文件需为 1 字节至 90 MB');continue}try{const result=await upload(file,mime);board(id).items.push({...base,id:crypto.randomUUID(),title:title||file.name.replace(/\.[^.]+$/,''),file:result.key,mime});changed();count++}catch(error){errors.push(file.name+'：'+error.message)}}
 busy=false;$('#submit-reference').disabled=false;$('#submit-reference').textContent='添加';$('#save').disabled=!online;renderReferences();if(errors.length){$('#form-error').textContent=errors.join('\n')+(count?'\n成功的文件已添加。':'');$('#files').value=''}else $('#reference-dialog').close();if(count)message(count+' 份素材已上传。点击「发布更新」后，对方即可看到。');
};
$('#edit').onclick=()=>$('#login').showModal();
$('#login-form').onsubmit=async e=>{e.preventDefault();const b=$('#login-form button[type=submit]');b.disabled=true;token=$('#key').value.trim();$('#login-error').textContent='';try{await api('/api/auth',{method:'POST'});editorSession(token);editing=true;$('#login').close();$('#key').value='';renderReferences();status(dirty?'有未发布的修改':'编辑中')}catch(error){token='';editorSession('');$('#login-error').textContent=error.message}finally{b.disabled=false}};
$('#save').onclick=async()=>{if(!dirty){message('内容已是最新。');return}if(busy)return;busy=true;$('#save').disabled=true;const version=editVersion;status('正在发布…');try{const d=await api('/api/board',{method:'PUT',headers:{'Content-Type':'application/json','If-Match':revision},body:JSON.stringify(state)});revision=d.revision;dirty=version!==editVersion;status(dirty?'还有新的修改未发布':'已发布');message('已发布。对方刷新链接即可看到。')}catch(error){status('未发布，当前修改已保留');message(error.message);if(error.status===409){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify({state,revision},null,2)],{type:'application/json'}));a.download='unpublished-references.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}}finally{busy=false;$('#save').disabled=!online}};
$('#finish').onclick=()=>{if(busy)return;if(dirty&&!confirm('还有未发布的修改。结束编辑不会发布给对方，继续？'))return;editing=false;token='';editorSession('');renderReferences();status(dirty?'当前修改未发布':'浏览模式')};
$('#share').onclick=async()=>{const url=location.origin+location.pathname;try{await navigator.clipboard.writeText(url);message('链接已复制。')}catch{prompt('复制链接：',url)}};
$$('[data-close]').forEach(b=>b.onclick=()=>{if(busy&&b.closest('dialog').id==='reference-dialog')return;b.closest('dialog').close()});$('#reference-dialog').addEventListener('cancel',e=>{if(busy)e.preventDefault()});$('#preview').addEventListener('close',()=>$('#preview-content').replaceChildren());
window.addEventListener('beforeunload',e=>{if(dirty||busy){e.preventDefault();e.returnValue=''}});
async function init(){try{const r=await fetch('./script.json');if(!r.ok)throw new Error('脚本加载失败');script=await r.json();script.chapters.forEach(c=>names[c.id]=c.number+' '+c.title);$('#chapter').innerHTML=Object.entries(names).map(([id,name])=>`<option value="${id}">${esc(name)}</option>`).join('');renderDocument();await load();if(online&&token){try{await api('/api/auth',{method:'POST'});editing=true;renderReferences()}catch{token='';editorSession('')}}if(online&&!editing&&new URLSearchParams(location.search).get('edit')==='1') $('#login').showModal();const target=document.getElementById(location.hash.slice(1));if(target)target.scrollIntoView()}catch(e){status('加载失败，请刷新');message(e.message)}}
const mobileReader = location.hostname === 'ignirico.github.io' ? './read.html'
  : location.hostname.endsWith('.chatgpt.site') ? mobileOrigin + '/read.html' : null;
if (mobileReader && /iPhone|iPad|Android|Mobile/i.test(navigator.userAgent)
    && !new URLSearchParams(location.search).has('edit')) {
  location.replace(mobileReader + location.hash);
} else {
  init();
}
