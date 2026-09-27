// Rider shifts, attendance (with selfie), breaks and leave. Times are stored in UTC; dates and shift
// times are restaurant-local.
import { db } from '../db/index.js';
import { badRequest, conflict } from '../lib/errors.js';
import { localParts, localToDate, sqlNow, addDays } from '../lib/time.js';
import { getSetting } from './settings.js';
import { notifyAdmins } from './notifications.js';
import { emit } from '../lib/events.js';
import { savePrivateImage } from './riders.js';

const today = () => localParts().date;
export const shiftFor = (riderId, date) => db.prepare('SELECT * FROM shifts WHERE admin_id=? AND date=?').get(riderId, date) || null;
export const onLeave = (riderId, date) => db.prepare("SELECT * FROM leave_requests WHERE admin_id=? AND status='approved' AND ? BETWEEN from_date AND to_date").get(riderId, date) || null;

function breaksOf(attendanceId) {
  return db.prepare('SELECT id, started_at, ended_at FROM attendance_breaks WHERE attendance_id=? ORDER BY id').all(attendanceId);
}
const secsBetween = (a, b) => Math.max(0, Math.round((Date.parse((b || sqlNow()).replace(' ', 'T') + 'Z') - Date.parse(a.replace(' ', 'T') + 'Z')) / 1000));

export function attendanceToday(riderId) {
  const date = today();
  const a = db.prepare('SELECT * FROM attendance WHERE admin_id=? AND date=?').get(riderId, date);
  const breaks = a ? breaksOf(a.id) : [];
  const open = breaks.find(b => !b.ended_at) || null;
  const shift = shiftFor(riderId, date);
  return {
    date, shift, on_leave: onLeave(riderId, date),
    attendance: a ? publicAttendance(a) : null,
    breaks, on_break: !!open, break_started_at: open?.started_at || null,
    break_seconds: breaks.reduce((s, b) => s + secsBetween(b.started_at, b.ended_at), 0),
    state: !a ? 'not_checked_in' : a.check_out_at ? 'checked_out' : open ? 'on_break' : 'working',
    upcoming_shifts: db.prepare('SELECT * FROM shifts WHERE admin_id=? AND date>? ORDER BY date LIMIT 14').all(riderId, date),
    rules: { selfie_on_check_out: !!getSetting('riders').checkout_selfie, shift_required: !!getSetting('riders').require_shift_for_checkin }
  };
}
const publicAttendance = a => ({ id: a.id, date: a.date, status: a.status, check_in_at: a.check_in_at, check_out_at: a.check_out_at,
  check_in_selfie: !!a.check_in_selfie, check_out_selfie: !!a.check_out_selfie });

export async function checkIn(rider, { selfie, lat, lng, accuracy }) {
  const rules = getSetting('riders');
  const date = today();
  if (db.prepare('SELECT 1 FROM attendance WHERE admin_id=? AND date=?').get(rider.id, date)) throw conflict('You have already checked in today.');
  if (onLeave(rider.id, date)) throw conflict('You are on approved leave today.');
  const shift = shiftFor(rider.id, date);
  if (!shift && rules.require_shift_for_checkin) throw conflict('No shift is scheduled for you today.');
  if (shift) {
    const start = localToDate(date, shift.start_time).getTime(), end = localToDate(date, shift.end_time).getTime();
    if (Date.now() < start - 60 * 60_000) throw conflict('Check-in opens 1 hour before your shift starts.');
    if (Date.now() > end) throw conflict('Your shift for today has already ended.');
  }
  if (!selfie) throw badRequest('Take a selfie to check in.');
  if (lat == null || lng == null) throw badRequest('Turn on location to check in.');
  const photo = await savePrivateImage(selfie, 'selfie', { max: 720, quality: 75 });
  const late = shift && Date.now() > localToDate(date, shift.start_time).getTime() + rules.late_grace_minutes * 60_000;
  try {
    db.prepare(`INSERT INTO attendance (admin_id, date, shift_id, status, check_in_at, check_in_lat, check_in_lng, check_in_accuracy, check_in_selfie) VALUES (?,?,?,?,?,?,?,?,?)`)
      .run(rider.id, date, shift?.id ?? null, late ? 'late' : 'present', sqlNow(), lat, lng, accuracy ?? null, photo);
  } catch (e) {
    if (/UNIQUE/.test(e.message)) throw conflict('You have already checked in today.'); // a double tap raced the first request
    throw e;
  }
  if (late) notifyAdmins({ type: 'attendance', title: `${rider.name} checked in late`, body: `Shift started at ${shift.start_time}`, link: '#/attendance', permission: 'attendance.view' });
  emit('attendance', { admin_id: rider.id, event: 'check_in' }, 'attendance.view');
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
  const rows = db.prepare(`SELECT a.*, s.start_time, s.end_time FROM attendance a LEFT JOIN shifts s ON s.id=a.shift_id
    WHERE a.admin_id=? AND a.date BETWEEN ? AND ? ORDER BY a.date DESC`).all(riderId, f, t);
  return rows.map(a => {
    const breaks = breaksOf(a.id);
    return { ...publicAttendance(a), shift: a.start_time ? { start_time: a.start_time, end_time: a.end_time } : null,
      break_seconds: breaks.reduce((s, b) => s + secsBetween(b.started_at, b.ended_at), 0),
      worked_seconds: a.check_out_at ? secsBetween(a.check_in_at, a.check_out_at) - breaks.reduce((s, b) => s + secsBetween(b.started_at, b.ended_at), 0) : null };
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
