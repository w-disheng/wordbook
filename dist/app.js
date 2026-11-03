import {STORAGE_KEY, normalizeWord, getJSON, readWords, httpsUrl} from './lib.js';
import {fetchDictionary} from './dictionary.js';
import {renderSynonyms, renderTutor, bindLearning, refreshTutorConnection} from './learning.js';

const $ = (selector) => document.querySelector(selector);
const escape = (text) => String(text ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const speaker = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/></svg>';
const demo = {word:'commute', demo:true, note:'', data:{phonetic:'/kəˈmjuːt/',audio:'',senses:[{part:'verb',definition:'To travel regularly between your home and your place of work.',example:'I commute to work by train every morning.'},{part:'noun',definition:'The regular journey between your home and your place of work.',example:'My commute takes about forty minutes each way.'}],sources:[]}};
let words = [], selected = null, translationVisible = false, audio = null, toastTimer, writable = true;
const pending = new Set();
const translationsPending = new Set();
const errors = new Map();
const translationErrors = new Map();
try { words = readWords(localStorage); } catch { writable = false; notice('无法读取浏览器词本，暂时只保留本次会话的记录。原有数据不会被覆盖；请使用导出备份。'); }
selected = words[0]?.word || null;

function notice(message) { $('#notice').textContent = message; $('#notice').hidden = !message; }
function toast(message) { clearTimeout(toastTimer); $('#toast').textContent = message; $('#toast').hidden = false; toastTimer = setTimeout(() => $('#toast').hidden = true, 4000); }
function persist() {
  if(!writable) return false;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(words)); return true; }
  catch { writable = false; notice('浏览器无法保存记录（可能空间不足）。请导出备份；刷新页面可能丢失本次更改。'); return false; }
}
function current() { return words.find(w => w.word === selected) || demo; }
function select(word) { audio?.pause(); window.speechSynthesis?.cancel(); selected = word; translationVisible = false; render(); }
function renderList() {
  $('#word-count').textContent = words.length;
  $('#export').disabled = !words.length;
  const query = $('#filter').value.trim().toLowerCase();
  const visible = words.filter(w => w.word.includes(query));
  $('#word-list').innerHTML = visible.length ? visible.map(w => `<button class="word-item ${selected === w.word ? 'active' : ''}" data-word="${escape(w.word)}" aria-current="${selected === w.word ? 'true' : 'false'}"><span><strong>${escape(w.word)}</strong><small>${pending.has(w.word) ? '正在查词…' : w.data?.senses?.[0]?.part ? escape(w.data.senses[0].part) : '已记录 · 待查词'}</small></span><span class="arrow" aria-hidden="true">${selected === w.word ? '↗' : '·'}</span></button>`).join('') : `<div class="empty-list">${query ? '没有找到这个单词。' : '你的词本，从第一个单词开始。<br>在上方输入，按 Enter 记下来。'}</div>`;
}
function render() { renderList(); renderDetail(); }
function renderDetail() {
  const editingField = ['my-sentence', 'tutor-question'].includes(document.activeElement?.id) ? document.activeElement.id : null;
  const cursor = editingField ? [document.activeElement.selectionStart, document.activeElement.selectionEnd] : null;
  const item = current();
  const data = item.data;
  const loading = pending.has(item.word);
  const senses = data?.senses || [];
  const translated = item.translation;
  $('#detail').innerHTML = `
    <div class="detail-topline"><span class="detail-label">${item.demo ? 'TAKE A LOOK · 示例单词' : 'YOUR WORD · 单词详情'}</span><span class="saved-label">${item.demo ? '尚未加入词本' : writable ? '✓ 已记录' : '仅本次会话'}</span></div>
    <div class="word-heading"><h2 lang="en">${escape(item.word)}</h2><button id="play" class="audio-button" aria-label="播放 ${escape(item.word)} 的发音" title="听单词发音">${speaker}</button></div>
    <div class="phonetic"><span lang="en">${escape(data?.phonetic || '')}</span><span class="pill">${data?.audio ? '词典录音' : '听发音'}</span>${item.demo ? '<button class="text-button" id="save-demo">＋ 保存这个示例</button>' : ''}</div>
    <p id="audio-status" class="practice-hint" role="status"></p>
    <div class="divider"></div>
    ${loading ? '<div class="loading" role="status">单词已记下，正在查找英文释义和例句…</div>' : !data ? `<div class="error-block">${escape(errors.get(item.word) || '这个单词已记录，点击下方按钮加载英文释义。')}<br><button id="retry" class="translation-toggle">重新查词 ↻</button></div>` : `
      <h3 class="section-label">Meaning & examples</h3>
      ${senses.map((sense, i) => `<section class="meaning"><p class="definition" lang="en"><span class="part">${escape(sense.part)}</span>${escape(sense.definition)}</p>${sense.example ? `<blockquote class="example" lang="en">${escape(sense.example)}</blockquote>` : '<p class="no-example">词典未提供这个词义的例句。</p>'}</section>`).join('')}
      <button id="translate" class="translation-toggle" aria-expanded="${translationVisible}" aria-controls="translation"><span>${translationVisible ? '收起中文' : '还不确定？查看中文'}</span><span aria-hidden="true">${translationVisible ? '−' : '＋'}</span></button>
      <div id="translation" class="translation" ${translationVisible ? '' : 'hidden'}>${translated ? escape(translated) : translationsPending.has(item.word) ? '正在翻译英文释义和例句…' : escape(translationErrors.get(item.word) || '点击按钮后加载中文翻译。')}${translated ? '<small>MyMemory 机器翻译，仅供辅助理解。</small>' : ''}${translationErrors.has(item.word) ? '<button id="retry-translation" class="text-button">重试翻译</button>' : ''}</div>
    `}
    ${renderSynonyms(item)}
    ${renderTutor(item)}
    <section class="practice"><div class="practice-heading"><h3><label for="my-sentence">我的造句与学习笔记</label></h3><span>${item.demo ? '保存单词后即可记录' : '自动保存'}</span></div><textarea id="my-sentence" placeholder="Try: My commute takes…" maxlength="3000" ${item.demo ? 'disabled' : ''}>${escape(item.note || '')}</textarea><p class="practice-hint">写下自己的句子，也可以摘录问答里对你有用的解释。</p></section>
    <div class="detail-bottom"><span>${item.demo ? '示例释义与例句为本站编写' : data ? `释义和例句来自 ${escape(data.provider || 'Free Dictionary API')}` : '查询失败也会保留单词'}${data?.sources?.[0] ? ` · <a href="${escape(httpsUrl(data.sources[0]))}" target="_blank" rel="noreferrer">原文 ↗</a>` : ''}${data?.license?.url && httpsUrl(data.license.url) ? ` · <a href="${escape(httpsUrl(data.license.url))}" target="_blank" rel="noreferrer">${escape(data.license.name || '许可')}</a>` : ''}${data?.audioSource && httpsUrl(data.audioSource) ? ` · <a href="${escape(httpsUrl(data.audioSource))}" target="_blank" rel="noreferrer">录音来源与许可 ↗</a>` : ''}</span>${item.demo ? '' : '<button id="remove" class="text-button">移出词本</button>'}</div>`;
  if(!item.demo) $('#my-sentence').placeholder = `Write a sentence with “${item.word}”…`;
  $('#play').addEventListener('click', () => playWord(item));
  $('#save-demo')?.addEventListener('click', () => addWord(demo.word));
  $('#retry')?.addEventListener('click', () => lookup(item));
  $('#translate')?.addEventListener('click', () => { translationVisible = !translationVisible; renderDetail(); if(translationVisible && !item.translation) translate(item); });
  $('#retry-translation')?.addEventListener('click', () => translate(item));
  $('#my-sentence').addEventListener('input', event => { item.note = event.target.value; persist(); });
  bindLearning(item, {persist, render:renderDetail, current, toast});
  if(editingField && !$(`#${editingField}`).disabled) { $(`#${editingField}`).focus(); $(`#${editingField}`).setSelectionRange(...cursor); }
  $('#remove')?.addEventListener('click', () => {
    words = words.filter(w => w !== item); persist(); select(words[0]?.word || null); toast(`已移除 ${item.word}。`);
  });
}

