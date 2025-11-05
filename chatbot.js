// chatbot.js
const fs = require('fs');
const path = require('path');
const moment = require('moment');
const axios = require('axios'); // fetch server endpoints
moment.locale('pt-br');

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

let chromiumPath;
try { chromiumPath = require('chromium').path; } catch(e) { chromiumPath = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser'; }

const PROMO_FILE = path.join(__dirname, 'data', 'promo.json');
const CLIENTS_FILE = path.join(__dirname, 'data', 'clients.json');
const CAMPAIGNS_FILE = path.join(__dirname, 'data', 'campaigns.json');
const QR_FILE = path.join(__dirname, 'public', 'qr.txt');
const LOGS = path.join(__dirname, 'logs');
if (!fs.existsSync(LOGS)) fs.mkdirSync(LOGS, { recursive: true });

function readJson(p){ try{ return JSON.parse(fs.readFileSync(p,'utf8')); }catch(e){ return null; } }
function writeJson(p,o){ fs.writeFileSync(p, JSON.stringify(o,null,2)); }

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000'; // para /api/notify (quando bot e server em processos separados)
const SEND_INTERVAL = parseInt(process.env.CAMPAIGN_CHECK_MS) || 10_000; // 10s

function notifyServer(type,payload){
  // non-blocking
  axios.post(`${SERVER_URL}/api/notify`, { type, payload }).catch(()=>{});
}

function getPromo(){ return readJson(PROMO_FILE) || { texto: 'Promo indisponível', linkCardapio:'https://pedido.anota.ai/' }; }

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    executablePath: chromiumPath,
    headless: true,
    args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--no-first-run','--no-zygote','--disable-gpu']
  }
});

client.on('qr', qr => {
  console.log('📱 QR gerado. Escaneie com WhatsApp.');
  try { fs.writeFileSync(QR_FILE, qr); } catch(e){}
  qrcode.generate(qr, { small: true });
  notifyServer('qr-generated', { qr: 'generated' });
});

client.on('ready', () => {
  console.log('✅ WhatsApp conectado.');
  try { fs.writeFileSync(QR_FILE, 'CONECTADO'); } catch(e){}
  notifyServer('bot-ready', {});
});

client.on('disconnected', (reason) => {
  console.log('⚠️ WhatsApp desconectado:', reason);
  try { fs.writeFileSync(QR_FILE, ''); } catch(e){}
  notifyServer('bot-disconnected', { reason });
});

client.initialize();

// Save or update client
function saveLead(number, name, lastMessage){
  let clients = readJson(CLIENTS_FILE) || [];
  let c = clients.find(x=>x.number===number);
  if (c) {
    c.name = name || c.name;
    c.lastMessage = lastMessage || c.lastMessage;
    c.updatedAt = new Date().toISOString();
  } else {
    c = { number, name, lastMessage, createdAt: new Date().toISOString(), points:0, tags: [] };
    clients.push(c);
  }
  writeJson(CLIENTS_FILE, clients);
  // notify server
  notifyServer('new-lead', c);
}

client.on('message', async msg => {
  if (!msg.from || !msg.from.endsWith('@c.us')) return;
  const raw = typeof msg.body === 'string' ? msg.body.trim() : '';
  const body = raw.toLowerCase();
  const contact = await msg.getContact();
  const name = contact.pushname || contact.number || 'cliente';
  saveLead(contact.number, name, raw);

  notifyServer('message-received', { from: contact.number, body: raw, name });

  // menu and replies
  if (body.match(/\b(oi|ola|olá|menu|start|iniciar)\b/i)) {
    const promo = getPromo();
    const welcome = [
      '🥢 *Bem-vindo ao Gohan Sushi!*',
      '',
      'Escolha uma opção:',
      '1️⃣ Cardápio',
      '2️⃣ Promoção do dia',
      '3️⃣ Fazer pedido',
      '4️⃣ Falar com atendente',
      '',
      `🔗 Cardápio: ${promo.linkCardapio}`
    ].join('\n');
    await msg.reply(welcome);
    notifyServer('message-sent', { to: contact.number, text: welcome });
    return;
  }

  if (body === '1') {
    const promo = getPromo();
    const text = `🍱 Cardápio: ${promo.linkCardapio}`;
    await msg.reply(text);
    notifyServer('message-sent', { to: contact.number, text });
    return;
  }
  if (body === '2') {
    const promo = getPromo();
    const text = `🔥 Promoção do Dia:\n${promo.texto}`;
    await msg.reply(text);
    notifyServer('message-sent', { to: contact.number, text });
    return;
  }
  if (body === '3') {
    const text = 'Envie seu pedido no formato:\nPEDIDO: ...\nENDEREÇO: ...\nPAGAMENTO: ...';
    await msg.reply(text);
    notifyServer('message-sent', { to: contact.number, text });
    return;
  }

  if (body.startsWith('pedido:')) {
    const text = '✅ Pedido recebido! Em instantes confirmamos.';
    await msg.reply(text);
    notifyServer('order-received', { from: contact.number, body: raw });
    // also persist order to server API
    axios.post(`${SERVER_URL}/api/orders`, {
      number: contact.number,
      name,
      pedido: raw,
      endereco: '',
      pagamento: ''
    }).catch(()=>{});
    return;
  }

  const fallback = '❓ Não entendi. Digite "menu" para ver as opções.';
  await msg.reply(fallback);
  notifyServer('message-sent', { to: contact.number, text: fallback });
});

// Campaign sender (polls campaigns.json for pending)
async function processCampaigns(){
  const campaigns = readJson(CAMPAIGNS_FILE) || [];
  const clients = readJson(CLIENTS_FILE) || [];
  for (const c of campaigns.filter(x => x.status === 'pending')) {
    // build filter
    const filter = c.filter || {};
    const minPoints = filter.minPoints || 0;
    const tag = filter.tag || null;
    const limit = filter.limit || 0;

    const targets = clients.filter(cl => {
      if (cl.points < minPoints) return false;
      if (tag && (!cl.tags || !cl.tags.includes(tag))) return false;
      return true;
    });

    let sentCount = 0;
    for (const t of targets) {
      if (limit && sentCount >= limit) break;
      try {
        // send message (template may have {{name}})
        const msgText = (c.message || '').replace(/{{name}}/g, t.name || '');
        await client.sendMessage(`${t.number}`, msgText);
        sentCount++;
        // record sent
        c.sent = c.sent || [];
        c.sent.push({ number: t.number, when: new Date().toISOString() });
        // notify server
        notifyServer('campaign-sent', { campaignId: c.id, to: t.number });
      } catch (err) {
        console.error('error sending to', t.number, err && err.message);
      }
      // small delay to avoid flood
      await new Promise(r => setTimeout(r, 800));
    }
    c.status = 'sent';
    c.sentCount = sentCount;
    writeJson(CAMPAIGNS_FILE, campaigns);
    // update server-side copy if exists
    try { await axios.post(`${SERVER_URL}/api/campaigns/${c.id}/mark-sent`, { status: 'sent' }); } catch(e){}
  }
}

// start polling loop
setInterval(() => {
  processCampaigns().catch(()=>{});
}, SEND_INTERVAL);

// safe start
process.on('uncaughtException', err => console.error('UNCAUGHT', err));
process.on('unhandledRejection', err => console.error('UNHANDLED', err));
