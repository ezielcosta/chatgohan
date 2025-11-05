// chatbot.js - ChatGohan (versão final: CRM, Pedidos, Campanhas manuais, Socket.IO)
// Autor: Eziel Costa (adaptado)
// Instruções: Salve como chatbot.js na raiz. Rode: node chatbot.js
// Requisitos: whatsapp-web.js, qrcode-terminal, chromium, moment, fs, path

const fs = require('fs');
const path = require('path');
const moment = require('moment');
moment.locale('pt-br');

const qrcode = require('qrcode-terminal');
const { Client, LocalAuth } = require('whatsapp-web.js');

// opcional: chromium para ambientes headless (Railway)
let chromium = null;
try { chromium = require('chromium'); } catch(e){ /* ok se não existir localmente */ }

// CONFIGURAÇÕES (ajustáveis via env)
const CAMPAIGN_DELAY_MS = parseInt(process.env.CAMPAIGN_DELAY_MS || '2000', 10); // tempo entre mensagens de campanha
const CAMPAIGN_BATCH_INTERVAL_MS = parseInt(process.env.CAMPAIGN_BATCH_INTERVAL_MS || '10000', 10); // checagem de campanhas
const DATA_DIR = path.join(__dirname, 'data');
const LOGS_DIR = path.join(__dirname, 'logs');
const PUBLIC_DIR = path.join(__dirname, 'public');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });
if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR, { recursive: true });

// Arquivos usados
const CLIENTS_FILE = path.join(DATA_DIR, 'clientes.json');
const ORDERS_FILE = path.join(DATA_DIR, 'pedidos.json');
const CAMPAIGNS_FILE = path.join(DATA_DIR, 'campanhas.json');
const PROMO_FILE = path.join(DATA_DIR, 'promo.json');
const QR_FILE = path.join(PUBLIC_DIR, 'qr.txt');

// Garante arquivos padrão
if (!fs.existsSync(CLIENTS_FILE)) fs.writeFileSync(CLIENTS_FILE, '[]');
if (!fs.existsSync(ORDERS_FILE)) fs.writeFileSync(ORDERS_FILE, '[]');
if (!fs.existsSync(CAMPAIGNS_FILE)) fs.writeFileSync(CAMPAIGNS_FILE, '[]');
if (!fs.existsSync(PROMO_FILE)) fs.writeFileSync(PROMO_FILE, JSON.stringify({ texto: '', linkCardapio: 'https://pedido.anota.ai/' }, null, 2));
if (!fs.existsSync(QR_FILE)) fs.writeFileSync(QR_FILE, '');

// utilitários de arquivo
const readJSON = (p) => {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch(e){ return null; }
};
const writeJSON = (p, obj) => fs.writeFileSync(p, JSON.stringify(obj, null, 2), 'utf8');

// logs simples
function log(type, who, body) {
  try {
    const fname = path.join(LOGS_DIR, moment().format('YYYY-MM-DD') + '.txt');
    const line = `[${moment().format('HH:mm:ss')}] [${type}] ${who}: ${body}\n`;
    fs.appendFileSync(fname, line);
  } catch(e) { console.error('Erro log:', e); }
}

// tenta obter io do server (se server.js exportar)
let io = null;
try {
  const s = require('./server');
  io = s.io || null;
} catch(e){
  // ok — servidor pode rodar separado
  io = null;
}

// Inicializa client WhatsApp
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    executablePath: (chromium && chromium.path) ? chromium.path : undefined,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu'
    ].filter(Boolean)
  }
});

// QR gerado -> salva e imprime
client.on('qr', qr => {
  try { fs.writeFileSync(QR_FILE, qr); } catch(e){}
  qrcode.generate(qr, { small: true });
  console.log('📱 QR gerado (terminal).');
  if (io) io.emit('bot-event', { type: 'qr', qr });
});

// quando pronto
client.on('ready', () => {
  console.log('✅ WhatsApp pronto.');
  try { fs.writeFileSync(QR_FILE, 'CONECTADO'); } catch(e){}
  if (io) io.emit('bot-event', { type: 'ready' });
});

// desconectado
client.on('disconnected', (reason) => {
  console.log('⚠️ WhatsApp desconectado:', reason);
  try { fs.writeFileSync(QR_FILE, ''); } catch(e){}
  if (io) io.emit('bot-event', { type: 'disconnected', reason });
});

