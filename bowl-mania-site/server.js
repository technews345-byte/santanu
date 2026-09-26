import express from 'express';
import helmet from 'helmet';
import Database from 'better-sqlite3';
import jwt from 'jsonwebtoken';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { timingSafeEqual, createHash } from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 3000);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'change-this-password';
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret-before-production';

const db = new Database(path.join(__dirname, 'bowl-mania.db'));
db.pragma('journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS menu_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  image TEXT DEFAULT 'assets/menu-poster.jpeg',
  category TEXT DEFAULT 'Bowl',
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS prices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  menu_item_id INTEGER NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  size TEXT NOT NULL,
  price INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  area TEXT NOT NULL,
  address TEXT NOT NULL,
  notes TEXT DEFAULT '',
  items_json TEXT NOT NULL,
  subtotal INTEGER NOT NULL,
  delivery_charge INTEGER NOT NULL,
  total INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT,
  message TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);`);

// Migration: dietary marker for the veg / non-veg symbol shown on the menu.
const cols = db.prepare('PRAGMA table_info(menu_items)').all().map(c => c.name);
if (!cols.includes('diet')) db.exec(`ALTER TABLE menu_items ADD COLUMN diet TEXT DEFAULT 'veg'`);

// Migration: delivery partners and order tracking.
db.exec(`CREATE TABLE IF NOT EXISTS riders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  area TEXT NOT NULL DEFAULT 'sonari',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
)`);
const orderCols = db.prepare('PRAGMA table_info(orders)').all().map(c => c.name);
if (!orderCols.includes('rider_id')) db.exec('ALTER TABLE orders ADD COLUMN rider_id INTEGER');
if (!orderCols.includes('status_history')) db.exec(`ALTER TABLE orders ADD COLUMN status_history TEXT DEFAULT '[]'`);

const count = db.prepare('SELECT COUNT(*) AS count FROM menu_items').get().count;
if (!count) {
  const items = [
    ['Morning Glow Bowl','Oats · Fresh Fruits · Nuts & Seeds'],
    ['Bean Vitality Bowl','Steamed Beans · Paneer · Fresh Veggies · Herbs & Dressing'],
    ['Grill Power Bowl','Grilled Chicken or Paneer · Fresh Veggies · Signature Dressing'],
    ['Chicken Crunch Bowl','Grilled Chicken · Crunchy Fresh Veggies · Sweet Corn · Sesame · Signature Dressing'],
    ['Sprout Bowl (Indic Touch)','Sprouts · Dates · Pomegranate · Nuts · Coriander · Indian Masala & Chutney'],
    ['Super Protein Bowl','Chicken + Paneer + Egg + Nuts & Seeds + Fresh Veggies + Dressing']
  ];
  const add = db.prepare('INSERT INTO menu_items (name,description) VALUES (?,?)');
  const price = db.prepare('INSERT INTO prices (menu_item_id,size,price) VALUES (?,?,?)');
  const seed = db.transaction(() => {
    items.forEach((x,i) => {
      const r = add.run(...x);
      const sizes = i === 5 ? [['500 ml',199],['750 ml',249]] : [['250 ml',99],['500 ml',149]];
      sizes.forEach(s => price.run(r.lastInsertRowid, ...s));
    });
  });
  seed();
}

// Per-bowl photography and diet markers (also upgrades databases seeded by older versions).
const bowlDetails = [
  ['Morning Glow Bowl', 'assets/bowls/morning-glow.jpg', 'veg'],
  ['Bean Vitality Bowl', 'assets/bowls/bean-vitality.jpg', 'veg'],
  ['Grill Power Bowl', 'assets/bowls/grill-power.jpg', 'both'],
  ['Chicken Crunch Bowl', 'assets/bowls/chicken-crunch.jpg', 'nonveg'],
  ['Sprout Bowl (Indic Touch)', 'assets/bowls/sprout.jpg', 'veg'],
  ['Super Protein Bowl', 'assets/bowls/super-protein.jpg', 'nonveg']
];
db.prepare(`UPDATE menu_items SET name='Sprout Bowl (Indic Touch)' WHERE name='Sprout Bowl (Indi Touch)'`).run();
const setDetails = db.prepare(`UPDATE menu_items SET image=?, diet=? WHERE name=? AND image='assets/menu-poster.jpeg'`);
for (const [name, image, diet] of bowlDetails) setDetails.run(image, diet, name);

if (!process.env.ADMIN_PASSWORD || !process.env.JWT_SECRET)
  console.warn('⚠  ADMIN_PASSWORD / JWT_SECRET are not set — using insecure defaults. Set them in .env before going live.');

app.use(helmet({
  crossOriginResourcePolicy: false,
  contentSecurityPolicy: {
    directives: {
      'style-src': ["'self'", 'https://fonts.googleapis.com', "'unsafe-inline'"],
      'font-src': ["'self'", 'https://fonts.gstatic.com']
    }
  }
}));
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

function auth(req,res,next){
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i,'');
  try { req.admin = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({error:'Unauthorized'}); }
}
// Base charge (within 1.5 km). The final amount for longer distances is confirmed on the phone call.
function deliveryCharge(area){
  return area === 'pickup' ? 0 : 10;
}
const AREAS = ['sonari','nazira','pickup'];

app.get('/api/health',(req,res)=>res.json({ok:true,service:'Bowl Mania API'}));
function menuItems(includeHidden=false){
  const rows = db.prepare(`SELECT m.id,m.name,m.description,m.image,m.category,m.diet,m.active,p.size,p.price
    FROM menu_items m LEFT JOIN prices p ON p.menu_item_id=m.id ${includeHidden ? '' : 'WHERE m.active=1'} ORDER BY m.id,p.id`).all();
  const map = new Map();
  for (const r of rows) {
    if(!map.has(r.id)) map.set(r.id,{id:r.id,name:r.name,description:r.description,image:r.image,category:r.category,diet:r.diet,active:!!r.active,prices:[]});
    if(r.size) map.get(r.id).prices.push({size:r.size,price:r.price});
  }
  return [...map.values()].filter(m => includeHidden || m.prices.length);
}
app.get('/api/menu',(req,res)=>res.json(menuItems().map(({active,...m})=>m)));

app.post('/api/orders',(req,res)=>{
  const {customerName,phone,area,address,notes='',items} = req.body || {};
  if(!customerName || !phone || !area || !address || !Array.isArray(items) || !items.length)
    return res.status(400).json({error:'Name, phone, area, address and at least one item are required.'});
  if(!AREAS.includes(area)) return res.status(400).json({error:'Please choose Sonari, Nazira or self pickup.'});
  if(!/^[+\d][\d\s-]{7,15}$/.test(String(phone).trim())) return res.status(400).json({error:'Please enter a valid phone number.'});
  if(items.length > 30) return res.status(400).json({error:'Too many items in one order.'});
  const clean=[]; let subtotal=0;
  for(const item of items){
    const id=Number(item.menuItemId), qty=Math.max(1,Math.min(20,Number(item.quantity)||1));
    const row=db.prepare(`SELECT m.name,p.size,p.price FROM menu_items m JOIN prices p ON p.menu_item_id=m.id WHERE m.id=? AND p.size=? AND m.active=1`).get(id,String(item.size));
    if(!row) return res.status(400).json({error:'One of the selected menu items is no longer available.'});
    subtotal += row.price*qty;
    clean.push({menuItemId:id,name:row.name,size:row.size,price:row.price,quantity:qty});
  }
  const delivery = deliveryCharge(area);
  const total=subtotal+delivery;
  const result=db.prepare(`INSERT INTO orders(customer_name,phone,area,address,notes,items_json,subtotal,delivery_charge,total,status_history) VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run(String(customerName).trim().slice(0,80),String(phone).trim(),area,String(address).trim().slice(0,500),String(notes).slice(0,500),JSON.stringify(clean),subtotal,delivery,total,JSON.stringify([{status:'new',at:new Date().toISOString()}]));
  res.status(201).json({orderId:result.lastInsertRowid,subtotal,deliveryCharge:delivery,total,status:'new'});
});

