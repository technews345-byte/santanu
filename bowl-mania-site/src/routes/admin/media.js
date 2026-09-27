import { Router } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';
import { db } from '../../db/index.js';
import { config } from '../../config.js';
import { ah, notFound, badRequest } from '../../lib/errors.js';
import { parse, z, text, bool } from '../../lib/validate.js';
import { audit } from '../../lib/audit.js';
import { token } from '../../lib/ids.js';
import { requirePerm } from '../../middleware/auth.js';

const r = Router();
const IMAGE = new Set(['image/jpeg', 'image/png', 'image/webp']);
const VIDEO = new Set(['video/mp4', 'video/webm']);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 60 * 1024 * 1024, files: 1 } });
const CATEGORIES = ['food', 'restaurant', 'video', 'banner', 'menu', 'category'];

/** Stores uploads on disk (not in the database). Images become resized WebP plus a thumbnail. */
async function store(file) {
  const dir = path.join(config.uploadsDir, new Date().toISOString().slice(0, 7));
  await fs.mkdir(dir, { recursive: true });
  const id = token(9), rel = p => '/uploads/' + path.relative(config.uploadsDir, p).split(path.sep).join('/');
  if (IMAGE.has(file.mimetype)) {
    const img = sharp(file.buffer, { failOn: 'error' }).rotate();
    const meta = await img.metadata();
    if (!meta.width) throw badRequest('That image could not be read.');
    const full = path.join(dir, `${id}.webp`), thumb = path.join(dir, `${id}-thumb.webp`);
    const out = await img.clone().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toFile(full);
    await img.clone().resize({ width: 480, height: 480, fit: 'cover' }).webp({ quality: 78 }).toFile(thumb);
    return { kind: 'image', url: rel(full), thumb_url: rel(thumb), mime: 'image/webp', size_bytes: out.size, width: out.width, height: out.height };
  }
  if (VIDEO.has(file.mimetype)) {
    // Basic signature check so a renamed file isn't served as video.
    const head = file.buffer.subarray(0, 12);
    const ok = file.mimetype === 'video/mp4' ? head.subarray(4, 8).toString() === 'ftyp' : head.readUInt32BE(0) === 0x1a45dfa3;
    if (!ok) throw badRequest('That video file is not a valid MP4 or WebM.');
    const full = path.join(dir, `${id}.${file.mimetype === 'video/mp4' ? 'mp4' : 'webm'}`);
    await fs.writeFile(full, file.buffer);
    return { kind: 'video', url: rel(full), thumb_url: '', mime: file.mimetype, size_bytes: file.size, width: null, height: null };
  }
  throw badRequest('Upload a JPG, PNG or WebP image, or an MP4/WebM video.');
}

r.get('/media', requirePerm('media.manage', 'menu.manage'), ah(async (req, res) => {
  const f = parse(z.object({ kind: z.enum(['', 'image', 'video']).optional().default(''), category: z.string().max(30).optional().default('') }), req.query);
  const where = ['1=1'], p = [];
  if (f.kind) { where.push('kind=?'); p.push(f.kind); }
  if (f.category) { where.push('category=?'); p.push(f.category); }
  res.json({ rows: db.prepare(`SELECT * FROM media WHERE ${where.join(' AND ')} ORDER BY display_order, id DESC`).all(...p).map(m => ({ ...m, active: !!m.active })), categories: CATEGORIES });
}));
r.post('/media', requirePerm('media.manage', 'menu.manage'), upload.single('file'), ah(async (req, res) => {
  if (!req.file) throw badRequest('Choose a file to upload.');
  if (IMAGE.has(req.file.mimetype) && req.file.size > 8 * 1024 * 1024) throw badRequest('Images must be under 8 MB.');
  const meta = parse(z.object({ title: text(120).optional().default(''), description: text(500).optional().default(''), category: z.enum(CATEGORIES).default('food') }), req.body);
  const s = await store(req.file);
  const id = db.prepare(`INSERT INTO media (kind, title, description, category, url, thumb_url, mime, size_bytes, width, height, display_order)
    VALUES (?,?,?,?,?,?,?,?,?,?, (SELECT COALESCE(MAX(display_order),-1)+1 FROM media))`).run(s.kind, meta.title || req.file.originalname.replace(/\.[^.]+$/, '').slice(0, 120), meta.description, s.kind === 'video' && meta.category === 'food' ? 'video' : meta.category, s.url, s.thumb_url, s.mime, s.size_bytes, s.width, s.height).lastInsertRowid;
  audit(req, 'upload', 'media', id, `Uploaded ${s.kind} "${meta.title || req.file.originalname}"`);
  res.status(201).json(db.prepare('SELECT * FROM media WHERE id=?').get(id));
}));
r.patch('/media/:id', requirePerm('media.manage'), ah(async (req, res) => {
  const m = db.prepare('SELECT * FROM media WHERE id=?').get(Number(req.params.id)); if (!m) throw notFound('File not found.');
  const b = parse(z.object({ title: text(120), description: text(500).optional().default(''), category: z.enum(CATEGORIES), active: bool, display_order: z.coerce.number().int().min(0).max(9999).optional() }), req.body);
  db.prepare('UPDATE media SET title=?, description=?, category=?, active=?, display_order=COALESCE(?, display_order), updated_at=CURRENT_TIMESTAMP WHERE id=?').run(b.title, b.description, b.category, +b.active, b.display_order ?? null, m.id);
  audit(req, 'update', 'media', m.id, `Edited media "${b.title}"`, { title: m.title, active: !!m.active, category: m.category }, { title: b.title, active: b.active, category: b.category });
  res.json({ ok: true });
}));
r.delete('/media/:id', requirePerm('media.manage'), ah(async (req, res) => {
  const m = db.prepare('SELECT * FROM media WHERE id=?').get(Number(req.params.id)); if (!m) throw notFound('File not found.');
  const inUse = db.prepare('SELECT name FROM menu_items WHERE image IN (?,?) UNION SELECT name FROM categories WHERE image IN (?,?)').all(m.url, m.thumb_url, m.url, m.thumb_url);
  if (inUse.length) throw badRequest(`This photo is used by ${inUse.map(x => x.name).join(', ')}. Change those first.`);
  db.prepare('DELETE FROM media WHERE id=?').run(m.id);
  for (const u of [m.url, m.thumb_url].filter(Boolean)) await fs.unlink(path.join(config.uploadsDir, u.replace(/^\/uploads\//, ''))).catch(() => {});
  audit(req, 'delete', 'media', m.id, `Deleted media "${m.title}"`, m, null); res.json({ ok: true });
}));
export default r;
