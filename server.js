// server.js — Painel Gohan Sushi com CRM + Campanhas + Histórico + Central
const express = require('express');
const fs = require('fs');
const cors = require('cors');
const session = require('express-session');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({ secret: 'gohan_secret', resave: false, saveUninitialized: true }));

// =============== FUNÇÕES DE ARQUIVO ===================
const ensureDataFolder = () => {
  if (!fs.existsSync('./data')) fs.mkdirSync('./data');
  ['clientes.json', 'pedidos.json', 'campanhas.json'].forEach(f => {
    const p = `./data/${f}`;
    if (!fs.existsSync(p)) fs.writeFileSync(p, '[]');
  });
};
ensureDataFolder();

const readJSON = file => JSON.parse(fs.readFileSync(`./data/${file}`));
const writeJSON = (file, data) => fs.writeFileSync(`./data/${file}`, JSON.stringify(data, null, 2));

// =============== ROTAS DO PAINEL ======================
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public/index.html')));
app.get('/crm', (req, res) => res.sendFile(path.join(__dirname, 'public/crm.html')));
app.get('/campanhas', (req, res) => res.sendFile(path.join(__dirname, 'public/campanhas.html')));
app.get('/historico', (req, res) => res.sendFile(path.join(__dirname, 'public/historico.html')));

// =============== API CRM ==============================
app.get('/api/crm', (req, res) => res.json(readJSON('clientes.json')));
app.post('/api/crm', (req, res) => {
  const clientes = readJSON('clientes.json');
  clientes.push(req.body);
  writeJSON('clientes.json', clientes);
  res.json({ status: 'ok' });
});
app.put('/api/crm/:telefone', (req, res) => {
  const clientes = readJSON('clientes.json');
  const i = clientes.findIndex(c => c.telefone === req.params.telefone);
  if (i >= 0) clientes[i] = { ...clientes[i], ...req.body };
  writeJSON('clientes.json', clientes);
  res.json({ status: 'atualizado' });
});

// =============== API CAMPANHAS ========================
app.get('/api/campanhas', (req, res) => res.json(readJSON('campanhas.json')));
app.post('/api/campanhas', (req, res) => {
  const campanhas = readJSON('campanhas.json');
  const nova = { ...req.body, id: Date.now(), enviados: [] };
  campanhas.push(nova);
  writeJSON('campanhas.json', campanhas);
  res.json({ status: 'criado', campanha: nova });
});

// =============== API HISTÓRICO DE PEDIDOS =============
app.get('/api/historico', (req, res) => res.json(readJSON('pedidos.json')));
app.post('/api/historico', (req, res) => {
  const pedidos = readJSON('pedidos.json');
  pedidos.push(req.body);
  writeJSON('pedidos.json', pedidos);
  res.json({ status: 'registrado' });
});

app.get('/api/historico/export', (req, res) => {
  const pedidos = readJSON('pedidos.json');
  const csv = [
    'Nome,Telefone,Pedido,Data,Valor,Status',
    ...pedidos.map(p => `${p.nome},${p.telefone},${p.pedido},${p.data},${p.valor},${p.status}`)
  ].join('\n');
  res.header('Content-Type', 'text/csv');
  res.attachment('historico.csv');
  res.send(csv);
});

// =============== SOCKET.IO (Central Operador) =========
io.on('connection', socket => {
  console.log('🧠 Operador conectado ao painel.');

  // Recebe mensagem do operador e reenvia ao chatbot
  socket.on('responderCliente', msg => {
    io.emit('enviarParaWhatsApp', msg); // o chatbot.js vai escutar isso
  });

  socket.on('disconnect', () => console.log('❌ Operador saiu.'));
});

// =============== INICIA SERVIDOR ======================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Painel Gohan ativo em http://localhost:${PORT}`));

module.exports = { io }; // para integrar com chatbot.js