app.post('/api/contact',(req,res)=>{
  const {name,phone='',message}=req.body||{};
  if(!name || !message) return res.status(400).json({error:'Name and message are required.'});
  db.prepare('INSERT INTO contacts(name,phone,message) VALUES (?,?,?)').run(String(name).trim(),String(phone).trim(),String(message).trim());
  res.status(201).json({ok:true});
});

// Simple brute-force protection: 10 failed attempts per IP per 15 minutes.
const failedLogins = new Map();
const digest = v => createHash('sha256').update(String(v)).digest();
app.post('/api/admin/login',(req,res)=>{
  const now = Date.now(), key = req.ip;
  const rec = failedLogins.get(key);
  if(rec && rec.until > now && rec.count >= 10) return res.status(429).json({error:'Too many attempts. Try again in 15 minutes.'});
  if(!timingSafeEqual(digest(req.body?.password ?? ''), digest(ADMIN_PASSWORD))){
    const r = rec && rec.until > now ? rec : {count:0, until:now + 15*60*1000};
    r.count++; failedLogins.set(key, r);
    return res.status(401).json({error:'Wrong password'});
  }
  failedLogins.delete(key);
  res.json({token:jwt.sign({role:'admin'},JWT_SECRET,{expiresIn:'12h'})});
});

