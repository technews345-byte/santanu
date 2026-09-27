// Creates (or resets) a Super Admin account from the command line.
// Usage: npm run create-admin -- owner@example.com "Owner Name"
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { db, migrate } from '../src/db/index.js';
import { seed } from '../src/db/seed.js';
import { hashPassword, strongEnough, passwordRule } from '../src/services/passwords.js';

const [email, name = 'Owner'] = process.argv.slice(2);
if (!email || !/^\S+@\S+\.\S+$/.test(email)) { console.error('Usage: npm run create-admin -- you@example.com "Your Name"'); process.exit(1); }
migrate(); await seed();
const rl = readline.createInterface({ input: stdin, output: stdout });
const pw = await rl.question('New password (10+ characters, letters and numbers): '); rl.close();
if (!strongEnough(pw)) { console.error(passwordRule); process.exit(1); }
const role = db.prepare("SELECT id FROM roles WHERE key='super_admin'").get();
const hash = await hashPassword(pw);
const existing = db.prepare('SELECT id FROM admins WHERE email=?').get(email);
if (existing) db.prepare("UPDATE admins SET password_hash=?, role_id=?, status='active', updated_at=CURRENT_TIMESTAMP WHERE id=?").run(hash, role.id, existing.id);
else db.prepare('INSERT INTO admins (name, email, password_hash, role_id) VALUES (?,?,?,?)').run(name, email, hash, role.id);
db.prepare("INSERT INTO audit_logs (admin_name, action, entity, entity_id, summary) VALUES ('Command line', ?, 'staff', ?, ?)").run(existing ? 'password_reset' : 'create', email, `${existing ? 'Reset' : 'Created'} Super Admin ${email} from the command line`);
console.log(`${existing ? 'Updated' : 'Created'} Super Admin ${email}. Sign in at /admin`);