// função para salvar/atualizar cliente no CRM
function saveOrUpdateClientFromMsg(msg, contactName) {
  try {
    const numero = (msg.from || '').replace('@c.us', '');
    const clients = readJSON(CLIENTS_FILE) || [];
    let c = clients.find(x => x.numero === numero);
    if (!c) {
      c = {
        numero,
        nome: contactName || msg._data?.notifyName || 'Sem nome',
        pontos: 0,
        tags: [],
        historico: []
      };
      clients.push(c);
    }
    c.ultimoContato = moment().format('YYYY-MM-DD HH:mm:ss');
    // adiciona historico simples
    c.historico = c.historico || [];
    c.historico.push({ time: moment().toISOString(), text: (typeof msg.body === 'string' ? msg.body : `<${msg.type}>`) });
    writeJSON(CLIENTS_FILE, clients);
    log('CRM', numero, `salvo/atualizado`);
    if (io) io.emit('clients-updated', clients);
    return c;
  } catch (e) {
    console.error('Erro saveOrUpdateClientFromMsg', e);
    return null;
  }
}

// registra pedido em pedidos.json
function registerOrderFromMsg(msg, parsedText) {
  try {
    const numero = (msg.from || '').replace('@c.us', '');
    const clients = readJSON(CLIENTS_FILE) || [];
    const clientObj = clients.find(x => x.numero === numero) || { nome: msg._data?.notifyName || 'Sem nome' };
    const pedidos = readJSON(ORDERS_FILE) || [];
    const pedido = {
      id: Date.now().toString(),
      createdAt: moment().toISOString(),
      nome: clientObj.nome || 'Sem nome',
      numero,
      pedido: parsedText,
      valor: '',
      status: 'recebido'
    };
    pedidos.push(pedido);
    writeJSON(ORDERS_FILE, pedidos);
    log('PEDIDO', numero, parsedText);
    if (io) io.emit('orders-updated', pedido);
    return pedido;
  } catch(e) { console.error('Erro registrar pedido', e); return null; }
}

// substitui template {{name}} em mensagens
function applyTemplate(text, clientObj) {
  if (!text) return text;
  const name = (clientObj && clientObj.nome) ? clientObj.nome.split(' ')[0] : 'cliente';
  return text.replace(/\{\{\s*name\s*\}\}/gi, name);
}

// envia mensagem com tratamento e log
async function sendWhatsApp(numero, mensagem) {
  const chatId = `${numero}@c.us`;
  try {
    await client.sendMessage(chatId, mensagem);
    log('ENVIADO', numero, mensagem);
    return true;
  } catch (e) {
    console.error('Erro enviar msg', numero, e.message || e);
    log('ERRO', numero, (e.message || 'erro ao enviar'));
    return false;
  }
}

// PROCESSAMENTO DE CAMPANHAS
async function processCampaign(campaign) {
  try {
    const clients = readJSON(CLIENTS_FILE) || [];
    // busca destinatários: se directTo presente, usa só aquele número
    let targets = [];
    if (campaign.directTo) {
      const c = clients.find(x => x.numero === String(campaign.directTo));
      if (c) targets = [c];
    } else {
      targets = clients.slice(0);
      if (campaign.filter) {
        if (campaign.filter.minPoints) targets = targets.filter(t => (t.pontos || 0) >= campaign.filter.minPoints);
        if (campaign.filter.tag) targets = targets.filter(t => (t.tags || []).includes(campaign.filter.tag));
      }
      if (campaign.filter && campaign.filter.limit && campaign.filter.limit > 0) {
        targets = targets.slice(0, campaign.filter.limit);
      }
    }

    const sentList = campaign.enviados || [];

    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      if (sentList.includes(t.numero)) continue; // já enviado
      const texto = applyTemplate(campaign.message, t);
      const ok = await sendWhatsApp(t.numero, texto);
      // registra no array de enviados
      campaign.enviados = campaign.enviados || [];
      campaign.enviados.push(t.numero);
      // log no arquivo de campanha
      writeJSON(CAMPAIGNS_FILE, readJSON(CAMPAIGNS_FILE).map(c => c.id === campaign.id ? campaign : c));
      if (io) io.emit('campaigns-updated', readJSON(CAMPAIGNS_FILE));
      // espera entre envios
      await new Promise(r => setTimeout(r, CAMPAIGN_DELAY_MS));
    }

    // marca campanha como sent
    campaign.status = 'sent';
    const all = readJSON(CAMPAIGNS_FILE) || [];
    const idx = all.findIndex(x => x.id === campaign.id);
    if (idx >= 0) { all[idx] = campaign; writeJSON(CAMPAIGNS_FILE, all); }
    log('CAMPANHA', campaign.id, `enviada para ${campaign.enviados ? campaign.enviados.length : 0}`);
    if (io) io.emit('campaigns-updated', all);
  } catch (e) {
    console.error('Erro processar campanha', e);
  }
}

