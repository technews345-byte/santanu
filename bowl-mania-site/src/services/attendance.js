// Rider attendance (check-in/out with selfie), breaks and leave. Times are stored in UTC; dates are
// restaurant-local. There is no shift schedule: riders check in when they start and go online/offline freely.
import { db } from '../db/index.js';
import { badRequest, conflict } from '../lib/errors.js';
import { localParts, sqlNow, addDays } from '../lib/time.js';
import { getSetting } from './settings.js';
import { notifyAdmins } from './notifications.js';
import { emit } from '../lib/events.js';
import { savePrivateImage } from './riders.js';

const today = () => localParts().date;
export const onLeave = (riderId, date) => db.prepare("SELECT * FROM leave_requests WHERE admin_id=? AND status='approved' AND ? BETWEEN from_date AND to_date").get(riderId, date) || null;

function breaksOf(attendanceId) {
  return db.prepare("SELECT id, started_at, ended_at FROM attendance_breaks WHERE attendance_id=? AND kind='break' ORDER BY id").all(attendanceId);
}
/** Off-duty gaps: from a check-out to the next check-in on the same day. */
function gapsOf(attendanceId) {
  return db.prepare("SELECT id, started_at, ended_at, selfie, lat, lng FROM attendance_breaks WHERE attendance_id=? AND kind='off' ORDER BY id").all(attendanceId);
}
const secsBetween = (a, b) => Math.max(0, Math.round((Date.parse((b || sqlNow()).replace(' ', 'T') + 'Z') - Date.parse(a.replace(' ', 'T') + 'Z')) / 1000));

export function attendanceToday(riderId) {
  const date = today();
  const a = db.prepare('SELECT * FROM attendance WHERE admin_id=? AND date=?').get(riderId, date);
  const breaks = a ? breaksOf(a.id) : [];
  const open = breaks.find(b => !b.ended_at) || null;
  return {
    date, on_leave: onLeave(riderId, date),
    attendance: a ? publicAttendance(a) : null,
    breaks, on_break: !!open, break_started_at: open?.started_at || null,
    break_seconds: breaks.reduce((s, b) => s + secsBetween(b.started_at, b.ended_at), 0),
    off_seconds: a ? gapsOf(a.id).reduce((s, g) => s + secsBetween(g.started_at, g.ended_at), 0) : 0,
    sessions: a?.sessions ?? 0,
    state: !a ? 'not_checked_in' : a.check_out_at ? 'checked_out' : open ? 'on_break' : 'working',
    rules: { selfie_on_check_out: !!getSetting('riders').checkout_selfie }
  };
}
const publicAttendance = a => ({ id: a.id, date: a.date, status: a.status, check_in_at: a.check_in_at, check_out_at: a.check_out_at, sessions: a.sessions ?? 1,
  check_in_selfie: !!a.check_in_selfie, check_out_selfie: !!a.check_out_selfie });

export async function checkIn(rider, { selfie, lat, lng, accuracy }) {
  const date = today();
  const existing = db.prepare('SELECT * FROM attendance WHERE admin_id=? AND date=?').get(rider.id, date);
  if (existing && !existing.check_out_at) throw conflict('You have already checked in today.');
  if (onLeave(rider.id, date)) throw conflict('You are on approved leave today.');
  if (existing) return checkInAgain(rider, existing, { selfie, lat, lng });
  if (!selfie) throw badRequest('Take a selfie to check in.');
  if (lat == null || lng == null) throw badRequest('Turn on location to check in.');
  const photo = await savePrivateImage(selfie, 'selfie', { max: 720, quality: 75 });
  try {
    db.prepare(`INSERT INTO attendance (admin_id, date, status, check_in_at, check_in_lat, check_in_lng, check_in_accuracy, check_in_selfie) VALUES (?,?,'present',?,?,?,?,?)`)
      .run(rider.id, date, sqlNow(), lat, lng, accuracy ?? null, photo);
  } catch (e) {
    if (/UNIQUE/.test(e.message)) throw conflict('You have already checked in today.'); // a double tap raced the first request
    throw e;
  }
  emit('attendance', { admin_id: rider.id, event: 'check_in' }, 'attendance.view');
  return attendanceToday(rider.id);
}

/** Checking in again after checking out on the same day: the time in between is recorded as off duty. */
async function checkInAgain(rider, a, { selfie, lat, lng }) {
  if (!selfie) throw badRequest('Take a selfie to check in.');
  if (lat == null || lng == null) throw badRequest('Turn on location to check in.');
  const photo = await savePrivateImage(selfie, 'selfie', { max: 720, quality: 75 });
  const resumed = db.transaction(() => {
    // Only the first of two racing requests reopens the day.
    const r = db.prepare("UPDATE attendance SET check_out_at=NULL, check_out_lat=NULL, check_out_lng=NULL, check_out_selfie='', sessions=sessions+1 WHERE id=? AND check_out_at=?").run(a.id, a.check_out_at);
    if (!r.changes) return false;
    db.prepare("INSERT INTO attendance_breaks (attendance_id, kind, started_at, ended_at, selfie, lat, lng) VALUES (?, 'off', ?, CURRENT_TIMESTAMP, ?, ?, ?)").run(a.id, a.check_out_at, photo, lat, lng);
    return true;
  })();
  if (resumed) {
    notifyAdmins({ type: 'attendance', title: `${rider.name} checked in again`, body: `Checked out at ${a.check_out_at.slice(11, 16)} UTC earlier today`, link: '#/attendance', permission: 'attendance.view' });
    emit('attendance', { admin_id: rider.id, event: 'check_in' }, 'attendance.view');
  }
  return attendanceToday(rider.id);
}

