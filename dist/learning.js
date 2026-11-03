import { cleanSynonyms, getJSON } from './lib.js';

const learningEscape = text => String(text ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const synonymJobs = new Set();
const tutorJobs = new Map();
const synonymErrors = new Map();
const tutorErrors = new Map();
let tutorConnection = { state: 'checking', message: '正在检查学习问答连接…' };

export function synonymGroupsFor(item) {
  const groups = [];
  const seen = new Set();
  const append = (part, meaning, values, source) => {
    const words = cleanSynonyms(values, item.word).filter(w => !seen.has(`${part}:${meaning}:${w}`));
    for (const word of words) seen.add(`${part}:${meaning}:${word}`);
    if (words.length) groups.push({ part, meaning, words, source });
  };
  for (const sense of item.data?.senses || []) append(sense.part, sense.definition, sense.synonyms, 'Free Dictionary API');
  for (const group of item.data?.synonymGroups || []) append(group.part, '', group.words, 'Free Dictionary API');
  if (item.synonyms?.provider === 'Datamuse') append('', '', item.synonyms.words, 'Datamuse');
  return groups;
}

export function renderSynonyms(item) {
  const groups = synonymGroupsFor(item);
  return `<section class="learning-section synonyms-section" aria-labelledby="synonyms-title">
    <div class="learning-heading"><div><span class="section-label">SYNONYMS</span><h3 id="synonyms-title">近义词，放在语境里比较</h3></div><button id="load-synonyms" class="quiet-button" ${synonymJobs.has(item) ? 'disabled' : ''}>${synonymJobs.has(item) ? '查找中…' : groups.length ? '补充查找 ↻' : '查找近义词 ↗'}</button></div>
    <p class="learning-caption">意思接近不等于可以直接替换。点击一个词，准备比较它们的用法。</p>
    <div id="synonym-results" role="status">${groups.length ? groups.map(group => `<div class="synonym-group">${group.part || group.meaning ? `<p class="synonym-sense"><em>${learningEscape(group.part)}</em> ${learningEscape(group.meaning || '该词性下的近义表达，具体词义需要再确认。')}</p>` : ''}<div class="synonym-chips">${group.words.map(word => `<button class="synonym-chip" data-compare="${learningEscape(word)}" title="比较 ${learningEscape(item.word)} 与 ${learningEscape(word)}">${learningEscape(word)} <span>↔</span></button>`).join('')}</div><p class="source-note">来源：${group.source === 'Datamuse' ? '<a href="https://www.datamuse.com/api/" target="_blank" rel="noreferrer">Datamuse / WordNet</a> · 未按当前词义筛选' : 'Free Dictionary API'}</p></div>`).join('') : `<p class="learning-empty">${synonymJobs.has(item) ? '正在查找近义词…' : item.synonyms ? '暂时没有查到近义词。可以在下方直接输入你想比较的词。' : '点击“查找近义词”，看看有哪些相近表达。'}</p>`}</div>
    ${synonymErrors.has(item) ? `<p class="learning-error" role="alert">${learningEscape(synonymErrors.get(item))}</p>` : ''}
  </section>`;
}

export function cleanTutorHistory(value) {
  if (!Array.isArray(value)) return [];
  return value.filter(x => x && typeof x.question === 'string' && typeof x.answer === 'string')
    .slice(-12).map(x => ({ question: x.question.slice(0, 1500), answer: x.answer.slice(0, 12000), at: typeof x.at === 'string' ? x.at : '' }));
}

export function tutorPayload(item, question) {
  return {
    word: item.word,
    question: question.trim(),
    senses: (item.data?.senses || []).slice(0, 3).map(s => ({ part: s.part, definition: s.definition, example: s.example })),
    history: cleanTutorHistory(item.tutorHistory).slice(-4)
  };
}

export function chatGPTQuestion(item, question = item.tutorDraft) {
  const context = (item.data?.senses || []).slice(0, 3)
    .map(s => `${s.part || ''}: ${s.definition || ''}${s.example ? `\n例句：${s.example}` : ''}`).join('\n');
  return `我正在学习英文单词 ${item.word}。请像耐心的英语老师一样，用通俗中文解释，配上自然的英文例句和中文说明。比较近义词时，请说明含义、常见搭配，以及什么时候不能互换。\n\n${context ? `词典提供的参考内容：\n${context}\n\n` : ''}我的问题：${question?.trim() || `请解释 ${item.word} 的用法，给我两个日常生活中的例句。`}`;
}

export function renderTutor(item) {
  const history = cleanTutorHistory(item.tutorHistory);
  const running = tutorJobs.get(item);
  return `<section class="learning-section tutor-section" aria-labelledby="tutor-title">
    <div class="learning-heading"><div><span class="section-label">ASK & UNDERSTAND</span><h3 id="tutor-title">不确定，就问一句</h3></div><span class="connection-badge ${tutorConnection.state === 'ready' ? 'ready' : ''}">${tutorConnection.state === 'ready' ? 'AI 已配置' : '待连接 AI'}</span></div>
    <p class="learning-caption">围绕 <strong lang="en">${learningEscape(item.word)}</strong> 继续提问。解释区别、搭配和使用场景，配上英文例句与中文说明。</p>
    <div class="prompt-shortcuts"><button data-question="请用简单英文和中文解释 ${learningEscape(item.word)}，给我两个日常例句，并说明什么时候适合用。">解释用法</button><button data-question="${learningEscape(item.word)} 有哪些容易混淆的词？请比较语义、常见搭配和能否互换，并给出例句。">辨析易混词</button><button data-question="我想用 ${learningEscape(item.word)} 造句，请帮我看是否自然。这是我的句子：">帮我看句子</button></div>
    <form id="tutor-form"><label for="tutor-question" class="sr-only">关于当前单词的问题</label><textarea id="tutor-question" maxlength="1500" placeholder="例如：inevitable 和 predictable 都能表示一定会发生吗？它们可以互换吗？" ${running ? 'disabled' : ''}>${learningEscape(item.tutorDraft || '')}</textarea><div class="tutor-actions"><span class="practice-hint">支持中文、英文，也可以接着追问。</span><div>${running ? '<button type="button" id="cancel-question" class="quiet-button">停止等待</button>' : ''}<button type="submit" class="primary" ${running ? 'disabled' : ''}>${running ? '正在解释…' : '提问并解释 →'}</button></div></div></form>
    <p class="tutor-connection" role="status">${learningEscape(tutorConnection.message)} <button id="check-tutor" class="text-button">重新检查</button></p>
    <div class="chatgpt-handoff"><p><strong>用现有 ChatGPT 会员提问</strong></p><p>先复制上面的问题，再打开 ChatGPT 粘贴发送。回答会显示在 ChatGPT，可以摘录到下方笔记。</p><div class="handoff-actions"><button id="copy-chatgpt" class="quiet-button" type="button">1. 复制问题</button><a href="https://chatgpt.com/" target="_blank" rel="noreferrer">2. 打开 ChatGPT ↗</a></div><details id="copy-preview" hidden><summary>复制内容（也可以手动选择复制）</summary><textarea id="chatgpt-prompt" readonly aria-label="准备发给 ChatGPT 的问题"></textarea></details></div>
    <details class="connection-help"><summary>怎样让回答直接显示在词本里？</summary><p>在本机 wordbook 文件夹中双击 Configure AI.command，按提示粘贴你在 OpenAI API Platform 创建的 API key；然后重新打开 Start.command。密钥仅由本机服务读取，不放进网页或词本备份。</p><p>已经有 ChatGPT 会员，也需要激活可用的 API 账户并创建密钥。<a href="https://developers.openai.com/api/docs/guides/chatgpt-api-credits" target="_blank" rel="noreferrer">查看会员 API 额度说明 ↗</a></p><p>提交时只发送当前词的释义、你的问题及该词最近 4 轮问答；不会自动发送其他单词或私人造句笔记。API 可能产生费用。</p></details>
    ${tutorErrors.has(item) ? `<p class="learning-error" role="alert">${learningEscape(tutorErrors.get(item))}</p>` : ''}
    <div class="tutor-history" aria-label="这个单词的问答记录">${history.map((turn, index) => `<article class="tutor-turn"><p class="tutor-question-text"><span>你问</span>${learningEscape(turn.question)}</p><div class="tutor-answer"><span class="answer-label">AI 解释 · 请结合语境判断</span><div class="answer-text">${learningEscape(turn.answer)}</div><button class="text-button" data-save-answer="${index}">把这段解释保存到笔记 ↓</button></div></article>`).join('')}</div>
    ${running ? `<p class="tutor-pending" role="status">正在解释：${learningEscape(running.question)}</p>` : ''}
    <details class="example-comparison"><summary>先看一个例子：inevitable 与 predictable</summary><span class="sample-label">本站预写讲解 · 非实时 AI 回答</span><p><strong>inevitable = 不可避免的</strong>：重点是“无法避免”。<br><strong>predictable = 可预测的</strong>：重点是“能提前预料到”。两者不等同。</p><div class="comparison-examples"><p lang="en">The accident was predictable, but it was not inevitable.</p><p>这次事故可以预见，但并非不可避免——提前采取措施，可能就能阻止。</p><p lang="en">The ending was predictable.</p><p>结局很好猜。这里说的是容易猜到，不是结局无法改变。</p></div><p>inevitable 常与 consequence、outcome、change 搭配；predictable 常用于 behavior、pattern、result。某个事件可以同时符合两者，但替换后强调的意思会变。</p><p><strong>为什么词典里也会出现 predictable？</strong>inevitable 还可以表示“总会出现、意料之中的”，在这个词义上两者会接近。比如 <span lang="en">Then came the inevitable question about my job.</span>（接着，果然又有人问起了我的工作。）这里带有“少不了这一问”的语气，不能只按“绝对无法避免”来理解。<a href="https://en.wiktionary.org/wiki/inevitable#Adjective" target="_blank" rel="noreferrer">查看词典词义 ↗</a></p><p><strong>试着判断：</strong>堵车早就能预料到，但换一条路就能避开。更适合哪个词？</p></details>
    <p class="practice-hint">${item.demo ? '示例问答仅保留在本次页面，保存单词后才能长期记录。' : '问答记录和草稿自动保存于当前浏览器（每词保留最近 12 轮）。'}</p>
  </section>`;
}

export async function refreshTutorConnection() {
  if (!/^https?:$/.test(location.protocol)) {
    tutorConnection = { state: 'offline', message: '当前是本地文件模式。自由问答需要双击 Start.command 启动本机服务。' };
    return tutorConnection;
  }
  try {
    const res = await fetch('/api/tutor/status', { signal: AbortSignal.timeout(4000) });
    if (!res.ok || !res.headers.get('content-type')?.includes('application/json')) throw new Error();
    const data = await res.json();
    tutorConnection = data.configured
      ? { state: 'ready', message: 'AI 接口已配置。只有提交问题时才会发送内容。' }
      : { state: 'offline', message: '尚未配置 API key；可以先看下方的词义辨析例子。' };
  } catch { tutorConnection = { state: 'offline', message: '未连接问答服务。请通过 Start.command 打开，并检查本机配置。' }; }
  return tutorConnection;
}

export function bindLearning(item, { persist, render, current, toast }) {
  const learning$ = selector => document.querySelector(selector);
  const update = () => { if (current() === item) render(); };
  const setQuestion = question => {
    item.tutorDraft = question;
    if (!item.demo) persist();
    const input = learning$('#tutor-question');
    input.value = question;
    input.focus();
    input.setSelectionRange(question.length, question.length);
    input.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };
  learning$('#load-synonyms').onclick = async () => {
    if (synonymJobs.has(item)) return;
    synonymJobs.add(item); synonymErrors.delete(item); update();
    try {
      const data = await getJSON(`https://api.datamuse.com/words?${new URLSearchParams({rel_syn:item.word,max:'12'})}`, 10000);
      if (!Array.isArray(data)) throw new Error('近义词服务返回格式不正确，请重试。');
      item.synonyms = { words: cleanSynonyms(data.map(x => x.word), item.word), provider: 'Datamuse', fetchedAt: new Date().toISOString() };
      if (!item.demo) persist();
    } catch { synonymErrors.set(item, '近义词服务暂时无法连接。已有结果仍保留，可以稍后重试。'); }
    finally { synonymJobs.delete(item); update(); }
  };
  document.querySelectorAll('[data-compare]').forEach(button => button.onclick = () => {
    if (tutorJobs.has(item)) { toast('请等当前回答结束后再比较。'); return; }
    setQuestion(`${item.word} 和 ${button.dataset.compare} 有什么区别？请比较含义、常见搭配和使用场景，给出英文例句及中文说明，并告诉我什么时候不能互换。`);
  });
  document.querySelectorAll('[data-question]').forEach(button => button.onclick = () => {
    if (!tutorJobs.has(item)) setQuestion(button.dataset.question);
  });
  learning$('#tutor-question').oninput = event => { item.tutorDraft = event.target.value; if (!item.demo) persist(); };
  learning$('#copy-chatgpt').onclick = async () => {
    const prompt = chatGPTQuestion(item, learning$('#tutor-question').value);
    const preview = learning$('#copy-preview');
    const field = learning$('#chatgpt-prompt');
    preview.hidden = false;
    field.value = prompt;
    try {
      await navigator.clipboard.writeText(prompt);
      toast('问题已复制。打开 ChatGPT 后粘贴发送即可。');
    } catch {
      preview.open = true;
      field.focus(); field.select();
      toast('浏览器未允许自动复制，内容已选中，请按 Command+C（Windows：Ctrl+C）。');
    }
  };
  learning$('#check-tutor').onclick = async () => { await refreshTutorConnection(); update(); };
  learning$('#cancel-question')?.addEventListener('click', () => tutorJobs.get(item)?.controller.abort());
  learning$('#tutor-form').onsubmit = async event => {
    event.preventDefault();
    if (tutorJobs.has(item)) return;
    const question = learning$('#tutor-question').value.trim();
    if (!question) { toast('先写下你想问的问题。'); learning$('#tutor-question').focus(); return; }
    item.tutorDraft = question;
    if (!item.demo) persist();
    if (tutorConnection.state !== 'ready') {
      await refreshTutorConnection();
      if (tutorConnection.state !== 'ready') { tutorErrors.set(item, tutorConnection.message); update(); return; }
    }
    if (tutorJobs.has(item)) return;
    const payload = tutorPayload(item, question);
    const controller = new AbortController();
    const job = { question, controller, timeout: false };
    const timer = setTimeout(() => { job.timeout = true; controller.abort(); }, 45000);
    tutorJobs.set(item, job); tutorErrors.delete(item); update();
    try {
      const response = await fetch('/api/tutor/ask', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload), signal:controller.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '暂时无法回答，请稍后重试。');
      if (typeof data.answer !== 'string' || !data.answer.trim()) throw new Error('没有收到完整回答，请重试。');
      item.tutorHistory = [...cleanTutorHistory(item.tutorHistory), {question, answer:data.answer, at:new Date().toISOString()}].slice(-12);
      item.tutorDraft = '';
      if (!item.demo) persist();
    } catch (error) {
      tutorErrors.set(item, controller.signal.aborted ? job.timeout ? '等待超时，问题已保留，可以重试。' : '已停止等待，问题已保留。' : error.message);
    } finally { clearTimeout(timer); tutorJobs.delete(item); update(); }
  };
  document.querySelectorAll('[data-save-answer]').forEach(button => button.onclick = () => {
    if (item.demo) { toast('请先保存这个单词，再保存学习笔记。'); return; }
    const turn = cleanTutorHistory(item.tutorHistory)[Number(button.dataset.saveAnswer)];
    if (!turn) return;
    const next = [item.note || '', `Q: ${turn.question}\n${turn.answer}`].filter(Boolean).join('\n\n');
    if (next.length > 3000) { toast('这段内容超过笔记长度，问答记录仍已保存，可手动摘录重点。'); return; }
    item.note = next; persist(); update(); toast('解释已加入这个单词的笔记。');
  });
}
