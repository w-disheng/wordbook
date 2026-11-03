import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { EventEmitter } from 'node:events';
import { cleanSynonyms, dictionaryEntry } from '../dist/lib.js';
import { synonymGroupsFor, tutorPayload, cleanTutorHistory, renderTutor, renderSynonyms, chatGPTQuestion } from '../dist/learning.js';
import { validateQuestion, responseRequest, responseText, askTutor } from '../tutor.mjs';
import { createHandler } from '../server.mjs';

test('synonyms normalize, deduplicate and exclude the queried word and invalid text', () => {
  assert.deepEqual(cleanSynonyms(['Inevitable','unavoidable','Unavoidable',' inescapable ','<img>','',null], 'inevitable'), ['unavoidable','inescapable']);
});
test('dictionary synonyms preserve meaning and part of speech', () => {
  const data = dictionaryEntry([{word:'inevitable',meanings:[{partOfSpeech:'adjective',synonyms:['certain'],definitions:[{definition:'Impossible to avoid.',synonyms:['unavoidable','inescapable']}]}]}]);
  const groups = synonymGroupsFor({word:'inevitable',data});
  assert.equal(groups.length,2);
  assert.equal(groups[0].meaning,'Impossible to avoid.');
  assert.equal(groups[0].part,'adjective');
  assert.deepEqual(groups[0].words,['unavoidable','inescapable']);
  assert.equal(groups[1].meaning,'');
});
test('older saved records still render, and external synonym content is escaped', () => {
  const item={word:'test',data:{senses:[{definition:'A test.'}]}};
  assert.deepEqual(synonymGroupsFor(item),[]);
  assert.match(renderSynonyms(item),/查找近义词/);
  const html=renderSynonyms({word:'test',data:{senses:[{part:'<img>',definition:'<script>',synonyms:['trial']} ]}});
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
});
test('tutor payload includes only the selected word, question, definitions and bounded history', () => {
  const history=Array.from({length:15},(_,i)=>({question:`q${i}`,answer:`a${i}`}));
  const payload=tutorPayload({word:'inevitable',note:'PRIVATE NOTE',translation:'private translation',tutorHistory:history,data:{senses:[{definition:'Impossible to avoid.',audio:'secret'}]}},'  和 predictable 一样吗？ ');
  assert.equal(payload.history.length,4);
  assert.equal(payload.question,'和 predictable 一样吗？');
  assert.ok(!JSON.stringify(payload).includes('PRIVATE'));
  assert.ok(!JSON.stringify(payload).includes('audio'));
  assert.equal(cleanTutorHistory(history).length,12);
});
test('answer content renders as text; sample is explicitly labelled', () => {
  const html=renderTutor({word:'inevitable',tutorHistory:[{question:'<img src=x>',answer:'<script>alert(1)</script>'}]});
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('本站预写讲解 · 非实时 AI 回答'));
});
test('ChatGPT handoff contains the current question and excludes private notes and conversation history', () => {
  const prompt = chatGPTQuestion({word:'inevitable',note:'PRIVATE NOTE',tutorHistory:[{question:'PRIVATE QUESTION',answer:'PRIVATE ANSWER'}],data:{senses:[{definition:'Impossible to avoid.'}]}}, '和 predictable 一样吗？');
  assert.match(prompt,/inevitable/);
  assert.match(prompt,/和 predictable 一样吗？/);
  assert.match(prompt,/Impossible to avoid/);
  assert.ok(!prompt.includes('PRIVATE'));
  assert.match(chatGPTQuestion({word:'test'}),/请解释 test 的用法/);
});
test('input validation rejects empty and excessive questions and removes unknown fields', () => {
  assert.throws(()=>validateQuestion({word:'bad<script>',question:'x'}));
  assert.throws(()=>validateQuestion({word:'test',question:' '}));
  assert.throws(()=>validateQuestion({word:'test',question:'a'.repeat(1501)}));
  const q=validateQuestion({word:' TEST ',question:'hello',apiKey:'do not forward',history:[{question:'a',answer:'b'}]});
  assert.equal(q.word,'test');
  assert.ok(!('apiKey' in q));
});
test('provider request preserves follow-up context, bounded output and no server conversation storage', () => {
  const r=responseRequest({word:'inevitable',senses:[],history:[{question:'first',answer:'explanation'}],question:'follow up'},'configured-model');
  assert.equal(r.model,'configured-model');
  assert.equal(r.store,false);
  assert.equal(r.max_output_tokens,2200);
  assert.equal(r.input[1].content,'first');
  assert.equal(r.input[2].role,'assistant');
  assert.equal(r.input.at(-1).content,'follow up');
});
test('response parser handles output, refusal, incomplete and empty responses', () => {
  assert.equal(responseText({output:[{type:'reasoning',content:[]},{type:'message',content:[{type:'output_text',text:'Hello'}]}]}),'Hello');
  assert.throws(()=>responseText({status:'incomplete',output:[]}),/未完成/);
  assert.throws(()=>responseText({output:[{type:'message',content:[{type:'refusal',refusal:'no'}]}]}),/没有生成/);
  assert.throws(()=>responseText({output:[]}),/没有返回/);
});
test('missing key never sends a request; valid calls keep credentials server-side', async () => {
  let called=0;
  await assert.rejects(askTutor({word:'test',question:'why?'},{fetchImpl:()=>{called++;}}),/尚未配置/);
  assert.equal(called,0);
  const result=await askTutor({word:'test',question:'why?'},{apiKey:'TEST_ONLY_FAKE_KEY',fetchImpl:async(url,options)=>{
    assert.equal(url,'https://api.openai.com/v1/responses');
    assert.equal(options.headers.Authorization,'Bearer TEST_ONLY_FAKE_KEY');
    return {ok:true,json:async()=>({output:[{type:'message',content:[{type:'output_text',text:'A test explanation.'}]}]})};
  }});
  assert.deepEqual(result,{answer:'A test explanation.'});
  assert.ok(!JSON.stringify(result).includes('KEY'));
});
test('provider errors have actionable messages and do not echo diagnostics or keys', async () => {
  for(const [status,expected] of [[401,/key 无效/],[429,/额度不足/],[403,/权限/],[500,/暂时无法/]]) {
    await assert.rejects(askTutor({word:'test',question:'why?'},{apiKey:'TEST_ONLY_FAKE_KEY',fetchImpl:async()=>({ok:false,status,json:async()=>({error:'SECRET DIAGNOSTIC'})})}),expected);
  }
});