export async function checkOut(rider, { selfie, lat, lng }) {
  const a = db.prepare('SELECT * FROM attendance WHERE admin_id=? AND date=?').get(rider.id, today());
  if (!a) throw conflict('You have not checked in today.');
  if (a.check_out_at) return attendanceToday(rider.id); // already done: safe retry
  const { hasActiveDelivery } = await import('./riders.js');
  if (hasActiveDelivery(rider.id)) throw conflict('Finish your active delivery before checking out.');
  if (getSetting('riders').checkout_selfie && !selfie) throw badRequest('Take a selfie to check out.');
  const photo = selfie ? await savePrivateImage(selfie, 'selfie', { max: 720, quality: 75 }) : '';
  db.transaction(() => {
    db.prepare('UPDATE attendance_breaks SET ended_at=CURRENT_TIMESTAMP WHERE attendance_id=? AND ended_at IS NULL').run(a.id);
    db.prepare('UPDATE attendance SET check_out_at=CURRENT_TIMESTAMP, check_out_lat=?, check_out_lng=?, check_out_selfie=? WHERE id=?').run(lat ?? null, lng ?? null, photo, a.id);
    // Checking out ends the working day: the rider goes offline and tracking stops.
    db.prepare('UPDATE rider_state SET online=0, updated_at=CURRENT_TIMESTAMP WHERE admin_id=?').run(rider.id);
  })();
  emit('attendance', { admin_id: rider.id, event: 'check_out' }, 'attendance.view');
  return attendanceToday(rider.id);
}

export function startBreak(rider) {
  const a = db.prepare('SELECT * FROM attendance WHERE admin_id=? AND date=?').get(rider.id, today());
  if (!a || a.check_out_at) throw conflict('Check in first.');
  if (db.prepare('SELECT 1 FROM attendance_breaks WHERE attendance_id=? AND ended_at IS NULL').get(a.id)) return attendanceToday(rider.id);
  db.prepare('INSERT INTO attendance_breaks (attendance_id, started_at) VALUES (?, CURRENT_TIMESTAMP)').run(a.id);
  return attendanceToday(rider.id);
}
export function endBreak(rider) {
  const a = db.prepare('SELECT * FROM attendance WHERE admin_id=? AND date=?').get(rider.id, today());
  if (!a) throw conflict('Check in first.');
  db.prepare('UPDATE attendance_breaks SET ended_at=CURRENT_TIMESTAMP WHERE attendance_id=? AND ended_at IS NULL').run(a.id);
  return attendanceToday(rider.id);
}

export function attendanceHistory(riderId, from, to) {
  const f = from || addDays(today(), -30), t = to || today();
  const rows = db.prepare('SELECT * FROM attendance WHERE admin_id=? AND date BETWEEN ? AND ? ORDER BY date DESC').all(riderId, f, t);
  return rows.map(a => {
    const brk = breaksOf(a.id).reduce((s, b) => s + secsBetween(b.started_at, b.ended_at), 0);
    const off = gapsOf(a.id).reduce((s, g) => s + secsBetween(g.started_at, g.ended_at), 0);
    return { ...publicAttendance(a),
      break_seconds: brk, off_seconds: off,
      worked_seconds: a.check_out_at ? Math.max(0, secsBetween(a.check_in_at, a.check_out_at) - brk - off) : null };
  });
}

export function requestLeave(rider, { from_date, to_date, reason }) {
  if (to_date < from_date) throw badRequest('The end date is before the start date.');
  if (from_date < today()) throw badRequest('Leave can only be requested for today or later.');
  const overlap = db.prepare("SELECT 1 FROM leave_requests WHERE admin_id=? AND status IN ('pending','approved') AND NOT (to_date < ? OR from_date > ?)").get(rider.id, from_date, to_date);
  if (overlap) throw conflict('You already have leave requested for some of these days.');
  const id = db.prepare('INSERT INTO leave_requests (admin_id, from_date, to_date, reason) VALUES (?,?,?,?)').run(rider.id, from_date, to_date, reason).lastInsertRowid;
  notifyAdmins({ type: 'leave_request', title: `${rider.name} requested leave`, body: `${from_date} to ${to_date}${reason ? ' · ' + reason : ''}`, link: '#/attendance', permission: 'riders.manage' });
  return db.prepare('SELECT * FROM leave_requests WHERE id=?').get(id);
}