// Menu management
const DIETS = ['veg','nonveg','both'];
function readItem(body){
  const b = body || {};
  const name = String(b.name || '').trim().slice(0,80);
  const description = String(b.description || '').trim().slice(0,300);
  const image = String(b.image || 'assets/menu-poster.jpeg').trim().slice(0,500);
  const diet = DIETS.includes(b.diet) ? b.diet : 'veg';
  const prices = Array.isArray(b.prices) ? b.prices
    .map(p => ({size:String(p.size || '').trim().slice(0,30), price:Math.round(Number(p.price))}))
    .filter(p => p.size && Number.isFinite(p.price) && p.price > 0 && p.price < 100000) : [];
  if(!name) return {error:'Give the bowl a name.'};
  if(!prices.length) return {error:'Add at least one size with a price.'};
  if(!/^(assets\/|https:\/\/)/.test(image)) return {error:'Photo must be one of the site photos or an https:// link.'};
  return {name, description, image, diet, active: b.active === false ? 0 : 1, prices};
}
const insertPrice = db.prepare('INSERT INTO prices (menu_item_id,size,price) VALUES (?,?,?)');
const saveItem = db.transaction((id, it) => {
  if(id == null) id = db.prepare('INSERT INTO menu_items (name,description,image,diet,active) VALUES (?,?,?,?,?)').run(it.name,it.description,it.image,it.diet,it.active).lastInsertRowid;
  else db.prepare('UPDATE menu_items SET name=?,description=?,image=?,diet=?,active=? WHERE id=?').run(it.name,it.description,it.image,it.diet,it.active,id);
  db.prepare('DELETE FROM prices WHERE menu_item_id=?').run(id);
  it.prices.forEach(p => insertPrice.run(id,p.size,p.price));
  return Number(id);
});
app.get('/api/admin/menu',auth,(req,res)=>res.json(menuItems(true)));
app.post('/api/admin/menu',auth,(req,res)=>{
  const it = readItem(req.body); if(it.error) return res.status(400).json(it);
  res.status(201).json({id:saveItem(null,it)});
});
app.put('/api/admin/menu/:id',auth,(req,res)=>{
  const id = Number(req.params.id);
  if(!db.prepare('SELECT 1 FROM menu_items WHERE id=?').get(id)) return res.status(404).json({error:'Bowl not found'});
  const it = readItem(req.body); if(it.error) return res.status(400).json(it);
  saveItem(id,it); res.json({id});
});
app.delete('/api/admin/menu/:id',auth,(req,res)=>{
  const id = Number(req.params.id);
  db.transaction(()=>{ db.prepare('DELETE FROM prices WHERE menu_item_id=?').run(id); db.prepare('DELETE FROM menu_items WHERE id=?').run(id); })();
  res.json({ok:true});
});
app.get('/api/admin/orders',auth,(req,res)=>{
  const rows=db.prepare(`SELECT o.*, r.name AS rider_name, r.phone AS rider_phone FROM orders o
    LEFT JOIN riders r ON r.id=o.rider_id ORDER BY o.id DESC LIMIT 300`).all()
    .map(({items_json,status_history,...r})=>({...r,items:JSON.parse(items_json),history:JSON.parse(status_history||'[]')}));
  res.json(rows);
});
app.patch('/api/admin/orders/:id',auth,(req,res)=>{
  const allowed=['new','confirmed','preparing','out_for_delivery','completed','cancelled'];
  if(!allowed.includes(req.body?.status)) return res.status(400).json({error:'Invalid status'});
  const row=db.prepare('SELECT status_history FROM orders WHERE id=?').get(Number(req.params.id));
  if(!row) return res.status(404).json({error:'Order not found'});
  const history=[...JSON.parse(row.status_history||'[]'),{status:req.body.status,at:new Date().toISOString()}];
  db.prepare('UPDATE orders SET status=?, status_history=? WHERE id=?').run(req.body.status,JSON.stringify(history),Number(req.params.id));
  res.json({ok:true});
});
// Delivery partners
function readRider(b={}){
  const name=String(b.name||'').trim().slice(0,60);
  const phone=String(b.phone||'').trim();
  const area=['sonari','nazira'].includes(b.area)?b.area:'sonari';
  if(!name) return {error:'Enter the delivery partner\'s name.'};
  if(!/^[+\d][\d\s-]{7,15}$/.test(phone)) return {error:'Enter a valid phone number.'};
  return {name,phone,area,active:b.active===false?0:1};
}
app.get('/api/admin/riders',auth,(req,res)=>res.json(db.prepare('SELECT * FROM riders ORDER BY active DESC, name').all().map(r=>({...r,active:!!r.active}))));
app.post('/api/admin/riders',auth,(req,res)=>{
  const r=readRider(req.body); if(r.error) return res.status(400).json(r);
  res.status(201).json({id:Number(db.prepare('INSERT INTO riders(name,phone,area,active) VALUES (?,?,?,?)').run(r.name,r.phone,r.area,r.active).lastInsertRowid)});
});
app.put('/api/admin/riders/:id',auth,(req,res)=>{
  const r=readRider(req.body); if(r.error) return res.status(400).json(r);
  const x=db.prepare('UPDATE riders SET name=?,phone=?,area=?,active=? WHERE id=?').run(r.name,r.phone,r.area,r.active,Number(req.params.id));
  if(!x.changes) return res.status(404).json({error:'Delivery partner not found'});
  res.json({ok:true});
});
app.delete('/api/admin/riders/:id',auth,(req,res)=>{
  const id=Number(req.params.id);
  db.transaction(()=>{ db.prepare('UPDATE orders SET rider_id=NULL WHERE rider_id=? AND status NOT IN (\'completed\',\'cancelled\')').run(id); db.prepare('DELETE FROM riders WHERE id=?').run(id); })();
  res.json({ok:true});
});
app.patch('/api/admin/orders/:id/rider',auth,(req,res)=>{
  const riderId=req.body?.riderId==null||req.body.riderId===''?null:Number(req.body.riderId);
  if(riderId!=null && !db.prepare('SELECT 1 FROM riders WHERE id=?').get(riderId)) return res.status(400).json({error:'Delivery partner not found'});
  const r=db.prepare('UPDATE orders SET rider_id=? WHERE id=?').run(riderId,Number(req.params.id));
  if(!r.changes) return res.status(404).json({error:'Order not found'});
  res.json({ok:true});
});

