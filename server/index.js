import express from 'express';
import helmet from 'helmet';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { api } from './api.js';
import { characterApi } from './character-api.js';
import { playerApi } from './player-api.js';
import { aiApi } from './ai-api.js';
import { mountMcp } from './mcp.js';
import { config } from './config.js';
import { migrate } from './migrate.js';
import { registerOAuthRoutes } from './mcp-oauth.js';
import { codexPrompt, codexStatus, startChatGptDeviceLogin, waitForLogin } from './codex-app-server.js';

const app=express();
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
app.use(helmet({contentSecurityPolicy:false,crossOriginOpenerPolicy:false,originAgentCluster:false}));
app.use(express.json({limit:'256kb'}));
app.use(express.urlencoded({ extended:false, limit:'32kb' }));

if (config.mcpOAuthEnabled) registerOAuthRoutes(app);
mountMcp(app);
// Dedicated OpenAI-facing endpoint. It exposes the same strictly read-only MCP tool set
// under a stable URL so ChatGPT app registration does not depend on the site's legacy AI route.
mountMcp(app, { path: '/mcp/openai', healthPath: '/mcp/openai/health' });

if (config.aiProvider === 'codex') {
  app.get('/api/codex/status', async (req,res,next) => {
    try { res.json(await codexStatus()); } catch (error) { next(error); }
  });
  const startCodexLogin = async (req,res,next) => {
    try {
      const login = await startChatGptDeviceLogin();
      res.json(login);
      waitForLogin(login.loginId).then(() => console.log('Codex ChatGPT login completed')).catch((error) => console.error('Codex ChatGPT login failed:', error.message));
    } catch (error) { next(error); }
  };
  app.get('/api/codex/login/start', startCodexLogin);
  app.post('/api/codex/login/start', startCodexLogin);
  app.post('/internal-ai/chat/completions', async (req,res,next) => {
    try {
      const auth = String(req.headers.authorization || '');
      if (!config.aiApiKey || auth !== `Bearer ${config.aiApiKey}`) return res.status(401).json({error:'Unauthorized'});
      const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
      const system = messages.filter((message) => message?.role === 'system').map((message) => String(message.content || '')).join('\n\n');
      const user = messages.filter((message) => message?.role !== 'system').map((message) => `${String(message.role || 'user').toUpperCase()}: ${String(message.content || '')}`).join('\n\n');
      const uuidMatches = `${system}\n${user}`.match(/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi) || [];
      const campaignId = req.body?.campaignId || uuidMatches[0] || config.defaultCampaignId;
      const characterId = req.body?.characterId || uuidMatches[1] || config.defaultCharacterId;
      const result = await codexPrompt({ system, user, campaignId, characterId });
      res.json({ id:`codex-${Date.now()}`, object:'chat.completion', model:config.aiModel, choices:[{index:0,message:{role:'assistant',content:result},finish_reason:'stop'}] });
    } catch (error) { next(error); }
  });
}

app.use('/api/characters',characterApi);
app.use('/api/player',playerApi);
app.use('/api',aiApi);
app.use('/api',api);
app.use(express.static(resolve(root,'public')));
app.get('*',(req,res)=>res.sendFile(resolve(root,'public/index.html')));
app.use((error,req,res,next)=>{const status=error.status||(error.name==='ZodError'?400:500);if(status>=500)console.error(error);res.status(status).json({error:error.message,code:error.code,details:error.issues||undefined})});
try{if(config.autoMigrate)await migrate();app.listen(config.port,()=>console.log(`D&D Realm готов: http://localhost:${config.port} (AI=${config.aiProvider})`))}catch(error){console.error('D&D Realm не запущен: миграция базы завершилась ошибкой',error);await new Promise(resolve=>setTimeout(resolve,50));process.exit(1)}
