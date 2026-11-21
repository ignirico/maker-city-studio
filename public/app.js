const API = ['localhost', '127.0.0.1'].includes(location.hostname) ? location.origin : 'https://maker-city-reference-studio.ignirico.chatgpt.site';
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
let script, state = { boards: {} }, revision = 'seed', active = 'chapter-01', editing = false, dirty = false, saving = false, online = false, selected = null, modalMode = 'note', modalItem = null;
let token = sessionStorage.getItem('maker-editor') || '', toastTimer, uploadBusy = false, editVersion = 0;
const chapterNames = { global: '整体视觉' };
const escape = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid = () => crypto.randomUUID();
function toast(message) { $('#toast').textContent = message; $('#toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').hidden = true, 5000); }
function status(message, unsaved = dirty) { $('#sync-status').textContent = message; $('#sync-status').classList.toggle('unsaved', unsaved); }
function changed() { editVersion++; dirty = true; status('有未发布的修改'); $('#save').disabled = !online || saving || uploadBusy; }
function items() { return state.boards[active]?.items || []; }
function boardData() { return state.boards[active] ||= { items: [], height: 720 }; }
async function api(path, options = {}) {
  const response = await fetch(API + path, { ...options, headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), ...options.headers } });
  let data;
  try { data = await response.json(); } catch { throw new Error('服务暂时无法连接，请稍后重试。'); }
  if (!response.ok) { const error = new Error(data.error || '请求失败'); error.status = response.status; throw error; }
  return data;
}
async function loadBoard() {
  try { const data = await api('/api/board'); state = data.state; revision = data.revision; online = true; dirty = false; status(data.updatedAt ? '共享画板 · ' + new Date(data.updatedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Shanghai' }) : '共享画板已连接'); renderBoard(); }
  catch (error) { online = false; status('共享服务未连接 · 请重试', true); toast(error.message); }
}
function renderTabs() {
  $('#chapter-tabs').innerHTML = `<button class="chapter-tab ${active === 'global' ? 'active' : ''}" data-chapter="global" id="tab-global" role="tab" aria-selected="${active === 'global'}">整体视觉<small>MOOD & DIRECTION</small></button>` + script.chapters.map(c => `<button class="chapter-tab ${active === c.id ? 'active' : ''}" data-chapter="${c.id}" id="tab-${c.id}" role="tab" aria-selected="${active === c.id}"><span class="tab-no">${c.number}</span>${escape(c.title)}<small>${c.start} — ${c.end}</small></button>`).join('');
  $$('.chapter-tab').forEach(button => { button.onclick = () => selectChapter(button.dataset.chapter); });
}
function selectChapter(id, scroll = false) {
  if (!chapterNames[id]) id = 'chapter-01';
  active = id; selected = null;
  history.replaceState(null, '', '#' + id);
  renderTabs(); renderScript(); renderBoard();
  $('.script-pane').scrollTop = 0;
  if (scroll) $('#workspace').scrollIntoView({ behavior: 'smooth' });
}
function renderScript() {
  const c = script.chapters.find(c => c.id === active);
  $('#script-time').textContent = c ? c.start + ' — ' + c.end : '8 MIN / 20 DAYS / 3 CREATORS';
  $('#script-content').innerHTML = c ? `<h3>${escape(c.title)}</h3><p class="script-subtitle">${escape(c.subtitle)}</p>` + c.paragraphs.map(p => `<p class="${p.includes('：“') || p.startsWith('“') ? 'dialogue' : ''}">${escape(p)}</p>`).join('') : `<h3>一个人的想法，<br>一群人的可能。</h3>` + script.intro.slice(3).map(p => `<p>${escape(p)}</p>`).join('');
  $('#next-chapter').textContent = active === 'chapter-07' ? '回到整体视觉' : '下一章节 · ' + (active === 'global' ? script.chapters[0].title : script.chapters[script.chapters.findIndex(c => c.id === active) + 1]?.title);
  $('#next-chapter').onclick = () => { const i = script.chapters.findIndex(c => c.id === active); selectChapter(i === 6 ? 'global' : script.chapters[i + 1].id, true); };
}
function safeURL(value) { try { const url = new URL(value); if (url.protocol === 'https:' || url.protocol === 'http:') return url; } catch {} return null; }
function mediaInfo(value) {
  const u = safeURL(value); if (!u) return { kind: 'link' };
  const h = u.hostname.replace(/^www\./, ''), path = u.pathname;
  if (/\.(mp4|webm|mov)$/i.test(path)) return { kind: 'video', url: u.href };
  if (/\.(jpg|jpeg|png|webp|gif|avif)$/i.test(path)) return { kind: 'image', url: u.href };
  if (/\.(mp3|m4a|wav|ogg)$/i.test(path)) return { kind: 'audio', url: u.href };
  if (h === 'youtube.com' || h === 'youtu.be' || h === 'm.youtube.com') {
    const id = h === 'youtu.be' ? path.slice(1) : u.searchParams.get('v') || path.match(/\/(?:embed|shorts)\/([\w-]+)/)?.[1];
    if (/^[\w-]{11}$/.test(id || '')) return { kind: 'embed', url: 'https://www.youtube-nocookie.com/embed/' + id };
  }
  if (h === 'vimeo.com' || h === 'player.vimeo.com') { const id = path.match(/\/(\d+)(?:\/|$)/)?.[1]; if (id) return { kind: 'embed', url: 'https://player.vimeo.com/video/' + id }; }
  if (h === 'bilibili.com' || h === 'm.bilibili.com') { const id = path.match(/\/(BV[a-zA-Z0-9]+)/)?.[1]; if (id) return { kind: 'embed', url: 'https://player.bilibili.com/player.html?bvid=' + id + '&autoplay=0&high_quality=1' }; }
  return { kind: 'link', url: u.href };
}
function mediaHTML(item) {
  const m = item.kind === 'file' ? { kind: item.mime.startsWith('image/') ? 'image' : item.mime.startsWith('audio/') ? 'audio' : 'video', url: API + '/media/' + item.file } : mediaInfo(item.url);
  const src = escape(m.url || item.url);
  if (m.kind === 'image') return `<img src="${src}" alt="${escape(item.title)}" loading="lazy" draggable="false">`;
  if (m.kind === 'video') return `<video controls playsinline preload="metadata" src="${src}"></video>`;
  if (m.kind === 'audio') return `<audio controls preload="metadata" src="${src}"></audio>`;
  if (m.kind === 'embed') return `<iframe src="${src}" title="${escape(item.title)}" loading="lazy" allow="fullscreen; encrypted-media; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
  return `<div class="card-link"><span class="play-icon">▷</span><a href="${src}" target="_blank" rel="noopener noreferrer">打开参考影片</a><p class="fine-print">在原网站观看</p></div>`;
}
function renderBoard() {
  const board = $('#board'); $$('.board-card', board).forEach(el => el.remove());
  const b = state.boards[active]; const list = b?.items || [];
  $('#board-title').textContent = active === 'global' ? '整体视觉与创作方向' : script.chapters.find(c => c.id === active).subtitle;
  $('#item-count').textContent = list.length ? list.length + ' 份参考' : '等待第一份灵感';
  $('#board-empty').hidden = !!list.length; board.classList.toggle('has-cards', !!list.length);
  board.style.height = innerWidth <= 760 ? 'auto' : Math.max(620, b?.height || 720, ...list.map(i => i.y + i.h + 40)) + 'px';
  for (const item of (innerWidth <= 760 ? list : [...list].sort((a, b) => a.z - b.z))) {
    const card = document.createElement('div'); card.className = 'board-card ' + (item.kind === 'note' ? 'card-note ' + item.color : ''); card.dataset.id = item.id;
    card.style.cssText = `left:${item.x}%;top:${item.y}px;width:${item.w}%;height:${item.h}px;z-index:${item.z};`;
    const ordinal = list.indexOf(item);
    card.innerHTML = `<div class="card-toolbar"><span>${item.kind === 'note' ? 'NOTE' : item.kind === 'link' ? 'FILM REFERENCE' : item.mime.startsWith('image/') ? 'VISUAL REFERENCE' : 'FILM REFERENCE'}</span>${editing ? `<button class="mobile-order" data-action="up" aria-label="上移 ${escape(item.title)}">↑</button><button class="mobile-order" data-action="down" aria-label="下移 ${escape(item.title)}">↓</button><button data-action="front" aria-label="置于顶层 ${escape(item.title)}">叠</button><button data-action="edit" aria-label="编辑 ${escape(item.title)}">编辑</button><button data-action="remove" aria-label="移除 ${escape(item.title)}">×</button>` : `<button data-action="preview" aria-label="放大 ${escape(item.title)}">放大</button>`}</div>` +
      (item.kind === 'note' ? `<div class="card-text"><h4>${escape(item.title)}</h4><p>${escape(item.text)}</p></div>` : `<div class="card-media">${mediaHTML(item)}</div>`) +
      `<div class="card-caption">${item.kind === 'note' ? '' : `<h4>${escape(item.title)}</h4>`}${item.note ? `<p>${escape(item.note)}</p>` : ''}${item.kind === 'link' ? `<a class="card-original" href="${escape(item.url)}" target="_blank" rel="noopener noreferrer">查看原片 / 无法播放时打开</a>` : ''}</div>${editing ? '<div class="card-resize" role="button" aria-label="拖动缩放卡片" tabindex="0"></div>' : ''}`;
    board.append(card);
    if (item.id === selected) card.classList.add('selected');
    $$('.card-toolbar button', card).forEach(button => button.onclick = () => {
      const action = button.dataset.action;
      if (action === 'edit') openItem(item.kind === 'file' ? 'file' : item.kind, item);
      if (action === 'remove' && confirm('从画板移除「' + item.title + '」？')) { boardData().items = items().filter(i => i.id !== item.id); changed(); renderBoard(); }
      if (action === 'front') { item.z = Math.max(0, ...list.map(i => i.z)) + 1; changed(); renderBoard(); }
      if (action === 'up' || action === 'down') { const other = ordinal + (action === 'up' ? -1 : 1); if (other >= 0 && other < list.length) { [list[ordinal], list[other]] = [list[other], list[ordinal]]; changed(); renderBoard(); } }
      if (action === 'preview') preview(item);
    });
    if (editing) {
      $('.card-toolbar', card).addEventListener('pointerdown', e => startMove(e, item, card, false));
      $('.card-resize', card).addEventListener('pointerdown', e => startMove(e, item, card, true));
      $('.card-resize', card).addEventListener('keydown', e => { if (['ArrowRight','ArrowLeft','ArrowUp','ArrowDown'].includes(e.key)) { e.preventDefault(); item.w = Math.min(100 - item.x, Math.max(24, item.w + (e.key === 'ArrowRight' ? 2 : e.key === 'ArrowLeft' ? -2 : 0))); item.h = Math.min(1600, Math.max(180, item.h + (e.key === 'ArrowDown' ? 20 : e.key === 'ArrowUp' ? -20 : 0))); changed(); renderBoard(); } });
      if (item.kind === 'note') $('.card-text', card).ondblclick = () => openItem('note', item);
      $('.card-toolbar', card).tabIndex = 0;
      $('.card-toolbar', card).setAttribute('aria-label', '移动 ' + item.title + '，方向键调整位置');
      $('.card-toolbar', card).onkeydown = e => { if (e.target !== e.currentTarget || !e.key.startsWith('Arrow')) return; e.preventDefault(); item.x = Math.max(0,Math.min(100-item.w,item.x+(e.key==='ArrowRight'?2:e.key==='ArrowLeft'?-2:0))); item.y=Math.max(0,item.y+(e.key==='ArrowDown'?20:e.key==='ArrowUp'?-20:0));changed();renderBoard(); };
    }
    $$('video,img,audio', card).forEach(el => el.addEventListener('error', () => { if (!$('.media-error', card)) { const p = document.createElement('p'); p.className = 'fine-print media-error'; p.textContent = '此媒体无法在当前浏览器播放，可尝试 MP4（H.264）或打开原链接。'; $('.card-caption',card).append(p); } }));
  }
}
function startMove(e, item, card, resize) {
  if (e.target.closest('button') || e.button !== 0 || innerWidth <= 760) return;
  e.preventDefault(); selected = item.id; $$('.board-card').forEach(el => el.classList.toggle('selected', el === card));
  const board = $('#board'), width = board.clientWidth, startX = e.clientX, startY = e.clientY, before = { x: item.x, y: item.y, w: item.w, h: item.h };
  e.currentTarget.setPointerCapture(e.pointerId); const target = e.currentTarget; let moved = false;
  function move(event) {
    const dx = (event.clientX - startX) / width * 100, dy = event.clientY - startY;
    if (Math.abs(dx) + Math.abs(dy) < 1) return; moved = true;
    if (resize) { item.w = Math.max(Math.min(24, 180 / width * 100), Math.min(100 - item.x, before.w + dx)); item.h = Math.max(180, Math.min(1600, before.h + dy)); }
    else { item.x = Math.max(0, Math.min(100 - item.w, before.x + dx)); item.y = Math.max(0, Math.min(18000, before.y + dy)); }
    card.style.left = item.x + '%'; card.style.top = item.y + 'px'; card.style.width = item.w + '%'; card.style.height = item.h + 'px';
    if (item.y + item.h + 40 > board.clientHeight) { boardData().height = item.y + item.h + 40; board.style.height = boardData().height + 'px'; }
  }
  function finish() { target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', finish); target.removeEventListener('pointercancel', finish); if (moved) changed(); }
  target.addEventListener('pointermove', move); target.addEventListener('pointerup', finish); target.addEventListener('pointercancel', finish);
}
function setEditing(value) {
  editing = value; document.body.classList.toggle('editing', value);
  $$('.editor-only').forEach(el => el.hidden = !value); $('#enter-edit').hidden = value; $('#empty-add').hidden = !value;
  $('#save').disabled = !online; renderBoard();
}
function requireEdit() { if (editing) return true; $('#login-dialog').showModal(); return false; }
function openItem(mode, item = null) {
  if (!requireEdit()) return;
  modalMode = mode; modalItem = item; $('#item-form').reset();
  $('#item-dialog-title').textContent = item ? '编辑参考' : mode === 'note' ? '写一张文字便签' : '添加影片链接';
  $('#url-label').hidden = mode !== 'link'; $('#item-url').required = mode === 'link'; $('#text-label').hidden = mode !== 'note'; $('#link-help').hidden = mode !== 'link';
  $('#item-chapter').value = active; $('#item-color').value = mode === 'note' ? 'sage' : 'dark';
  if (item) { $('#item-title').value = item.title; $('#item-text').value = item.text || ''; $('#item-note').value = item.note || ''; $('#item-url').value = item.url || ''; $('#item-color').value = item.color || 'dark'; }
  $('#item-error').textContent = ''; $('#item-dialog').showModal();
}
function positionForNew() {
  const list = items(), width = 62, y = list.length ? Math.max(...list.map(i => i.y + 65)) : 32;
  return { x: list.length % 2 ? 31 : 5, y, w: width, h: 320, z: Math.max(0, ...list.map(i => i.z)) + 1 };
}
function preview(item) {
  $('#preview-content').innerHTML = `<h3>${escape(item.title)}</h3>` + (item.kind === 'note' ? `<p style="white-space:pre-wrap;line-height:1.9">${escape(item.text)}</p>` : mediaHTML(item)) + (item.note ? `<p class="muted" style="white-space:pre-wrap">${escape(item.note)}</p>` : '');
  $('#preview-dialog').showModal();
}
$('#item-form').onsubmit = e => {
  e.preventDefault();
  const url = $('#item-url').value.trim();
  if (modalMode === 'link' && !safeURL(url)) { $('#item-error').textContent = '请输入完整的 http 或 https 链接。'; return; }
  const destination = $('#item-chapter').value;
  const item = { ...(modalItem || { id: uid(), kind: modalMode, ...positionForNew() }), title: $('#item-title').value.trim(), text: $('#item-text').value, note: $('#item-note').value, color: $('#item-color').value };
  if (modalMode === 'link') item.url = url;
  if (!item.title) { $('#item-error').textContent = '请填写标题。'; return; }
  if (modalItem) boardData().items = items().filter(i => i.id !== modalItem.id);
  (state.boards[destination] ||= { items: [], height: 720 }).items.push(item);
  selected = item.id; changed(); $('#item-dialog').close(); selectChapter(destination);
};
const mimeByExt = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif', mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav' };
async function uploadFiles(files) {
  if (!requireEdit() || !files.length || uploadBusy) return;
  if (!online) { toast('共享服务尚未连接，请先刷新。'); return; }
  uploadBusy = true; $('#add-file').disabled = true; $('#save').disabled = true;
  const destination = active;
  let count = 0;
  for (const file of files) {
    const mime = mimeByExt[file.name.split('.').pop().toLowerCase()];
    if (!mime) { toast('不支持「' + file.name + '」，请上传常见图片、MP4、WebM、MOV 或音频。'); continue; }
    if (file.size > 90 * 1024 * 1024) { toast('「' + file.name + '」超过 90 MB。请压缩，或添加影片链接。'); continue; }
    if (!file.size) { toast('「' + file.name + '」是空文件。'); continue; }
    try {
      status('上传 ' + file.name + '…', true);
      const uploaded = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest(); xhr.open('POST', API + '/api/upload'); xhr.timeout = 600000;
        xhr.setRequestHeader('Authorization', 'Bearer ' + token); xhr.setRequestHeader('Content-Type', mime);
        xhr.upload.onprogress = e => { if (e.lengthComputable) status('上传 ' + file.name + ' · ' + Math.round(e.loaded / e.total * 100) + '%', true); };
        xhr.onload = () => { let data; try { data = JSON.parse(xhr.responseText); } catch { reject(new Error('上传服务返回异常，请重试。')); return; } xhr.status >= 200 && xhr.status < 300 ? resolve(data) : reject(new Error(data.error || '上传失败')); };
        xhr.onerror = () => reject(new Error('上传连接中断，请重试。')); xhr.ontimeout = () => reject(new Error('上传超时，请检查网络后重试。')); xhr.send(file);
      });
      const b = state.boards[destination] ||= { items: [], height: 720 };
      b.items.push({ id: uid(), kind: 'file', file: uploaded.key, mime, title: file.name.replace(/\.[^.]+$/, ''), note: '', color: 'dark', x: b.items.length % 2 ? 31 : 5, y: b.items.length ? Math.max(...b.items.map(i => i.y + 65)) : 32, w: 62, h: mime.startsWith('image/') ? 340 : 360, z: Math.max(0, ...b.items.map(i => i.z)) + 1 });
      count++; changed(); renderBoard();
    } catch (error) { toast(file.name + '：' + error.message); }
  }
  uploadBusy = false; $('#add-file').disabled = false; $('#save').disabled = !online; $('#file-input').value = '';
  if (count) { changed(); toast(count + ' 份素材已上传。调整布局后，点击「发布更新」。'); }
  else status(dirty ? '有未发布的修改' : '共享画板已连接');
}
$('#save').onclick = async () => {
  if (!dirty) { toast('画板已经是最新版本。'); return; }
  if (uploadBusy || saving) return;
  saving = true; const publishingVersion = editVersion; $('#save').disabled = true; status('正在发布…', true);
  try { const data = await api('/api/board', { method: 'PUT', headers: { 'Content-Type': 'application/json', 'If-Match': revision }, body: JSON.stringify(state) }); revision = data.revision; dirty = editVersion !== publishingVersion; status(dirty ? '上一版已发布 · 还有新的修改' : '已发布 · 所有人可见'); toast(dirty ? '上一版已发布，刚才的新修改仍待发布。' : '发布成功。甲方刷新链接即可看到最新画板。'); }
  catch (error) { status(error.status === 409 ? '版本冲突 · 当前修改尚未发布' : '发布失败 · 当前修改已保留', true); toast(error.message); if (error.status === 409) { const a = document.createElement('a'); const blob = new Blob([JSON.stringify({ state, revision, savedAt: new Date().toISOString() }, null, 2)], { type: 'application/json' }); a.href = URL.createObjectURL(blob); a.download = 'maker-city-unpublished-backup.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); } }
  finally { saving = false; $('#save').disabled = !online; }
};
$('#login-form').onsubmit = async e => {
  e.preventDefault(); const button = $('#login-form .primary'); button.disabled = true; token = $('#editor-key').value.trim(); $('#login-error').textContent = '';
  try { await api('/api/auth', { method: 'POST' }); sessionStorage.setItem('maker-editor', token); $('#login-dialog').close(); $('#editor-key').value = ''; setEditing(true); toast('工作台已打开，自由摆放你的灵感吧。'); }
  catch (error) { token = ''; sessionStorage.removeItem('maker-editor'); $('#login-error').textContent = error.message; }
  finally { button.disabled = false; }
};
$('#enter-edit').onclick = () => $('#login-dialog').showModal();
$('#leave-edit').onclick = () => { if (dirty && !confirm('还有未发布的修改。退出将保留当前页面布局，但不会发布给甲方，继续？')) return; setEditing(false); token = ''; sessionStorage.removeItem('maker-editor'); };
$('#refresh').onclick = () => { if (dirty && !confirm('刷新会丢弃当前未发布的修改，读取共享画板的最新版本。继续？')) return; loadBoard(); };
$('#add-file').onclick = () => { if (requireEdit()) $('#file-input').click(); };
$('#empty-add').onclick = () => { if (requireEdit()) $('#file-input').click(); };
$('#file-input').onchange = e => uploadFiles([...e.target.files]);
$('#add-link').onclick = () => openItem('link'); $('#add-note').onclick = () => openItem('note');
$('#tidy').onclick = () => { if (!items().length) return; if (!confirm('将当前章节的卡片整理为两列？')) return; let col = [24, 24]; boardData().items.forEach((i, index) => { const c = index % 2; i.x = c ? 52 : 3; i.w = 45; i.y = col[c]; i.h = i.kind === 'note' ? 280 : 340; i.z = index + 1; col[c] += i.h + 24; }); boardData().height = Math.max(720, ...col); changed(); renderBoard(); };
$('#add-space').onclick = () => { boardData().height = Math.min(20000, ($('#board').clientHeight || 720) + 500); changed(); renderBoard(); };
$('#board').addEventListener('dragover', e => { if (editing && e.dataTransfer.types.includes('Files')) { e.preventDefault(); $('#board').classList.add('drag-over'); } });
$('#board').addEventListener('dragleave', e => { if (!$('#board').contains(e.relatedTarget)) $('#board').classList.remove('drag-over'); });
$('#board').addEventListener('drop', e => { if (editing && e.dataTransfer.files.length) { e.preventDefault(); $('#board').classList.remove('drag-over'); uploadFiles([...e.dataTransfer.files]); } });
$$('[data-close]').forEach(b => b.onclick = () => b.closest('dialog').close());
$('#preview-dialog').addEventListener('close', () => $('#preview-content').replaceChildren());
$('#overview-open').onclick = () => $('#overview-dialog').showModal();
async function copy(value) { try { await navigator.clipboard.writeText(value); toast('链接已复制。'); } catch { prompt('复制这个链接：', value); } }
$('#share').onclick = () => copy(location.origin + location.pathname); $('#copy-chapter').onclick = () => copy(location.origin + location.pathname + '#' + active);
window.addEventListener('beforeunload', e => { if (dirty || uploadBusy) { e.preventDefault(); e.returnValue = ''; } });
window.addEventListener('resize', () => { clearTimeout(window.resizeBoardTimer); window.resizeBoardTimer = setTimeout(renderBoard, 150); });
async function init() {
  try {
    const response = await fetch('./script.json'); if (!response.ok) throw new Error('脚本加载失败'); script = await response.json();
    script.chapters.forEach(c => chapterNames[c.id] = c.number + ' · ' + c.title);
    $('#item-chapter').innerHTML = Object.entries(chapterNames).map(([id, label]) => `<option value="${id}">${escape(label)}</option>`).join('');
    $('#overview-content').innerHTML = script.intro.slice(3).map(p => `<p>${escape(p)}</p>`).join('');
    const hash = location.hash.slice(1); active = chapterNames[hash] ? hash : 'chapter-01';
    renderTabs(); renderScript(); setEditing(false); await loadBoard();
    if (token) { try { await api('/api/auth', { method: 'POST' }); setEditing(true); } catch { token = ''; sessionStorage.removeItem('maker-editor'); } }
    window.addEventListener('hashchange', () => { if (chapterNames[location.hash.slice(1)]) selectChapter(location.hash.slice(1)); });
  } catch (e) { status('页面加载失败', true); toast(e.message + '，请刷新重试。'); }
}
init();
