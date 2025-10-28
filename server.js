
// server.js - Painel Gohan com login e promo (creates user.json from .env if missing)
const express = require('express');
const fs = require('fs');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const PROMO_FILE = path.join(DATA_DIR, 'promo.json');
const USER_FILE = path.join(DATA_DIR, 'user.json');
const QR_FILE = path.join(__dirname, 'public', 'qr.txt');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(PROMO_FILE)) fs.writeFileSync(PROMO_FILE, JSON.stringify({texto:"🔥 *Promoção do Dia:*\\nCompre 1 Temaki e leve um Suco Natural grátis 🍹\\nVálido até as 23h!", linkCardapio:"https://pedido.anota.ai/"}, null, 2));

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

app.use(session({
  secret: process.env.SESSION_SECRET || 'keyboardcat',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false }
}));

// create user.json if missing using ADMIN_USER and ADMIN_PASS from .env
if (!fs.existsSync(USER_FILE)) {
  const adminUser = process.env.ADMIN_USER || 'admin';
  const adminPass = process.env.ADMIN_PASS || 'goshui2443';
  const hash = bcrypt.hashSync(adminPass, 10);
  fs.writeFileSync(USER_FILE, JSON.stringify({username: adminUser, password_hash: hash}, null, 2));
  console.log('User file created for', adminUser);
}

function readJSON(p){ return JSON.parse(fs.readFileSync(p,'utf8')); }

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const user = readJSON(USER_FILE);
  if (username !== user.username) return res.json({ success:false, msg:'Usuário inválido' });
  const match = bcrypt.compareSync(password, user.password_hash);
  if (!match) return res.json({ success:false, msg:'Senha incorreta' });
  req.session.auth = { user: username };
  return res.json({ success:true });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(()=>{ res.json({success:true}); });
});

app.get('/api/check', (req, res) => {
  res.json({ logged: !!(req.session && req.session.auth) });
});

app.get('/api/promo', (req, res) => {
  try {
    const raw = fs.readFileSync(PROMO_FILE,'utf8');
    res.json(JSON.parse(raw));
  } catch(e){ res.json({}); }
});

app.post('/api/promo', (req, res) => {
  const body = req.body;
  const old = JSON.parse(fs.readFileSync(PROMO_FILE,'utf8'));
  const updated = Object.assign({}, old, body);
  fs.writeFileSync(PROMO_FILE, JSON.stringify(updated, null, 2), 'utf8');
  res.json({ success:true });
});

app.get('/api/qrcode', (req, res) => {
  try { const t = fs.readFileSync(QR_FILE,'utf8'); res.send(t); } catch(e){ res.send(''); }
});

app.listen(PORT, '0.0.0.0', ()=>console.log(`✅ Servidor rodando na porta ${PORT}`));
