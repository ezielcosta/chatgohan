// chatbot.js - bot that reads promo.json and replies (uses LocalAuth)
const fs = require('fs');
const path = require('path');
const moment = require('moment');
moment.locale('pt-br');

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const chromium = require('chromium'); // <-- necessário para ambiente headless (Railway)

const PROMO_FILE = path.join(__dirname, 'data', 'promo.json');
const QR_FILE = path.join(__dirname, 'public', 'qr.txt');
const LOGS = path.join(__dirname, 'logs');

if (!fs.existsSync(LOGS)) fs.mkdirSync(LOGS, { recursive: true });

function getPromo() {
  try {
    return JSON.parse(fs.readFileSync(PROMO_FILE, 'utf8'));
  } catch (e) {
    return {
      texto: '🔥 Promoção indisponível',
      linkCardapio: 'https://pedido.anota.ai/',
    };
  }
}

function log(type, who, body) {
  const file = path.join(LOGS, moment().format('YYYY-MM-DD') + '.txt');
  const line = `[${moment().format('HH:mm:ss')}] [${type}] ${who}: ${body}\n`;
  fs.appendFileSync(file, line);
}

// ✅ Inicialização corrigida com chromium leve + sandbox desativado
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    executablePath: chromium.path, // caminho para Chromium headless
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
    ],
  },
});

client.on('qr', (qr) => {
  qrcode.generate(qr, { small: true });
  try {
    fs.writeFileSync(QR_FILE, qr);
  } catch (e) {}
  console.log('📱 QR gerado. Escaneie com WhatsApp.');
});

client.on('ready', () => {
  try {
    fs.writeFileSync(QR_FILE, 'CONECTADO');
  } catch (e) {}
  console.log('✅ WhatsApp conectado.');
});

client.on('disconnected', (reason) => {
  try {
    fs.writeFileSync(QR_FILE, '');
  } catch (e) {}
  console.log('⚠️ WhatsApp desconectado:', reason);
});

client.initialize();

// ==========================
// Lógica de mensagens
// ==========================
client.on('message', async (msg) => {
  if (!msg.from || !msg.from.endsWith('@c.us')) return;
  const raw = typeof msg.body === 'string' ? msg.body.trim() : '';
  const body = raw.toLowerCase();
  log('RECEBIDO', msg.from, raw || `<${msg.type}>`);

  if (body.match(/\b(oi|ola|olá|menu|start|iniciar)\b/i)) {
    const promo = getPromo();
    const welcome = [
      '🥢 *Bem-vindo ao Gohan Sushi!*',
      '🍣 *A melhor experiência japonesa de Santarém.*',
      '',
      'Escolha uma opção:',
      '1️⃣ *Cardápio completo*',
      '2️⃣ *Promoção do dia*',
      '3️⃣ *Fazer pedido*',
      '4️⃣ *Falar com atendente*',
      '',
      `📱 Cardápio online: ${promo.linkCardapio}`,
    ].join('\n');
    await msg.reply(welcome);
    log('ENVIADO', msg.from, welcome);
    return;
  }

  if (body === '1') {
    const promo = getPromo();
    const resposta = `🍱 *Cardápio completo:*\n${promo.linkCardapio}\n\nPara pedir, digite *3*.`;
    await msg.reply(resposta);
    log('ENVIADO', msg.from, resposta);
    return;
  }

  if (body === '2') {
    const promo = getPromo();
    const resposta = `🔥 *Promoção do Dia:*\n${promo.texto}`;
    await msg.reply(resposta);
    log('ENVIADO', msg.from, resposta);
    return;
  }

  if (body === '3') {
    const resposta =
      '🍱 *Para fazer seu pedido:*\n\nEnvie no formato:\n*PEDIDO:* (nome do prato e quantidade)\n*ENDEREÇO:* (rua, número, bairro)\n*PAGAMENTO:* (pix, dinheiro, cartão)\n\nNosso atendente confirma o pedido em instantes.';
    await msg.reply(resposta);
    log('ENVIADO', msg.from, resposta);
    return;
  }

  if (body === '4') {
    const resposta =
      '👩‍💼 *Atendimento humano:* O atendente responde por este número. Aguarde um instante.';
    await msg.reply(resposta);
    log('ENVIADO', msg.from, resposta);
    return;
  }

  if (body.startsWith('pedido:')) {
    const resposta = '✅ Pedido recebido! Em instantes confirmaremos os detalhes.';
    await msg.reply(resposta);
    log('ENVIADO', msg.from, resposta);
    return;
  }

  const fallback = '❓ *Não entendi.* Digite *menu* para ver as opções ou *1* para cardápio.';
  await msg.reply(fallback);
  log('ENVIADO', msg.from, fallback);
});
