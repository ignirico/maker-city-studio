import test from 'node:test';
import assert from 'node:assert/strict';
import { renderReader } from '../pages/reader.js';

test('the published reader plays a mirrored right-column film at its paragraph without an API request', () => {
  const file = '00000000-0000-4000-8000-000000000001';
  const film = {id:'clip', kind:'file', mime:'video/mp4', file, title:'A & B', anchor:'0', placement:'right'};
  const script = {intro:['Title','Subtitle','Summary','First paragraph','Second paragraph'], chapters:[]};
  const board = {state:{boards:{global:{items:[film]}}}};
  const html = renderReader(script, board, new Set([file]), 'https://example.test');
  assert.match(html, /First paragraph<\/p><aside><figure id="ref-global-clip"/);
  assert.match(html, /A &amp; B/);
  assert.match(html, /<video controls playsinline[^>]*src="\.\/published\/[^"]+\.mp4"/);
  assert.match(html, /<\/aside><p>Second paragraph/);
  assert.equal(html.match(/<video /g).length, 1);
  assert.doesNotMatch(html, /<script|\/api\/|\/media\//);
  assert.ok(renderReader(script, board, new Set(), 'https://example.test').includes('https://example.test/media/' + file));
});

test('a QuickTime upload uses its MP4 preview first and keeps its original as a fallback', () => {
  const file = '00000000-0000-4000-8000-000000000002';
  const film = {id:'mov',kind:'file',mime:'video/quicktime',file,title:'Camera reference'};
  const board = {state:{boards:{global:{items:[film]}}}};
  const script = {intro:['Title','Subtitle','Summary'],chapters:[]};
  const html = renderReader(script, board, new Set(), 'https://example.test', new Set([file]));
  assert.ok(html.includes('poster="./previews/'+file+'.jpg"'));
  assert.ok(html.includes('<source src="./previews/'+file+'.mp4" type="video/mp4"><source src="https://example.test/media/'+file+'">'));
  assert.ok(html.includes('<a href="./previews/'+file+'.mp4">'));
});