async function request(handler, path, {method='GET',origin='http://127.0.0.1:4173',body='',host='127.0.0.1:4173'}={}) {
  const bytes=Buffer.from(body);
  // Deliberately split multi-byte Chinese characters across chunks.
  const req=Readable.from(Array.from(bytes,b=>Buffer.from([b])));
  req.method=method; req.url=path; req.headers={host,origin,'content-type':'application/json'};
  const res=new EventEmitter();
  res.destroyed=false;
  res.writeHead=(status,headers)=>{res.status=status;res.headers=headers;};
  res.end=value=>{res.body=value?.toString() || '';res.writableEnded=true;};
  await handler(req,res);
  return res;
}
test('local server exposes status without secrets and never serves environment files', async () => {
  const handler=createHandler({apiKey:'TEST_ONLY_FAKE_KEY'});
  const status=await request(handler,'/api/tutor/status');
  assert.deepEqual(JSON.parse(status.body),{configured:true});
  for(const path of ['/.env','/../.env','/%2e%2e/.env','/server.mjs','/.git/config']) assert.equal((await request(handler,path)).status,404);
  assert.equal((await request(handler,'/',{host:'attacker.example:4173'})).status,403);
});
test('question route rejects cross-origin requests, malformed JSON and missing config', async () => {
  const handler=createHandler();
  assert.equal((await request(handler,'/api/tutor/ask',{method:'POST',origin:'https://attacker.example',body:'{}'})).status,403);
  assert.equal((await request(handler,'/api/tutor/ask',{method:'POST',body:'bad json'})).status,400);
  assert.equal((await request(handler,'/api/tutor/ask',{method:'POST',body:'{}'})).status,503);
  assert.equal((await request(handler,'/api/tutor/ask')).status,405);
});
test('question route preserves Chinese across byte boundaries and returns real handler output', async () => {
  const handler=createHandler({apiKey:'TEST_ONLY_FAKE_KEY',tutor:async input=>{assert.equal(input.question,'可预测和不可避免相同吗？');return {answer:'不相同。'};}});
  const res=await request(handler,'/api/tutor/ask',{method:'POST',body:JSON.stringify({word:'inevitable',question:'可预测和不可避免相同吗？'})});
  assert.equal(res.status,200);
  assert.equal(JSON.parse(res.body).answer,'不相同。');
});
