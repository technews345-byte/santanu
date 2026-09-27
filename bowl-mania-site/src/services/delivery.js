import { db } from '../db/index.js';
import { getSetting } from './settings.js';
import { localParts, localToDate, addDays, toMinutes, dowOf, fmt12 } from '../lib/time.js';

/** Great-circle distance in km (Haversine). Road distance is usually 20-40% longer; set radii with that in mind. */
export function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371, rad = d => d * Math.PI / 180;
  const dLat = rad(lat2 - lat1), dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** First base_distance_km costs base_charge; every started extra_distance_km block adds extra_charge. */
export function feeFor(area, km) {
  if (km <= area.base_distance_km) return area.base_charge;
  const blocks = Math.ceil((km - area.base_distance_km) / area.extra_distance_km - 1e-9);
  return area.base_charge + blocks * area.extra_charge;
}

export const activeAreas = () => db.prepare('SELECT * FROM delivery_areas WHERE active=1 ORDER BY display_order, id').all();
export const getArea = id => db.prepare('SELECT * FROM delivery_areas WHERE id=?').get(id);

/** Picks the nearest delivering kitchen for a location and prices the delivery. */
export function quoteDelivery(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return { eligible: false, message: 'Share your location so we can check delivery.' };
  }
  const options = activeAreas().filter(a => a.delivery_enabled)
    .map(a => ({ area: a, km: haversineKm(a.lat, a.lng, lat, lng) }))
    .sort((x, y) => x.km - y.km);
  if (!options.length) return { eligible: false, message: 'Delivery is not available right now. Pickup is still open.' };
  const best = options.find(o => o.km <= o.area.max_radius_km);
  const nearest = options[0];
  if (!best) {
    return { eligible: false, distance_km: round1(nearest.km), area: brief(nearest.area),
      message: 'Sorry, Bowl Mania currently does not deliver to this location.' };
  }
  return { eligible: true, area: brief(best.area), distance_km: round1(best.km), fee: feeFor(best.area, best.km) };
}
const round1 = n => Math.round(n * 10) / 10;
const brief = a => ({ id: a.id, name: a.name, slug: a.slug });

/** Slots for one area over the next `days` days that have not closed yet (respecting holidays and special hours). */
export function upcomingSlots(areaId, days = 3, now = new Date()) {
  const cutoff = Number(getSetting('business').order_cutoff_minutes) || 0;
  const today = localParts(now);
  const regular = db.prepare('SELECT * FROM delivery_slots WHERE area_id=? AND active=1 ORDER BY start_time').all(areaId);
  const out = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(today.date, i);
    const closed = db.prepare('SELECT note FROM holidays WHERE date=? AND (area_id IS NULL OR area_id=?)').get(date, areaId);
    if (closed) continue;
    const special = db.prepare('SELECT * FROM special_hours WHERE date=? AND (area_id IS NULL OR area_id=?) ORDER BY start_time').all(date, areaId);
    const list = special.length
      ? special.map(s => ({ label: s.note || 'Special hours', start_time: s.start_time, end_time: s.end_time }))
      : regular.filter(s => s.days.includes(String(dowOf(date))));
    for (const s of list) {
      const start = localToDate(date, s.start_time), end = localToDate(date, s.end_time);
      if (now.getTime() > end.getTime() - cutoff * 60_000) continue;
      const current = now >= start;
      const dayName = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : new Date(date + 'T12:00:00Z').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' });
      out.push({
        key: `${date}|${s.start_time}`, date, label: s.label, start_time: s.start_time, end_time: s.end_time,
        starts_at: start.toISOString(), ends_at: end.toISOString(), current,
        display: `${dayName} · ${s.label} ${fmt12(s.start_time)} – ${fmt12(s.end_time)}${current ? ' (now)' : ''}`
      });
    }
  }
  return out;
}

/** Whether the restaurant is taking orders for right now. Admin override wins over the schedule. */
export function restaurantStatus(now = new Date()) {
  const b = getSetting('business');
  const areas = activeAreas();
  const perArea = areas.map(a => {
    const slots = upcomingSlots(a.id, 7, now);
    return { id: a.id, name: a.name, open_now: !!slots[0]?.current, next: slots.find(s => !s.current) || null, current: slots.find(s => s.current) || null };
  });
  const scheduleOpen = perArea.some(a => a.open_now);
  const open = b.status_mode === 'open' ? true : b.status_mode === 'closed' ? false : scheduleOpen;
  return {
    mode: b.status_mode, open, accepting_orders: b.status_mode !== 'closed' && (open || b.accept_preorders),
    message: b.status_mode === 'closed' ? (b.closed_message || 'We are closed right now.') : open ? 'Open now' : 'Closed now — pre-order for the next slot',
    areas: perArea
  };
}

/** Estimated ready/delivery time: slot start (or now) plus prep and travel time. */
export function estimateFor(slotStartIso, fulfilment, now = new Date()) {
  const b = getSetting('business');
  const start = Math.max(now.getTime(), new Date(slotStartIso).getTime());
  const mins = Number(b.prep_minutes || 0) + (fulfilment === 'delivery' ? Number(b.delivery_minutes || 0) : 0);
  return new Date(start + mins * 60_000).toISOString();
}
export { toMinutes };
