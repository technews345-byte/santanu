// All business rules run in the restaurant's timezone (Asia/Kolkata by default), whatever the server's clock zone.
import { getSetting } from '../services/settings.js';

const tz = () => getSetting('business').timezone || 'Asia/Kolkata';
/** Local calendar parts for a Date in the restaurant timezone. */
export function localParts(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: tz(), year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23'
  }).formatToParts(d).map(x => [x.type, x.value]));
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday);
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}`, dow, minutes: +p.hour * 60 + +p.minute };
}
/** Offset in minutes between the restaurant timezone and UTC at a moment (IST = +330). */
function offsetMinutes(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz(), year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(d).map(x => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
  return Math.round((asUtc - Math.floor(d.getTime() / 60000) * 60000) / 60000);
}
/** Converts restaurant-local YYYY-MM-DD + HH:MM into a UTC Date. */
export function localToDate(date, time) {
  const guess = new Date(`${date}T${time}:00Z`);
  return new Date(guess.getTime() - offsetMinutes(guess) * 60000);
}
export const addDays = (ymd, n) => { const d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const toMinutes = hhmm => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
export const dowOf = ymd => new Date(ymd + 'T12:00:00Z').getUTCDay();
/** SQLite CURRENT_TIMESTAMP-compatible UTC string. */
export const sqlNow = (d = new Date()) => d.toISOString().replace('T', ' ').slice(0, 19);
export const fmt12 = hhmm => { const [h, m] = hhmm.split(':').map(Number); return `${h % 12 || 12}${m ? ':' + String(m).padStart(2, '0') : ''} ${h < 12 ? 'AM' : 'PM'}`; };