// Polling: checa campanhas com status === 'send' e processa
async function campaignsPollingLoop() {
  try {
    const list = readJSON(CAMPAIGNS_FILE) || [];
    const toSend = list.filter(c => c.status === 'send');
    for (const c of toSend) {
      // Antes de processar, marca como 'sending' para evitar duplicatas
      c.status = 'sending';
      writeJSON(CAMPAIGNS_FILE, list.map(x => x.id === c.id ? c : x));
      if (io) io.emit('campaigns-updated', readJSON(CAMPAIGNS_FILE));
      await processCampaign(c);
    }
  } catch (e) {
    console.error('Erro no polling de campanhas', e);
  } finally {
    setTimeout(campaignsPollingLoop, CAMPAIGN_BATCH_INTERVAL_MS);
  }
}

// EVENTO: quando o bot recebe mensagem
client.on('message', async (msg) => {
  try {
    if (!msg.from || !msg.from.endsWith('@c.us')) return;

    // garante leitura segura do body
    const rawBody = (typeof msg.body === 'string') ? msg.body.trim() : '';
    const lower = rawBody.toLowerCase();

    // salva/atualiza cliente no CRM
    const contactName = (msg._data && msg._data.notifyName) ? msg._data.notifyName : null;
    const clientObj = saveOrUpdateClientFromMsg(msg, contactName);

    // emite evento para painel
    if (io) io.emit('bot-event', { from: msg.from, body: rawBody, time: moment().toISOString() });

    // SE FOR PEDIDO (começa com 'pedido' ou 'pedido:')
    if (lower.startsWith('pedido')) {
      // extrai texto depois do 'pedido' e registra
      let parsed = rawBody.replace(/^pedido[:\s-]*/i, '').trim();
      if (!parsed) parsed = '(sem texto)';
      const pedido = registerOrderFromMsg(msg, parsed);
      // responde confirmando
      const reply = `✅ Pedido recebido!\n*Resumo:* ${parsed}\nAguarde confirmação do atendente.`;
      await msg.reply(reply);
      log('AUTOREPLY', msg.from, reply);
      return;
    }

    // COMANDOS SIMPLES DO MENU (1,2,3,4)
    if (lower === 'menu' || /\b(oi|ol[aá])\b/i.test(lower) || lower === '1' || lower === '2' || lower === '3' || lower === '4') {
      // lê promoção
      const promo = readJSON(PROMO_FILE) || {};
      const name = (clientObj && clientObj.nome) ? clientObj.nome.split(' ')[0] : 'cliente';
      const menu = [
        `🥢 Olá, ${name}! Bem-vindo ao *Gohan Sushi*!`,
        '',
        'Escolha uma opção:',
        '1️⃣ Cardápio online',
        '2️⃣ Promoção do dia',
        '3️⃣ Fazer pedido',
        '4️⃣ Falar com atendente',
        '',
        `📱 Cardápio: ${promo.linkCardapio || 'https://pedido.anota.ai/'}`
      ].join('\n');
      await msg.reply(menu);
      log('MENU', msg.from, 'menu enviado');
      return;
    }

    // fallback curtinho
    await msg.reply('❓ Não entendi. Digite *menu* para ver opções ou *pedido: <seu pedido>* para fazer pedido.');
    log('FALLBACK', msg.from, rawBody);
  } catch (e) {
    console.error('Erro no evento message:', e);
  }
});

// SOCKET.IO: escuta respostas do painel (se server exportou io, ele já usará o socket no front)
try {
  if (io) {
    io.on('connection', socket => {
      socket.on('responder', async (payload) => {
        // payload: { numero, mensagem }
        try {
          if (!payload || !payload.numero || !payload.mensagem) return;
          const numero = String(payload.numero).replace(/\D/g,'');
          await sendWhatsApp(numero, payload.mensagem);
          log('OPERADOR', numero, payload.mensagem);
        } catch(e){ console.error('Erro enviar via socket responder', e); }
      });

      // operador pode disparar campanha diretamente via socket (opcional)
      socket.on('trigger-campaign', async (campaignId) => {
        try {
          const list = readJSON(CAMPAIGNS_FILE) || [];
          const c = list.find(x => x.id === campaignId);
          if (c) {
            c.status = 'send';
            writeJSON(CAMPAIGNS_FILE, list);
            if (io) io.emit('campaigns-updated', list);
          }
        } catch(e){ console.error('Erro trigger-campaign', e); }
      });
    });
  }
} catch(e){ console.error('Erro integrar Socket.IO no bot', e); }

// Inicializa client
client.initialize().catch(e => console.error('Erro inicializar client:', e));

// Inicia loop de polling de campanhas
setTimeout(() => {
  campaignsPollingLoop();
}, 3000);

// exporta utilidades (para testes)
module.exports = { client, saveOrUpdateClientFromMsg };
