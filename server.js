import express from 'express';
import helmet from 'helmet';
import Database from 'better-sqlite3';
import jwt from 'jsonwebtoken';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

const count = db.prepare('SELECT COUNT(*) AS count FROM menu_items').get().count;
if (!count) {
  const items = [
    ['Morning Glow Bowl','Oats · Fresh Fruits · Nuts & Seeds'],
    ['Bean Vitality Bowl','Steamed Beans · Paneer · Fresh Veggies · Herbs & Dressing'],
    ['Grill Power Bowl','Grilled Chicken or Paneer · Fresh Veggies · Signature Dressing'],
    ['Chicken Crunch Bowl','Grilled Chicken · Crunchy Fresh Veggies · Sweet Corn · Sesame · Signature Dressing'],
    ['Sprout Bowl (Indi Touch)','Sprouts · Dates · Pomegranate · Nuts · Coriander · Indian Masala & Chutney'],
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

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

function auth(req,res,next){
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i,'');
  try { req.admin = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({error:'Unauthorized'}); }
}
function deliveryCharge(area){
  return area === 'pickup' ? 0 : 10;
}

app.get('/api/health',(req,res)=>res.json({ok:true,service:'Bowl Mania API'}));
app.get('/api/menu',(req,res)=>{
  const rows = db.prepare(`SELECT m.id,m.name,m.description,m.image,m.category,p.size,p.price
    FROM menu_items m JOIN prices p ON p.menu_item_id=m.id WHERE m.active=1 ORDER BY m.id,p.id`).all();
  const map = new Map();
  for (const r of rows) {
    if(!map.has(r.id)) map.set(r.id,{id:r.id,name:r.name,description:r.description,image:r.image,category:r.category,prices:[]});
    map.get(r.id).prices.push({size:r.size,price:r.price});
  }
  res.json([...map.values()]);
});

app.post('/api/orders',(req,res)=>{
  const {customerName,phone,area,address,notes='',items} = req.body || {};
  if(!customerName || !phone || !area || !address || !Array.isArray(items) || !items.length)
    return res.status(400).json({error:'Name, phone, area, address and at least one item are required.'});
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
  const result=db.prepare(`INSERT INTO orders(customer_name,phone,area,address,notes,items_json,subtotal,delivery_charge,total) VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(customerName.trim(),phone.trim(),area,address.trim(),String(notes).slice(0,500),JSON.stringify(clean),subtotal,delivery,total);
  res.status(201).json({orderId:result.lastInsertRowid,subtotal,deliveryCharge:delivery,total,status:'new'});
});

app.post('/api/contact',(req,res)=>{
  const {name,phone='',message}=req.body||{};
  if(!name || !message) return res.status(400).json({error:'Name and message are required.'});
  db.prepare('INSERT INTO contacts(name,phone,message) VALUES (?,?,?)').run(String(name).trim(),String(phone).trim(),String(message).trim());
  res.status(201).json({ok:true});
});

app.post('/api/admin/login',(req,res)=>{
  if(req.body?.password !== ADMIN_PASSWORD) return res.status(401).json({error:'Invalid password'});
  res.json({token:jwt.sign({role:'admin'},JWT_SECRET,{expiresIn:'8h'})});
});
app.get('/api/admin/orders',auth,(req,res)=>{
  const rows=db.prepare('SELECT * FROM orders ORDER BY id DESC LIMIT 200').all().map(r=>({...r,items:JSON.parse(r.items_json)}));
  res.json(rows);
});
app.patch('/api/admin/orders/:id',auth,(req,res)=>{
  const allowed=['new','confirmed','preparing','out_for_delivery','completed','cancelled'];
  if(!allowed.includes(req.body?.status)) return res.status(400).json({error:'Invalid status'});
  const r=db.prepare('UPDATE orders SET status=? WHERE id=?').run(req.body.status,Number(req.params.id));
  if(!r.changes) return res.status(404).json({error:'Order not found'});
  res.json({ok:true});
});
app.get('/api/admin/contacts',auth,(req,res)=>res.json(db.prepare('SELECT * FROM contacts ORDER BY id DESC LIMIT 200').all()));

app.get('/admin',(req,res)=>res.sendFile(path.join(__dirname,'public','admin.html')));
app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));

app.listen(PORT,()=>console.log(`Bowl Mania running at http://localhost:${PORT}`));