// Public order tracking: needs the order number AND the phone used to order.
const trackHits=new Map();
app.get('/api/track',(req,res)=>{
  const now=Date.now(), h=trackHits.get(req.ip)||{n:0,until:now+60000};
  if(h.until<now){h.n=0;h.until=now+60000;}
  if(++h.n>30){trackHits.set(req.ip,h);return res.status(429).json({error:'Too many requests. Wait a minute and try again.'});}
  trackHits.set(req.ip,h);
  const id=Number(String(req.query.order||'').replace(/\D/g,''));
  const digits=String(req.query.phone||'').replace(/\D/g,'').slice(-10);
  const o=id&&digits.length===10?db.prepare(`SELECT o.*, r.name AS rider_name, r.phone AS rider_phone FROM orders o LEFT JOIN riders r ON r.id=o.rider_id WHERE o.id=?`).get(id):null;
  if(!o||String(o.phone).replace(/\D/g,'').slice(-10)!==digits) return res.status(404).json({error:'No order found with that number and phone. Check both and try again.'});
  const showRider=o.status==='out_for_delivery'&&o.rider_name;
  res.json({
    id:o.id,status:o.status,area:o.area,created_at:o.created_at,total:o.total,
    items:JSON.parse(o.items_json).map(i=>({name:i.name,size:i.size,quantity:i.quantity})),
    history:JSON.parse(o.status_history||'[]'),
    rider:showRider?{name:o.rider_name,phone:o.rider_phone}:null
  });
});

app.get('/api/admin/contacts',auth,(req,res)=>res.json(db.prepare('SELECT * FROM contacts ORDER BY id DESC LIMIT 200').all()));

app.get('/admin',(req,res)=>res.sendFile(path.join(__dirname,'public','admin.html')));
app.get('/{*splat}',(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));

app.listen(PORT,()=>console.log(`Bowl Mania running at http://localhost:${PORT}`));
