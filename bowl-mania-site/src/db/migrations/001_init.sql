-- Bowl Mania schema v1. Money is stored in whole rupees (INTEGER); Razorpay amounts are converted to paise at the API edge.

-- ---------- Staff, roles, permissions ----------
CREATE TABLE roles (
  id INTEGER PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  rank INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE permissions (
  id INTEGER PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  grp TEXT NOT NULL,
  description TEXT NOT NULL
);
CREATE TABLE role_permissions (
  role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);
CREATE TABLE admins (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  phone TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  role_id INTEGER NOT NULL REFERENCES roles(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  last_login_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE admin_sessions (
  id INTEGER PRIMARY KEY,
  admin_id INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  user_agent TEXT NOT NULL DEFAULT '',
  ip TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at TEXT,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);
CREATE INDEX idx_sessions_admin ON admin_sessions(admin_id);
CREATE TABLE password_resets (
  id INTEGER PRIMARY KEY,
  admin_id INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE audit_logs (
  id INTEGER PRIMARY KEY,
  admin_id INTEGER REFERENCES admins(id) ON DELETE SET NULL,
  admin_name TEXT NOT NULL DEFAULT 'System',
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT,
  summary TEXT NOT NULL DEFAULT '',
  old_value TEXT,
  new_value TEXT,
  ip TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_audit_created ON audit_logs(created_at);
CREATE INDEX idx_audit_entity ON audit_logs(entity, entity_id);

-- ---------- Delivery areas & hours ----------
CREATE TABLE delivery_areas (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  address TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  whatsapp TEXT NOT NULL DEFAULT '',
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  max_radius_km REAL NOT NULL DEFAULT 6,
  base_distance_km REAL NOT NULL DEFAULT 1.5,
  base_charge INTEGER NOT NULL DEFAULT 10,
  extra_distance_km REAL NOT NULL DEFAULT 1.5,
  extra_charge INTEGER NOT NULL DEFAULT 10,
  delivery_enabled INTEGER NOT NULL DEFAULT 1,
  pickup_enabled INTEGER NOT NULL DEFAULT 1,
  active INTEGER NOT NULL DEFAULT 1,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE delivery_slots (
  id INTEGER PRIMARY KEY,
  area_id INTEGER NOT NULL REFERENCES delivery_areas(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  days TEXT NOT NULL DEFAULT '0123456',   -- days of week the slot runs, 0 = Sunday
  start_time TEXT NOT NULL,               -- HH:MM, restaurant local time
  end_time TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  display_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_slots_area ON delivery_slots(area_id);
CREATE TABLE holidays (
  id INTEGER PRIMARY KEY,
  area_id INTEGER REFERENCES delivery_areas(id) ON DELETE CASCADE,  -- NULL = every location
  date TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT ''
);
CREATE INDEX idx_holidays_date ON holidays(date);
CREATE TABLE special_hours (
  id INTEGER PRIMARY KEY,
  area_id INTEGER REFERENCES delivery_areas(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT ''
);
CREATE INDEX idx_special_date ON special_hours(date);

-- ---------- Customers ----------
CREATE TABLE customers (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,              -- normalised 10-digit Indian mobile
  email TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','blocked')),
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE customer_addresses (
  id INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  address TEXT NOT NULL,
  landmark TEXT NOT NULL DEFAULT '',
  lat REAL,
  lng REAL,
  area_id INTEGER REFERENCES delivery_areas(id) ON DELETE SET NULL,
  last_used_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_addresses_customer ON customer_addresses(customer_id);

-- ---------- Media ----------
CREATE TABLE media (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('image','video')),
  title TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'food',
  url TEXT NOT NULL,
  thumb_url TEXT NOT NULL DEFAULT '',
  mime TEXT NOT NULL DEFAULT '',
  size_bytes INTEGER NOT NULL DEFAULT 0,
  width INTEGER,
  height INTEGER,
  display_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ---------- Menu ----------
CREATE TABLE categories (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  image TEXT NOT NULL DEFAULT '',
  display_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE menu_items (
  id INTEGER PRIMARY KEY,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  subtitle TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  ingredients TEXT NOT NULL DEFAULT '',
  nutrition TEXT NOT NULL DEFAULT '{}',   -- JSON: calories, protein_g, carbs_g, fat_g, fibre_g
  diet TEXT NOT NULL DEFAULT 'veg' CHECK (diet IN ('veg','egg','nonveg','both')),
  spicy INTEGER NOT NULL DEFAULT 0 CHECK (spicy BETWEEN 0 AND 3),
  featured INTEGER NOT NULL DEFAULT 0,
  available INTEGER NOT NULL DEFAULT 1,   -- 0 = sold out (still listed)
  active INTEGER NOT NULL DEFAULT 1,      -- 0 = hidden from the website
  display_order INTEGER NOT NULL DEFAULT 0,
  image TEXT NOT NULL DEFAULT '',
  tag TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_menu_category ON menu_items(category_id);
CREATE TABLE menu_item_sizes (
  id INTEGER PRIMARY KEY,
  menu_item_id INTEGER NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  price INTEGER NOT NULL CHECK (price >= 0),
  display_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX idx_sizes_item ON menu_item_sizes(menu_item_id);
CREATE TABLE menu_item_images (
  id INTEGER PRIMARY KEY,
  menu_item_id INTEGER NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0
);

-- ---------- Promotions ----------
CREATE TABLE coupons (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE COLLATE NOCASE,
  description TEXT NOT NULL DEFAULT '',
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percent','fixed')),
  value INTEGER NOT NULL CHECK (value > 0),
  min_order INTEGER NOT NULL DEFAULT 0,
  max_discount INTEGER,
  starts_at TEXT,
  expires_at TEXT,
  usage_limit INTEGER,
  per_customer_limit INTEGER,
  category_ids TEXT NOT NULL DEFAULT '[]',
  item_ids TEXT NOT NULL DEFAULT '[]',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE offers (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL CHECK (type IN ('percent','flat','free_delivery','bogo','combo')),
  value INTEGER NOT NULL DEFAULT 0,       -- percent, rupees off, or combo saving
  min_order INTEGER NOT NULL DEFAULT 0,
  max_discount INTEGER,
  item_ids TEXT NOT NULL DEFAULT '[]',    -- bogo: eligible items; combo: required items
  category_ids TEXT NOT NULL DEFAULT '[]',
  starts_at TEXT,
  ends_at TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  display_order INTEGER NOT NULL DEFAULT 0,
  image TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ---------- Orders ----------
CREATE TABLE orders (
  id INTEGER PRIMARY KEY,
  order_number TEXT NOT NULL UNIQUE,
  tracking_token TEXT NOT NULL UNIQUE,
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_email TEXT NOT NULL DEFAULT '',
  fulfilment TEXT NOT NULL CHECK (fulfilment IN ('delivery','pickup')),
  area_id INTEGER REFERENCES delivery_areas(id) ON DELETE SET NULL,
  address TEXT NOT NULL DEFAULT '',
  landmark TEXT NOT NULL DEFAULT '',
  lat REAL,
  lng REAL,
  distance_km REAL,
  slot_date TEXT,
  slot_label TEXT NOT NULL DEFAULT '',
  slot_start TEXT,
  slot_end TEXT,
  subtotal INTEGER NOT NULL,
  offer_id INTEGER REFERENCES offers(id) ON DELETE SET NULL,
  offer_title TEXT NOT NULL DEFAULT '',
  offer_discount INTEGER NOT NULL DEFAULT 0,
  coupon_id INTEGER REFERENCES coupons(id) ON DELETE SET NULL,
  coupon_code TEXT NOT NULL DEFAULT '',
  coupon_discount INTEGER NOT NULL DEFAULT 0,
  discount INTEGER NOT NULL DEFAULT 0,
  delivery_fee INTEGER NOT NULL DEFAULT 0,
  tax INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('online','cod')),
  payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('created','pending','paid','failed','refunded','partially_refunded')),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','confirmed','accepted','preparing','ready','out_for_delivery','delivered','completed','cancelled','refunded')),
  notes TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'website' CHECK (source IN ('website','admin')),
  created_by INTEGER REFERENCES admins(id) ON DELETE SET NULL,
  estimated_at TEXT,
  placed_at TEXT,                          -- set when a COD order is created or online payment succeeds
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_orders_created ON orders(created_at);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_payment ON orders(payment_status);
CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_orders_area ON orders(area_id);
CREATE TABLE order_items (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id INTEGER REFERENCES menu_items(id) ON DELETE SET NULL,
  size_id INTEGER REFERENCES menu_item_sizes(id) ON DELETE SET NULL,
  category_id INTEGER,
  name TEXT NOT NULL,
  size_label TEXT NOT NULL,
  unit_price INTEGER NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  line_total INTEGER NOT NULL
);
CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_order_items_item ON order_items(menu_item_id);
CREATE TABLE order_status_history (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  admin_id INTEGER REFERENCES admins(id) ON DELETE SET NULL,
  admin_name TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_history_order ON order_status_history(order_id);
CREATE TABLE coupon_usage (
  id INTEGER PRIMARY KEY,
  coupon_id INTEGER NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
  order_id INTEGER NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  discount INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_coupon_usage_coupon ON coupon_usage(coupon_id);

-- ---------- Payments ----------
CREATE TABLE payments (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('razorpay','cod')),
  method TEXT NOT NULL DEFAULT '',
  razorpay_order_id TEXT UNIQUE,
  razorpay_payment_id TEXT UNIQUE,
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created','pending','paid','failed','refunded','partially_refunded')),
  refunded_amount INTEGER NOT NULL DEFAULT 0,
  error TEXT NOT NULL DEFAULT '',
  paid_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_payments_order ON payments(order_id);
CREATE INDEX idx_payments_created ON payments(created_at);
CREATE TABLE refunds (
  id INTEGER PRIMARY KEY,
  payment_id INTEGER NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  razorpay_refund_id TEXT UNIQUE,
  amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processed','failed')),
  reason TEXT NOT NULL DEFAULT '',
  admin_id INTEGER REFERENCES admins(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE webhook_events (
  id INTEGER PRIMARY KEY,
  provider TEXT NOT NULL,
  event_id TEXT NOT NULL,
  event TEXT NOT NULL,
  payload TEXT NOT NULL,
  processed_at TEXT,
  error TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (provider, event_id)
);

-- ---------- Delivery ----------
CREATE TABLE delivery_assignments (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  staff_id INTEGER NOT NULL REFERENCES admins(id),
  status TEXT NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned','picked_up','out_for_delivery','delivered')),
  assigned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  picked_up_at TEXT,
  delivered_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_assign_staff ON delivery_assignments(staff_id);

-- ---------- Feedback & inquiries ----------
CREATE TABLE reviews (
  id INTEGER PRIMARY KEY,
  order_id INTEGER UNIQUE REFERENCES orders(id) ON DELETE SET NULL,
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','hidden')),
  featured INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE inquiries (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','in_progress','resolved')),
  reply TEXT NOT NULL DEFAULT '',
  replied_at TEXT,
  admin_id INTEGER REFERENCES admins(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ---------- Notifications ----------
CREATE TABLE notifications (
  id INTEGER PRIMARY KEY,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  link TEXT NOT NULL DEFAULT '',
  permission TEXT NOT NULL DEFAULT 'notifications.view',
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_notifications_created ON notifications(created_at);
CREATE TABLE notification_logs (
  id INTEGER PRIMARY KEY,
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp','email')),
  event TEXT NOT NULL,
  recipient TEXT NOT NULL,
  order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  body TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('queued','sent','delivered','read','failed','skipped')),
  provider_message_id TEXT UNIQUE,
  error TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_notif_logs_order ON notification_logs(order_id);

-- ---------- Inventory ----------
CREATE TABLE inventory_items (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  unit TEXT NOT NULL DEFAULT 'kg',
  quantity REAL NOT NULL DEFAULT 0,
  min_quantity REAL NOT NULL DEFAULT 0,
  supplier TEXT NOT NULL DEFAULT '',
  cost REAL NOT NULL DEFAULT 0,           -- cost per unit, rupees
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ---------- Settings (non-secret, JSON values) ----------
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