async function lookup(item) {
  if(pending.has(item.word)) return;
  pending.add(item.word); errors.delete(item.word); render();
  try { item.data = await fetchDictionary(item.word); persist(); }
  catch(error) { errors.set(item.word, error.message); }
  finally { pending.delete(item.word); renderList(); if(current() === item) renderDetail(); }
}
async function addWord(value) {
  let word;
  try { word = normalizeWord(value); } catch(error) { toast(error.message); return; }
  $('#filter').value = '';
  const existing = words.find(w => w.word === word);
  if(existing) { select(word); toast('这个单词已经在你的词本里。'); if(!existing.data) lookup(existing); }
  else {
    const item = {word, createdAt:new Date().toISOString(), note:''};
    words.unshift(item); const saved = persist(); select(word); toast(saved ? `已记下 ${word}` : `已临时记下 ${word}，请导出备份`); lookup(item);
  }
  $('#word-input').value = ''; $('#word-input').focus();
}
function speechFallback(item) {
  if(!('speechSynthesis' in window)) { toast('没有可用录音，当前浏览器也不支持朗读。'); return; }
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(item.word); utterance.lang = 'en-US'; utterance.rate = .85;
  const voice = speechSynthesis.getVoices().find(v => v.lang === 'en-US'); if(voice) utterance.voice = voice;
  utterance.onerror = () => { if(current() === item) toast('朗读未能播放，请检查设备声音设置后重试。'); };
  speechSynthesis.speak(utterance);
  if(current() === item) $('#audio-status').textContent = '词典录音不可用，正在使用设备英语朗读。';
}
async function playWord(item) {
  const button = $('#play'); button.disabled = true;
  audio?.pause(); window.speechSynthesis?.cancel();
  try {
    let source = item.data?.audio;
    if(!source) { const data = await fetchDictionary(item.word); source = data.audio; if(item.data) { item.data.audio = source; item.data.audioSource = data.audioSource; } if(!item.demo) persist(); }
    if(current() !== item) return;
    if(!source) { speechFallback(item); return; }
    audio = new Audio(httpsUrl(source));
    await audio.play();
    if(current() === item) $('#audio-status').textContent = '正在播放词典录音';
    audio.onended = () => { if(current() === item) $('#audio-status').textContent = ''; };
  } catch { if(current() === item) speechFallback(item); }
  finally { button.disabled = false; }
}
async function translateText(text) {
  // MyMemory limits a single query to 500 UTF-8 bytes. Split without cutting a word.
  const chunks = []; let chunk = '';
  for(const word of text.split(/\s+/)) {
    const next = chunk ? `${chunk} ${word}` : word;
    if(new TextEncoder().encode(next).length > 450 && chunk) { chunks.push(chunk); chunk = word; } else chunk = next;
  }
  if(chunk) chunks.push(chunk);
  const output = [];
  for(const part of chunks) {
    const data = await getJSON(`https://api.mymemory.translated.net/get?${new URLSearchParams({q:part,langpair:'en|zh-CN'})}`);
    if(Number(data.responseStatus) !== 200 || !data.responseData?.translatedText) throw new Error('翻译暂不可用或今日额度已用完，请稍后重试。');
    const decoder = document.createElement('textarea'); decoder.innerHTML = data.responseData.translatedText;
    output.push(decoder.value);
  }
  return output.join(' ');
}
async function translate(item) {
  if(translationsPending.has(item.word)) return;
  translationsPending.add(item.word); translationErrors.delete(item.word); renderDetail();
  try {
    const results = [];
    for(const [index, sense] of item.data.senses.entries()) {
      const translated = await translateText(`${sense.definition}${sense.example ? `\nExample: ${sense.example}` : ''}`);
      results.push(`${index + 1}. ${translated}`);
    }
    item.translation = results.join('\n\n'); if(!item.demo) persist();
  } catch(error) { translationErrors.set(item.word, error.message); }
  finally { translationsPending.delete(item.word); if(current() === item) renderDetail(); }
}
$('#add-form').addEventListener('submit', event => { event.preventDefault(); addWord($('#word-input').value); });
$('#filter').addEventListener('input', renderList);
$('#word-list').addEventListener('click', event => { const button = event.target.closest('[data-word]'); if(button) select(button.dataset.word); });
$('#export').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(words, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `wordbook-${new Date().toISOString().slice(0,10)}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); toast('词本已导出。');
});
render();
refreshTutorConnection().then(renderDetail);
