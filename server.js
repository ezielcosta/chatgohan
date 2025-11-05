// server.js - ChatGohan: painel + API + Socket.IO (CRM, campanhas, pedidos, export CSV)
// Autor: Eziel Costa (ajustado para integração CRM/campanhas/central)

const express = require('express');
const http = require('http');
const { Server: IOServer } = require('socket.io');
const fs = require('fs');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new IOServer(server);

const PORT = process.env.PORT || 3000;
const DATA = path.join(__dirname, 'data');
if (!fs.existsSync(DATA)) fs.mkdirSync(DATA, { recursive: true });

const PROMO_FILE = path.join(DATA, 'promo.json');
const CLIENTS_FILE = path.join(DATA, 'clientes.json');
const CAMPAIGNS_FILE = path.join(DATA, 'campaigns.json');
const ORDERS_FILE = path.join(DATA, 'pedidos.json');
const USER_FILE = path.join(DATA, 'user.json');
const QR_FILE = path.join(__dirname, 'public', 'qr.txt');

// defaults
if (!fs.existsSync(PROMO_FILE)) fs.writeFileSync(PROMO_FILE, JSON.stringify({
  texto: "🔥 *Promoção do Dia:*\nCompre 1 Temaki e leve um Suco Natural grátis 🍹\nVálido até as 23h!",
  linkCardapio: "https://pedido.anota.ai/"
}, null, 2));
if (!fs.existsSync(CLIENTS_FILE)) fs.writeFileSync(CLIENTS_FILE, JSON.stringify([], null, 2));
if (!fs.existsSync(CAMPAIGNS_FILE)) fs.writeFileSync(CAMPAIGNS_FILE, JSON.stringify([], null, 2));
if (!fs.existsSync(ORDERS_FILE)) fs.writeFileSync(ORDERS_FILE, JSON.stringify([], null, 2));
if (!fs.existsSync(USER_FILE)) {
  const hash = bcrypt.hashSync(process.env.ADMIN_PASS || 'goshui2443', 10);
  fs.writeFileSync(USER_FILE, JSON.stringify({ username: process.env.ADMIN_USER || 'admin', password_hash: hash }, null, 2));
}

app.use(express.json());
app.use(express.static('public'));
app.use(session({
  secret: process.env.SESSION_SECRET || 'keyboardcat',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false }
}));

// helpers
function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p,'utf8')); } catch(e) { return null; }
}
function writeJson(p,obj) {
  fs.writeFileSync(p, JSON.stringify(obj, null, 2));
}

// ------------- AUTH -------------
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const user = readJson(USER_FILE);
  if (!user) return res.json({ success:false, msg: 'Usuário não configurado' });
  if (username !== user.username) return res.json({ success:false, msg: 'Usuário inválido' });
  const ok = bcrypt.compareSync(password, user.password_hash);
  if (!ok) return res.json({ success:false, msg: 'Senha incorreta' });
  req.session.auth = { user: username };
  res.json({ success:true });
});
app.post('/api/logout', (req,res) => { req.session.destroy(()=>res.json({ success:true })); });
app.get('/api/check', (req,res) => res.json({ logged: !!(req.session && req.session.auth) }));

// ------------- PROMO -------------
app.get('/api/promo', (req,res) => res.json(readJson(PROMO_FILE)));
app.post('/api/promo', (req,res) => {
  const body = req.body;
  const old = readJson(PROMO_FILE) || {};
  const merged = Object.assign({}, old, body);
  writeJson(PROMO_FILE, merged);
  io.emit('promo-updated', merged);
  res.json({ success:true, promo: merged });
});

