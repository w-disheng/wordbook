import {dictionaryEntry, getJSON, httpsUrl} from './lib.js';

export function parseWiktionary(html, word) {
  // Parse detached HTML; only plain text and validated HTTPS links reach the UI.
  const document = new DOMParser().parseFromString(html, 'text/html');
  const root = document.querySelector('.mw-parser-output');
  if(!root) throw new Error('词典暂时没有可用的英文释义。');
  let english = false, part = '', phonetic = '', audio = '', audioSource = '';
  const senses = [];
  for(const node of root.children) {
    const heading = node.matches('h2,h3,h4,h5') ? node : node.querySelector('h2,h3,h4,h5');
    if(heading) {
      if(heading.tagName === 'H2') { if(english) break; english = heading.id === 'English'; }
      part = /^(Noun|Verb|Adjective|Adverb|Pronoun|Preposition|Conjunction|Interjection|Determiner|Phrase|Proper noun|Contraction)$/i.test(heading.textContent.trim()) ? heading.textContent.trim().toLowerCase() : '';
      continue;
    }
    if(!english) continue;
    if(!phonetic) phonetic = node.querySelector('.IPA')?.textContent || '';
    if(!audio) {
      const source = node.querySelector('source[type="audio/mpeg"]') || node.querySelector('audio source');
      if(source) {
        audio = httpsUrl(source.getAttribute('src') || '');
        const filename = audio.split('/').pop()?.replace(/\.(mp3|ogg)$/, '');
        if(filename) audioSource = `https://commons.wikimedia.org/wiki/File:${filename}`;
      }
    }
    if(node.tagName !== 'OL' || !part) continue;
    for(const li of node.children) {
      if(li.tagName !== 'LI') continue;
      const example = li.querySelector('.h-usage-example .e-example')?.textContent.trim() || '';
      const copy = li.cloneNode(true);
      copy.querySelectorAll('dl,ul,ol,table,style,script,.maintenance-line').forEach(x => x.remove());
      const definition = copy.textContent.replace(/\s+/g,' ').trim();
      if(definition) senses.push({part,definition,example});
    }
  }
  if(!senses.length) throw new Error('词典暂时没有收录这个英文单词。记录已保留，请检查拼写。');
  return {provider:'Wiktionary',phonetic,audio,audioSource,senses:senses.slice(0,8),sources:[`https://en.wiktionary.org/wiki/${encodeURIComponent(word)}#English`],license:{name:'CC BY-SA 4.0',url:'https://creativecommons.org/licenses/by-sa/4.0/'}};
}
export async function fetchDictionary(word) {
  try { return dictionaryEntry(await getJSON(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`, 5000)); }
  catch {
    const result = await getJSON(`https://en.wiktionary.org/w/api.php?${new URLSearchParams({action:'parse',page:word,prop:'text',format:'json',origin:'*',redirects:'1'})}`);
    if(!result.parse?.text?.['*']) throw new Error('词典暂时没有收录这个词，或服务不可用。记录已保留，请检查拼写或稍后重试。');
    return parseWiktionary(result.parse.text['*'], word);
  }
}
