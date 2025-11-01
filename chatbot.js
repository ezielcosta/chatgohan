// chatbot.js - Chatbot Gohan Sushi com Chromium configurado e respostas automáticas

const fs = require('fs');
const path = require('path');
const moment = require('moment');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const chromium = require('chromium'); // 🔹 Torna o caminho do Chrome automático

moment.locale('pt-br');

// 🔹 Caminhos principais
const PROMO_FILE = path.join(__dirname, 'data', 'promo.json');
const QR_FILE = path.join(__dirname, 'public', 'qr.txt');
const LOGS = path.join(__dirname, 'logs');

// 🔹 Garante diretórios essenciais
if (!fs.existsSync(LOGS)) fs.mkdirSync(LOGS, { recursive: true });

// 🔹 Função para ler a promoção
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

// 🔹 Função para registrar logs
function log(type, who, body) {
  const file = path.join(LOGS, moment().format('YYYY-MM-DD') + '.txt');
  const line = `[${moment().format('HH:mm:ss')}] [${type}] ${who}: ${body}\n`;
  fs.appendFileSync(file, line);
}

// 🔹 Configuração do cliente WhatsApp com Chromium explícito
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    executablePath: chromium.path, // 🔥 Usa o caminho dinâmico do chromium instalado
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-extensions',
      '--disable-gpu',
      '--no-first-run',
      '--no-zygote',
      '--single-process',
      '--headless'
    ],
  },
});

// 🔹 Evento: QR Code gerado
client.on('qr', (qr) => {
  console.log('📱 Novo QR gerado!');
  try {
    fs.writeFileSync(QR_FILE, qr);
  } catch (e) {}
  qrcode.generate(qr, { small: true });
});

// 🔹 Evento: pronto (autenticado)
client.on('ready', () => {
  try {
    fs.writeFileSync(QR_FILE, 'CONECTADO');
  } catch (e) {}
  console.log('✅ Bot conectado ao WhatsApp com sucesso!');
});

// 🔹 Evento: desconectado
client.on('disconnected', (reason) => {
  try {
    fs.writeFileSync(QR_FILE, '');
  } catch (e) {}
  console.log('⚠️ WhatsApp desconectado:', reason);
});

// 🔹 Inicializa o bot
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
