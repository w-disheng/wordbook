import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeWord, dictionaryEntry, httpsUrl, readWords, getJSON} from '../dist/lib.js';

test('normalizes duplicate spellings, preserves valid compounds, rejects unsafe input', () => {
  assert.equal(normalizeWord('  Commute  '), 'commute');
  assert.equal(normalizeWord('look   up'), 'look up');
  assert.equal(normalizeWord('self-aware'), 'self-aware');
  assert.throws(() => normalizeWord('<script>'));
  assert.throws(() => normalizeWord('中文'));
  assert.throws(() => normalizeWord(''));
});
test('extracts real examples and prefers a US recording without fabricating missing fields', () => {
  const result = dictionaryEntry([{phonetics:[{audio:'https://example.com/test-uk.mp3'},{audio:'https://example.com/test-us.mp3',text:'/test/'}],meanings:[{partOfSpeech:'noun',definitions:[{definition:'A trial.',example:'This is a test.'},{definition:'An examination.'}]}]}]);
  assert.equal(result.audio, 'https://example.com/test-us.mp3');
  assert.equal(result.senses[0].example, 'This is a test.');
  assert.equal(result.senses[1].example, '');
  assert.throws(() => dictionaryEntry({title:'No Definitions Found'}));
});
test('rejects executable links and corrupt persisted data', () => {
  assert.equal(httpsUrl('javascript:alert(1)'), '');
  assert.equal(httpsUrl('//example.com/a.mp3'), 'https://example.com/a.mp3');
  assert.deepEqual(readWords({getItem:() => null}), []);
  assert.throws(() => readWords({getItem:() => '{bad json'}));
  assert.throws(() => readWords({getItem:() => '[{"word": "<img>"}]'}));
});
test('network and missing-word failures yield actionable errors', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({ok:false,status:404});
    await assert.rejects(getJSON('https://example.com'), /没有收录/);
    globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
    await assert.rejects(getJSON('https://example.com'), /网络不可用/);
  } finally { globalThis.fetch = original; }
});
