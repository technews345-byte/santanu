-- Personal-data deletion requests arrive through the same inbox as contact messages.
ALTER TABLE inquiries ADD COLUMN kind TEXT NOT NULL DEFAULT 'message' CHECK (kind IN ('message','deletion'));
ALTER TABLE inquiries ADD COLUMN customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL;
CREATE INDEX idx_inquiries_kind ON inquiries(kind, status);