// ------------- CLIENTES (CRM) -------------
app.get('/api/clients', (req,res) => res.json(readJson(CLIENTS_FILE) || []));
app.get('/api/clients/:number', (req,res) => {
  const num = req.params.number;
  const clients = readJson(CLIENTS_FILE) || [];
  const c = clients.find(x => x.numero === num);
  res.json(c || {});
});
app.post('/api/clients', (req,res) => {
  const body = req.body;
  const clients = readJson(CLIENTS_FILE) || [];
  let existing = clients.find(c => c.numero === body.numero);
  if (existing) {
    Object.assign(existing, body, { updatedAt: new Date().toISOString() });
  } else {
    const newc = Object.assign({ createdAt: new Date().toISOString(), pontos: 0, tags: [], historico: [] }, body);
    clients.push(newc);
  }
  writeJson(CLIENTS_FILE, clients);
  io.emit('clients-updated', clients);
  res.json({ success:true });
});
app.put('/api/clients/:number', (req,res) => {
  const num = req.params.number;
  const body = req.body;
  const clients = readJson(CLIENTS_FILE) || [];
  const c = clients.find(x => x.numero === num);
  if (!c) return res.status(404).json({ error: 'not found' });
  Object.assign(c, body, { updatedAt: new Date().toISOString() });
  writeJson(CLIENTS_FILE, clients);
  io.emit('clients-updated', clients);
  res.json({ success:true });
});

// ------------- PEDIDOS (histórico) -------------
app.post('/api/pedidos', (req,res) => {
  const body = req.body; // { numero, nome, pedido, valor, status }
  const pedidos = readJson(ORDERS_FILE) || [];
  const o = Object.assign({ id: Date.now(), createdAt: new Date().toISOString() }, body);
  pedidos.push(o);
  writeJson(ORDERS_FILE, pedidos);
  io.emit('orders-updated', o);
  res.json({ success:true, order: o });
});
app.get('/api/pedidos', (req,res) => res.json(readJson(ORDERS_FILE) || []));
app.get('/api/pedidos/export', (req,res) => {
  const pedidos = readJson(ORDERS_FILE) || [];
  const header = ['id','createdAt','nome','numero','pedido','valor','status'];
  const rows = pedidos.map(p => header.map(h => `"${(p[h]||'').toString().replace(/"/g,'""')}"`).join(','));
  const csv = [header.join(','), ...rows].join('\n');
  res.setHeader('Content-Disposition', 'attachment; filename=pedidos.csv');
  res.setHeader('Content-Type', 'text/csv');
  res.send(csv);
});

// ------------- CAMPANHAS -------------
app.get('/api/campaigns', (req,res) => res.json(readJson(CAMPAIGNS_FILE) || []));
app.post('/api/campaigns', (req,res) => {
  const body = req.body; // { title, message, filter: { minPoints, tag, limit }, directTo (optional) }
  const campaigns = readJson(CAMPAIGNS_FILE) || [];
  const id = Date.now().toString();
  const c = Object.assign({ id, createdAt: new Date().toISOString(), status: 'pending', sent: [] }, body);
  campaigns.push(c);
  writeJson(CAMPAIGNS_FILE, campaigns);
  io.emit('campaigns-updated', campaigns);
  res.json({ success:true, campaign: c });
});
app.post('/api/campaigns/:id/mark', (req,res) => {
  const id = req.params.id;
  const campaigns = readJson(CAMPAIGNS_FILE) || [];
  const c = campaigns.find(x => x.id === id);
  if (!c) return res.status(404).json({ error: 'not found' });
  c.status = req.body.status || c.status;
  writeJson(CAMPAIGNS_FILE, campaigns);
  io.emit('campaigns-updated', campaigns);
  res.json({ success:true });
});

// ------------- QR endpoint -------------
app.get('/api/qrcode', (req,res) => {
  try { const t = fs.readFileSync(QR_FILE, 'utf8'); res.send(t); } catch(e) { res.send(''); }
});

// ------------- notify endpoint (bot -> painel) -------------
app.post('/api/notify', (req,res) => {
  const b = req.body;
  io.emit('bot-event', b);
  res.json({ success:true });
});

// ------------- SOCKET.IO -------------
io.on('connection', socket => {
  console.log('⚡ Socket.IO client connected');
  socket.on('responder', async (payload) => {
    // payload: { numero, mensagem } -> encaminhar para o bot através do endpoint /api/notify
    // o bot (em processo separado) deverá escutar /api/notify ou polling; aqui apenas divulgamos evento para logs/ops
    io.emit('operator-reply', payload);
  });
});

// ------------- HEALTH -------------
app.get('/health', (req,res) => res.send('OK'));

// ------------- START -------------
server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ ChatGohan Server rodando na porta ${PORT}`);
});
