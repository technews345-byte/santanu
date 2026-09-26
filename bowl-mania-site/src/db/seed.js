// Idempotent seed: safe to run on every start. Adds reference data only when it is missing.
import { db } from './index.js';
import { config } from '../config.js';
import { hashPassword, strongEnough } from '../services/passwords.js';
import { log } from '../lib/logger.js';

export const PERMISSIONS = [
  ['dashboard.view', 'Dashboard', 'See the dashboard'],
  ['orders.view', 'Orders', 'See orders'],
  ['orders.update', 'Orders', 'Confirm orders and change any status'],
  ['orders.kitchen', 'Orders', 'Move orders to preparing and ready'],
  ['orders.create', 'Orders', 'Create manual orders'],
  ['orders.cancel', 'Orders', 'Cancel orders'],
  ['menu.view', 'Menu', 'See the menu'],
  ['menu.manage', 'Menu', 'Add, edit and delete menu items and categories'],
  ['menu.availability', 'Menu', 'Mark items sold out or available'],
  ['customers.view', 'Customers', 'See customers'],
  ['customers.manage', 'Customers', 'Edit or block customers'],
  ['payments.view', 'Payments', 'See payments'],
  ['payments.refund', 'Payments', 'Issue refunds'],
  ['delivery.view', 'Delivery', 'See the delivery board'],
  ['delivery.manage', 'Delivery', 'Edit delivery areas, fees and hours'],
  ['delivery.assign', 'Delivery', 'Assign delivery staff'],
  ['delivery.update', 'Delivery', 'Update own deliveries'],
  ['promotions.manage', 'Promotions', 'Manage coupons and offers'],
  ['reviews.manage', 'Engagement', 'Approve, hide and feature reviews'],
  ['inquiries.manage', 'Engagement', 'Answer customer inquiries'],
  ['notifications.view', 'Engagement', 'See the notification center'],
  ['media.manage', 'Content', 'Upload and edit gallery media'],
  ['inventory.manage', 'Inventory', 'Track stock'],
  ['analytics.view', 'Reports', 'See analytics'],
  ['reports.export', 'Reports', 'Download reports'],
  ['staff.manage', 'Admin', 'Manage staff accounts'],
  ['settings.manage', 'Admin', 'Change restaurant settings'],
  ['audit.view', 'Admin', 'See the audit log']
];
const ALL = PERMISSIONS.map(p => p[0]);
export const ROLES = [
  ['super_admin', 'Super Admin', 'Full access, including roles and other super admins', 100, ALL],
  ['admin', 'Admin', 'Full access to the restaurant', 80, ALL],
  ['manager', 'Manager', 'Runs daily operations', 60, ALL.filter(p => !['staff.manage', 'settings.manage', 'audit.view', 'payments.refund'].includes(p))],
  ['order_manager', 'Order Manager', 'Handles incoming orders', 40, ['dashboard.view', 'orders.view', 'orders.update', 'orders.kitchen', 'orders.create', 'orders.cancel', 'menu.view', 'menu.availability', 'customers.view', 'payments.view', 'delivery.view', 'delivery.assign', 'inquiries.manage', 'notifications.view']],
  ['kitchen_staff', 'Kitchen Staff', 'Prepares orders', 20, ['orders.view', 'orders.kitchen', 'menu.view', 'menu.availability', 'inventory.manage', 'notifications.view']],
  ['delivery_staff', 'Delivery Staff', 'Delivers orders', 10, ['delivery.update']]
];

const MENU = [
  { cat: 'Morning Bowls', name: 'Morning Glow Bowl', desc: 'Oats · Fresh Fruits · Nuts & Seeds', ingredients: 'Oats, banana, apple, pomegranate, seasonal fruit, nuts, seeds, dates', diet: 'veg', image: 'assets/bowls/morning-glow.jpg', tag: 'Breakfast pick', sizes: [['250 ml', 99], ['500 ml', 149]] },
  { cat: 'Vegetarian Bowls', name: 'Bean Vitality Bowl', desc: 'Steamed Beans · Paneer · Fresh Veggies · Herbs & Dressing', ingredients: 'Kidney beans, paneer, cucumber, carrot, cherry tomato, herbs, dressing', diet: 'veg', image: 'assets/bowls/bean-vitality.jpg', sizes: [['250 ml', 99], ['500 ml', 149]] },
  { cat: 'Protein Bowls', name: 'Grill Power Bowl', desc: 'Grilled Chicken or Paneer · Fresh Veggies · Signature Dressing', ingredients: 'Grilled chicken or paneer, broccoli, chickpeas, cucumber, red cabbage, signature dressing', diet: 'both', image: 'assets/bowls/grill-power.jpg', tag: 'Chicken or paneer', sizes: [['250 ml', 99], ['500 ml', 149]] },
  { cat: 'Chicken Bowls', name: 'Chicken Crunch Bowl', desc: 'Grilled Chicken (Cubes) · Crunchy Fresh Veggies · Sweet Corn · Sesame · Signature Dressing', ingredients: 'Grilled chicken cubes, sweet corn, crunchy vegetables, sesame, signature dressing', diet: 'nonveg', image: 'assets/bowls/chicken-crunch.jpg', sizes: [['250 ml', 99], ['500 ml', 149]] },
  { cat: 'Sprout Bowls', name: 'Sprout Bowl', subtitle: 'Indic Touch', desc: 'Sprouts · Dates · Pomegranate · Nuts · Coriander · Indian Masala & Chutney', ingredients: 'Moong sprouts, dates, pomegranate, nuts, coriander, Indian masala, chutney', diet: 'veg', spicy: 1, image: 'assets/bowls/sprout.jpg', sizes: [['250 ml', 99], ['500 ml', 149]] },
  { cat: 'Protein Bowls', name: 'Super Protein Bowl', desc: 'Chicken + Paneer + Egg + Nuts + Seeds + Fresh Veggies + Dressing', ingredients: 'Grilled chicken, paneer, boiled egg, nuts, seeds, fresh vegetables, dressing', diet: 'nonveg', featured: 1, image: 'assets/bowls/super-protein.jpg', tag: 'High protein', sizes: [['500 ml', 199], ['750 ml', 249]] }
];
const CATEGORIES = ['Morning Bowls', 'Protein Bowls', 'Chicken Bowls', 'Vegetarian Bowls', 'Sprout Bowls', 'Special Bowls'];

