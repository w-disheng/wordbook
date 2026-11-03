import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { askTutor, TutorError } from './tutor.mjs';

const PUBLIC_FILES = new Map([
  ['/', ['index.html','text/html; charset=utf-8']], ['/index.html',['index.html','text/html; charset=utf-8']],
  ['/styles.css',['styles.css','text/css; charset=utf-8']], ['/app.bundle.js',['app.bundle.js','text/javascript; charset=utf-8']]
]);

export function createHandler({ apiKey = '', model = 'gpt-6-luna', port = 4173, tutor = askTutor } = {}) {
  let active = 0;
  const requests = [];
  return async (req, res) => {
    const json = (status, value) => {
      if (res.destroyed) return;
      res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
      res.end(JSON.stringify(value));
    };
    const host = req.headers.host;
    if (![ `127.0.0.1:${port}`, `localhost:${port}` ].includes(host)) { json(403,{error:'只允许本机访问。'}); return; }
    const path = new URL(req.url, `http://${host}`).pathname;
    if (path === '/api/tutor/status' && req.method === 'GET') { json(200,{configured:!!apiKey}); return; }
    if (path === '/api/tutor/ask') {
      if (req.method !== 'POST') { json(405,{error:'请通过提问表单提交。'}); return; }
      if (req.headers.origin !== `http://${host}` || !req.headers['content-type']?.startsWith('application/json')) { json(403,{error:'只接受从本机 Wordbook 页面发起的问题。'}); return; }
      const chunks = [];
      let size = 0;
      try {
        for await (const chunk of req) {
          const bytes = Buffer.from(chunk);
          size += bytes.length;
          if (size > 65536) throw new TutorError('问题内容过长，请缩短后重试。',413);
          chunks.push(bytes);
        }
        let input;
        try { input = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new TutorError('问题格式不正确。'); }
        if (!apiKey) throw new TutorError('尚未配置 API key。请配置本机 .env 后重启。',503,'not_configured');
        const now = Date.now();
        while (requests.length && requests[0] < now - 60000) requests.shift();
        if (requests.length >= 12 || active >= 2) throw new TutorError('提问太快了，请等待当前回答结束再试。',429,'rate_limit');
        requests.push(now); active++;
        const controller = new AbortController();
        res.on('close', () => { if (!res.writableEnded) controller.abort(); });
        try { json(200,await tutor(input,{apiKey,model,signal:controller.signal})); }
        finally { active--; }
      } catch (error) { json(error instanceof TutorError ? error.status : 500,{error:error instanceof TutorError ? error.message : '本机服务出现错误，请稍后重试。',code:error instanceof TutorError ? error.code : 'server_error'}); }
      return;
    }
    const asset = PUBLIC_FILES.get(path);
    if (!asset || !['GET','HEAD'].includes(req.method)) { json(404,{error:'Not found'}); return; }
    try {
      const file = await readFile(new URL(`./dist/${asset[0]}`, import.meta.url));
      res.writeHead(200,{'Content-Type':asset[1],'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});
      res.end(req.method === 'HEAD' ? undefined : file);
    } catch { json(500,{error:'页面文件缺失，请运行 build.mjs。'}); }
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { process.loadEnvFile(fileURLToPath(new URL('./.env',import.meta.url))); }
  catch (error) { if (error.code !== 'ENOENT') { console.error('无法读取本机 .env 配置，请检查文件格式。'); process.exit(1); } }
  const port = Number(process.env.PORT || 4173);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) { console.error('PORT 必须是 1024 到 65535 的整数。'); process.exit(1); }
  const apiKey = process.env.OPENAI_API_KEY || '';
  const server = http.createServer(createHandler({apiKey,model:process.env.OPENAI_MODEL || 'gpt-6-luna',port}));
  server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? `端口 ${port} 已被占用，请关闭旧预览服务后重试。` : '无法启动本机服务。'); process.exit(1); });
  server.listen(port,'127.0.0.1',()=>console.log(`Wordbook: http://127.0.0.1:${port}\n学习问答：${apiKey ? 'API key 已配置' : '尚未配置 API key；近义词和预写讲解仍可使用'}\n按 Ctrl+C 停止。`));
}
