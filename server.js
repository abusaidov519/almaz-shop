const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;
const ADMIN_USER = process.env.ADMIN_USER;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const SESSION_SECRET = process.env.SESSION_SECRET;
if (!ADMIN_USER || !ADMIN_PASSWORD || !SESSION_SECRET) {
  console.error('ERROR: Set ADMIN_USER, ADMIN_PASSWORD and SESSION_SECRET in .env');
  process.exit(1);
}
app.disable('x-powered-by');
app.use(express.json({ limit: '20kb' }));
app.use(session({
  name: 'muso_admin_session', secret: SESSION_SECRET, resave: false, saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 60 * 60 * 1000 }
}));

const dataDir = path.join(__dirname, 'data');
const dataFile = path.join(dataDir, 'store.json');
const defaultPackages = [
  { id: 1, d: 100, p: 6 }, { id: 2, d: 310, p: 18 }, { id: 3, d: 520, p: 30 },
  { id: 4, d: 1060, p: 58 }, { id: 5, d: 2180, p: 110 }, { id: 6, d: 5600, p: 270 }
];
fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(dataFile)) fs.writeFileSync(dataFile, JSON.stringify({ packages: defaultPackages, orders: [], nextPackageId: 7 }, null, 2));
function readStore() { return JSON.parse(fs.readFileSync(dataFile, 'utf8')); }
function writeStore(data) { fs.writeFileSync(dataFile, JSON.stringify(data, null, 2)); }
function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin === true) return next();
  return res.status(401).json({ error: 'Аввал ба панели админ ворид шавед.' });
}
const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir, { index: 'index.html', dotfiles: 'deny' }));
app.get('/admin', (req, res) => req.session?.isAdmin ? res.sendFile(path.join(publicDir, 'admin.html')) : res.redirect('/admin-login.html'));
app.get('/admin.html', (req, res) => req.session?.isAdmin ? res.sendFile(path.join(publicDir, 'admin.html')) : res.redirect('/admin-login.html'));

app.get('/api/packages', (req, res) => res.json(readStore().packages));
app.post('/api/orders', (req, res) => {
  const { diamonds, playerId, name, contact } = req.body || {};
  if (!Number.isInteger(Number(diamonds)) || !String(playerId || '').trim() || !String(name || '').trim() || !String(contact || '').trim())
    return res.status(400).json({ error: 'Ҳамаи майдонҳоро дуруст пур кунед.' });
  const store = readStore();
  const pack = store.packages.find(x => x.d === Number(diamonds));
  if (!pack) return res.status(400).json({ error: 'Ин баста дигар дастрас нест. Саҳифаро нав кунед.' });
  const order = { id: Date.now(), diamonds: pack.d, price: pack.p, playerId: String(playerId).trim().slice(0,40), name: String(name).trim().slice(0,80), contact: String(contact).trim().slice(0,100), status: 'Нав', created: new Date().toLocaleString('tg-TJ') };
  store.orders.push(order); writeStore(store);
  res.json({ ok: true, message: 'Фармоиши шумо қабул шуд.' });
});
app.post('/api/login', (req, res, next) => {
  const { username, password } = req.body || {};
  if (typeof username !== 'string' || typeof password !== 'string' || username !== ADMIN_USER || password !== ADMIN_PASSWORD)
    return res.status(401).json({ error: 'Логин ё парол нодуруст аст.' });
  req.session.regenerate(err => { if (err) return next(err); req.session.isAdmin = true; req.session.save(err2 => { if (err2) return next(err2); res.json({ ok: true }); }); });
});
app.post('/api/logout', (req, res) => req.session.destroy(() => { res.clearCookie('muso_admin_session'); res.json({ ok: true }); }));
app.get('/api/admin/orders', requireAdmin, (req, res) => res.json(readStore().orders));
app.post('/api/admin/packages', requireAdmin, (req, res) => {
  const d = Number(req.body?.d), p = Number(req.body?.p);
  if (!Number.isInteger(d) || d < 1 || !Number.isFinite(p) || p < 1) return res.status(400).json({ error: 'Миқдор ва нарх нодуруст аст.' });
  const store = readStore();
  if (store.packages.some(x => x.d === d)) return res.status(409).json({ error: 'Ин баста аллакай ҳаст. Барои тағйири нарх тугмаи Сабтро истифода баред.' });
  store.packages.push({ id: store.nextPackageId++, d, p }); writeStore(store); res.json(store.packages);
});
app.put('/api/admin/packages/:id', requireAdmin, (req, res) => {
  const p = Number(req.body?.p); const id = Number(req.params.id);
  if (!Number.isFinite(p) || p < 1) return res.status(400).json({ error: 'Нарх нодуруст аст.' });
  const store = readStore(); const pack = store.packages.find(x => x.id === id);
  if (!pack) return res.status(404).json({ error: 'Баста ёфт нашуд.' });
  pack.p = p; writeStore(store); res.json(store.packages);
});
app.delete('/api/admin/packages/:id', requireAdmin, (req, res) => {
  const store = readStore(); store.packages = store.packages.filter(x => x.id !== Number(req.params.id)); writeStore(store); res.json(store.packages);
});
app.patch('/api/admin/orders/:id', requireAdmin, (req, res) => {
  const allowed = ['Нав', 'Тасдиқ шуд', 'Иҷро шуд']; if (!allowed.includes(req.body?.status)) return res.status(400).json({ error: 'Ҳолат нодуруст аст.' });
  const store = readStore(); const order = store.orders.find(x => x.id === Number(req.params.id));
  if (!order) return res.status(404).json({ error: 'Фармоиш ёфт нашуд.' });
  order.status = req.body.status; writeStore(store); res.json(store.orders);
});
app.delete('/api/admin/orders/:id', requireAdmin, (req, res) => {
  const store = readStore(); store.orders = store.orders.filter(x => x.id !== Number(req.params.id)); writeStore(store); res.json(store.orders);
});
app.listen(PORT, () => console.log(`ALMAZ SHOP is running at http://localhost:${PORT}`));
