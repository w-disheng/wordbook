export const STORAGE_KEY = 'wordbook.v1';
export function cleanSynonyms(values, word = '') {
  if (!Array.isArray(values)) return [];
  const seen = new Set([word.toLowerCase()]);
  return values.filter(value => {
    if (typeof value !== 'string') return false;
    const key = value.trim().toLowerCase();
    if (!/^[a-z]+(?:[ '-][a-z]+)*$/.test(key) || key.length > 80 || seen.has(key)) return false;
    seen.add(key); return true;
  }).map(value => value.trim().toLowerCase()).slice(0, 12);
}
export function normalizeWord(value) {
  const word = value.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!word || word.length > 80 || !/^[a-z]+(?:[ '-][a-z]+)*$/.test(word)) throw new Error('请输入英文单词，可包含空格、连字符或撇号。');
  return word;
}
export function httpsUrl(value) {
  try { const url = new URL(value.startsWith('//') ? `https:${value}` : value); return url.protocol === 'https:' ? url.href : ''; } catch { return ''; }
}
export function dictionaryEntry(data) {
  if (!Array.isArray(data) || !data.length) throw new Error('词典暂时没有收录这个词。单词已经记下，可以稍后重试。');
  const phonetics = data.flatMap(x => x.phonetics || []);
  const sounds = phonetics.filter(x => x.audio && httpsUrl(x.audio));
  const audio = sounds.find(x => /[-_]us[_.-]/i.test(x.audio)) || sounds[0];
  const all = data.flatMap(entry => (entry.meanings || []).flatMap(m => (m.definitions || []).map(d => ({ part: m.partOfSpeech || '', definition: d.definition || '', example: d.example || '', synonyms: cleanSynonyms(d.synonyms, entry.word || '') })))).filter(x => x.definition);
  const synonymGroups = data.flatMap(entry => (entry.meanings || []).map(m => ({part: m.partOfSpeech || '', words: cleanSynonyms(m.synonyms, entry.word || '')}))).filter(g => g.words.length);
  const seen = new Set();
  const senses = all.filter(x => { if(seen.has(x.definition)) return false; seen.add(x.definition); return true; }).slice(0, 8);
  if (!senses.length) throw new Error('词典没有返回释义，请稍后重试。');
  return { provider:'Free Dictionary API', phonetic: audio?.text || phonetics.find(x => x.text)?.text || data[0].phonetic || '', audio: audio ? httpsUrl(audio.audio) : '', audioSource:audio?.sourceUrl || '', senses, synonymGroups, sources: [...new Set(data.flatMap(x => x.sourceUrls || []).map(httpsUrl).filter(Boolean))], license: data[0].license || null };
}
export async function getJSON(url, timeout = 14000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if(response.status === 404) throw new Error('词典暂时没有收录这个词。单词已经记下，可以检查拼写或稍后重试。');
    if(!response.ok) throw new Error('服务暂时不可用，请稍后重试。');
    return await response.json();
  } catch(error) {
    if(error.name === 'AbortError' || error instanceof TypeError) throw new Error('连接超时或网络不可用。单词已保留，请稍后重试。');
    throw error;
  } finally { clearTimeout(timer); }
}
export function readWords(storage) {
  const raw = storage.getItem(STORAGE_KEY);
  if(!raw) return [];
  const parsed = JSON.parse(raw);
  if(!Array.isArray(parsed)) throw new Error('无法读取已有词本。');
  if(parsed.some(x => !x || typeof x.word !== 'string' || normalizeWord(x.word) !== x.word)) throw new Error('词本格式不正确。');
  return parsed;
}