// Approximate town-centre coordinates; replace them with each kitchen's exact location in Admin > Delivery areas.
const AREAS = [
  { name: 'Sonari', slug: 'sonari', phone: '8099026415', whatsapp: '918099026415', lat: 27.0333, lng: 95.0167, slots: [['Morning', '07:00', '09:00'], ['Evening', '16:00', '20:00']] },
  { name: 'Nazira', slug: 'nazira', phone: '8720915865', whatsapp: '918720915865', lat: 26.9167, lng: 94.7333, slots: [['Morning', '07:00', '11:00'], ['Evening', '16:00', '20:00']] }
];

export async function seed() {
  const addPerm = db.prepare('INSERT OR IGNORE INTO permissions (key, grp, description) VALUES (?,?,?)');
  PERMISSIONS.forEach(p => addPerm.run(p[0], p[1], p[2]));
  const permId = Object.fromEntries(db.prepare('SELECT key, id FROM permissions').all().map(r => [r.key, r.id]));
  for (const [key, name, description, rank, perms] of ROLES) {
    const exists = db.prepare('SELECT id FROM roles WHERE key=?').get(key);
    if (exists) continue; // keep permission edits made in the admin
    const id = db.prepare('INSERT INTO roles (key, name, description, rank) VALUES (?,?,?,?)').run(key, name, description, rank).lastInsertRowid;
    const link = db.prepare('INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?,?)');
    perms.forEach(p => link.run(id, permId[p]));
  }
  // Super admin always has every permission, including ones added by later releases.
  const sa = db.prepare("SELECT id FROM roles WHERE key='super_admin'").get();
  Object.values(permId).forEach(pid => db.prepare('INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?,?)').run(sa.id, pid));

  if (!db.prepare('SELECT COUNT(*) c FROM categories').get().c) {
    db.transaction(() => {
      const cat = db.prepare('INSERT INTO categories (name, slug, display_order) VALUES (?,?,?)');
      CATEGORIES.forEach((c, i) => cat.run(c, c.toLowerCase().replace(/\s+/g, '-'), i));
      const catId = Object.fromEntries(db.prepare('SELECT name, id FROM categories').all().map(r => [r.name, r.id]));
      const item = db.prepare(`INSERT INTO menu_items (category_id, name, slug, subtitle, description, ingredients, diet, spicy, featured, image, tag, display_order)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
      const size = db.prepare('INSERT INTO menu_item_sizes (menu_item_id, label, price, display_order) VALUES (?,?,?,?)');
      MENU.forEach((m, i) => {
        const id = item.run(catId[m.cat], m.name, m.name.toLowerCase().replace(/\s+/g, '-'), m.subtitle || '', m.desc, m.ingredients, m.diet, m.spicy || 0, m.featured || 0, m.image, m.tag || '', i).lastInsertRowid;
        m.sizes.forEach(([label, price], j) => size.run(id, label, price, j));
      });
    })();
    log.info('seeded menu');
  }
  if (!db.prepare('SELECT COUNT(*) c FROM delivery_areas').get().c) {
    db.transaction(() => {
      AREAS.forEach((a, i) => {
        const id = db.prepare(`INSERT INTO delivery_areas (name, slug, phone, whatsapp, lat, lng, display_order) VALUES (?,?,?,?,?,?,?)`)
          .run(a.name, a.slug, a.phone, a.whatsapp, a.lat, a.lng, i).lastInsertRowid;
        a.slots.forEach(([label, s, e], j) => db.prepare('INSERT INTO delivery_slots (area_id, label, start_time, end_time, display_order) VALUES (?,?,?,?,?)').run(id, label, s, e, j));
      });
    })();
    log.info('seeded delivery areas');
  }

  // First super admin comes from ADMIN_EMAIL / ADMIN_PASSWORD, only while no staff account exists.
  if (!db.prepare('SELECT COUNT(*) c FROM admins').get().c) {
    const { email, password, name } = config.seedAdmin;
    if (email && password) {
      if (!strongEnough(password)) throw new Error('ADMIN_PASSWORD must be at least 10 characters with letters and numbers.');
      db.prepare('INSERT INTO admins (name, email, password_hash, role_id) VALUES (?,?,?,?)').run(name, email, await hashPassword(password), sa.id);
      log.info('created super admin', { email });
    } else {
      log.warn('No staff accounts yet. Set ADMIN_EMAIL and ADMIN_PASSWORD in .env, or run: npm run create-admin');
    }
  }
}
