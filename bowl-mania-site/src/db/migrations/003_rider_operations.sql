-- Rider (delivery partner) operations for the Bowl Mania Rider app and the admin panel.
-- Riders are salaried employees: nothing here records rider pay, commission, incentives or tips.

-- Employee details for staff accounts (used for delivery staff).
ALTER TABLE admins ADD COLUMN employee_id TEXT NOT NULL DEFAULT '';
ALTER TABLE admins ADD COLUMN vehicle_type TEXT NOT NULL DEFAULT '';
ALTER TABLE admins ADD COLUMN vehicle_number TEXT NOT NULL DEFAULT '';
ALTER TABLE admins ADD COLUMN joining_date TEXT;
ALTER TABLE admins ADD COLUMN photo TEXT NOT NULL DEFAULT '';           -- private file name

-- Delivery lifecycle: rebuilt to allow every step of the rider workflow.
CREATE TABLE delivery_assignments_v2 (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  staff_id INTEGER NOT NULL REFERENCES admins(id),
  status TEXT NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned','accepted','to_restaurant','at_restaurant','picked_up','out_for_delivery','at_customer','otp_verified','delivered')),
  pickup_otp TEXT NOT NULL DEFAULT '',
  delivery_otp TEXT NOT NULL DEFAULT '',
  pickup_otp_attempts INTEGER NOT NULL DEFAULT 0,
  delivery_otp_attempts INTEGER NOT NULL DEFAULT 0,
  assigned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  accepted_at TEXT,
  started_at TEXT,                    -- going to the restaurant
  arrived_restaurant_at TEXT,
  picked_up_at TEXT,                  -- pickup verified
  out_at TEXT,
  arrived_customer_at TEXT,
  otp_verified_at TEXT,
  cash_collected_at TEXT,
  cash_collected_amount INTEGER,
  proof_photo TEXT NOT NULL DEFAULT '',
  proof_signature TEXT NOT NULL DEFAULT '',
  proof_note TEXT NOT NULL DEFAULT '',
  proof_lat REAL,
  proof_lng REAL,
  proof_at TEXT,
  delivered_at TEXT,
  override_reason TEXT NOT NULL DEFAULT '',   -- set when a manager completes a step without OTP/proof
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO delivery_assignments_v2 (id, order_id, staff_id, status, assigned_at, accepted_at, picked_up_at, out_at, delivered_at, updated_at, pickup_otp, delivery_otp)
  SELECT id, order_id, staff_id, status, assigned_at, CASE WHEN status<>'assigned' THEN assigned_at END, picked_up_at,
    CASE WHEN status IN ('out_for_delivery','delivered') THEN COALESCE(picked_up_at, updated_at) END, delivered_at, updated_at,
    printf('%04d', abs(random()) % 10000), printf('%04d', abs(random()) % 10000)
  FROM delivery_assignments;
DROP TABLE delivery_assignments;
ALTER TABLE delivery_assignments_v2 RENAME TO delivery_assignments;
CREATE INDEX idx_assign_staff ON delivery_assignments(staff_id, status);

-- Every rider step, for the timeline and for safe retries (same key = same request).
CREATE TABLE delivery_events (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  staff_id INTEGER REFERENCES admins(id) ON DELETE SET NULL,
  step TEXT NOT NULL,
  lat REAL,
  lng REAL,
  note TEXT NOT NULL DEFAULT '',
  idempotency_key TEXT UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_delivery_events_order ON delivery_events(order_id, id);

CREATE TABLE delivery_rejections (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  staff_id INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_rejections_staff ON delivery_rejections(staff_id, created_at);

-- Live rider state (one row per rider) and location history.
CREATE TABLE rider_state (
  admin_id INTEGER PRIMARY KEY REFERENCES admins(id) ON DELETE CASCADE,
  online INTEGER NOT NULL DEFAULT 0,
  online_since TEXT,
  lat REAL,
  lng REAL,
  accuracy REAL,
  speed REAL,
  heading REAL,
  location_at TEXT,
  order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE rider_locations (
  id INTEGER PRIMARY KEY,
  admin_id INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  accuracy REAL,
  speed REAL,
  heading REAL,
  order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  recorded_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (admin_id, recorded_at)
);
CREATE INDEX idx_rider_locations ON rider_locations(admin_id, recorded_at);

-- Push notification tokens (Firebase) and the rider's own notification inbox.
CREATE TABLE rider_devices (
  id INTEGER PRIMARY KEY,
  admin_id INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  platform TEXT NOT NULL DEFAULT 'android',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE rider_notifications (
  id INTEGER PRIMARY KEY,
  admin_id INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  ticket_id INTEGER,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_rider_notifications ON rider_notifications(admin_id, id);

-- Shifts, attendance (with selfie), breaks and leave.
CREATE TABLE shifts (
  id INTEGER PRIMARY KEY,
  admin_id INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  date TEXT NOT NULL,                 -- YYYY-MM-DD, restaurant time
  start_time TEXT NOT NULL,           -- HH:MM
  end_time TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_by INTEGER REFERENCES admins(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (admin_id, date)
);
CREATE TABLE attendance (
  id INTEGER PRIMARY KEY,
  admin_id INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  shift_id INTEGER REFERENCES shifts(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'present' CHECK (status IN ('present','late')),
  check_in_at TEXT NOT NULL,
  check_in_lat REAL,
  check_in_lng REAL,
  check_in_accuracy REAL,
  check_in_selfie TEXT NOT NULL DEFAULT '',
  check_out_at TEXT,
  check_out_lat REAL,
  check_out_lng REAL,
  check_out_selfie TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (admin_id, date)
);
CREATE TABLE attendance_breaks (
  id INTEGER PRIMARY KEY,
  attendance_id INTEGER NOT NULL REFERENCES attendance(id) ON DELETE CASCADE,
  started_at TEXT NOT NULL,
  ended_at TEXT
);
CREATE TABLE leave_requests (
  id INTEGER PRIMARY KEY,
  admin_id INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  from_date TEXT NOT NULL,
  to_date TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
  decided_by INTEGER REFERENCES admins(id) ON DELETE SET NULL,
  decided_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Rider support and safety.
CREATE TABLE support_tickets (
  id INTEGER PRIMARY KEY,
  admin_id INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  category TEXT NOT NULL CHECK (category IN ('delivery','customer','restaurant','order','cod','vehicle','technical','emergency','accident','safety')),
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal','urgent')),
  lat REAL,
  lng REAL,
  client_key TEXT UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_support_status ON support_tickets(status, priority);
CREATE TABLE support_messages (
  id INTEGER PRIMARY KEY,
  ticket_id INTEGER NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  author_id INTEGER REFERENCES admins(id) ON DELETE SET NULL,
  from_rider INTEGER NOT NULL DEFAULT 1,
  body TEXT NOT NULL DEFAULT '',
  attachment TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Shown to riders when they arrive at a kitchen.
ALTER TABLE delivery_areas ADD COLUMN pickup_instructions TEXT NOT NULL DEFAULT '';
