import { db, json } from '../db/index.js';

const sizesStmt = () => db.prepare('SELECT id, label, price, display_order, active FROM menu_item_sizes WHERE menu_item_id=? ORDER BY display_order, id');
export function hydrate(item, { adminView = false } = {}) {
  if (!item) return null;
  const sizes = sizesStmt().all(item.id).filter(s => adminView || s.active);
  return {
    ...item, nutrition: json(item.nutrition, {}), featured: !!item.featured, available: !!item.available, active: !!item.active,
    sizes: sizes.map(s => ({ ...s, active: !!s.active })),
    images: db.prepare('SELECT id, url FROM menu_item_images WHERE menu_item_id=? ORDER BY display_order, id').all(item.id)
  };
}

/** Customer-facing menu: enabled items in enabled categories, sold-out items included with available=false. */
export function publicMenu() {
  const cats = db.prepare('SELECT id, name, slug, description, image, display_order FROM categories WHERE active=1 ORDER BY display_order, id').all();
  const items = db.prepare(`SELECT m.* FROM menu_items m LEFT JOIN categories c ON c.id=m.category_id
    WHERE m.active=1 AND (m.category_id IS NULL OR c.active=1) ORDER BY m.display_order, m.id`).all()
    .map(i => hydrate(i)).filter(i => i.sizes.length)
    .map(({ active, created_at, updated_at, ...i }) => i);
  return { categories: cats.filter(c => items.some(i => i.category_id === c.id)), items };
}
