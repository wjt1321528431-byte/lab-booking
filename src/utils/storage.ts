import type { User, Booking } from '../types';
import { ADMIN_ACCOUNT } from '../data/constants';
import { API_BASE } from '../config';

const CURRENT_USER_KEY = 'lab_current_user';

async function api<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const opts: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(API_BASE + path, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Network error' }));
    throw new Error(err.error || 'Server error');
  }
  return res.json();
}

// ── Users ────────────────────────────────────────────────────────────────────

export async function getUsers(): Promise<User[]> {
  return []; // admin listing not supported via Feishu
}

export async function addUser(user: User) {
  if (user.employeeId === ADMIN_ACCOUNT.employeeId) throw new Error('该工号已被注册');
  const existing = await findUserByEmployeeId(user.employeeId);
  if (existing) throw new Error('该工号已被注册');
  return api('POST', '/users', {
    employeeId: user.employeeId,
    name: user.name,
    pi: user.pi,
    passwordHash: user.passwordHash,
  });
}

export async function deleteUser(_id: string) {
  // not used
}

export async function findUserByEmployeeId(employeeId: string): Promise<User | undefined> {
  if (employeeId === ADMIN_ACCOUNT.employeeId) return ADMIN_ACCOUNT;
  return api<User | null>('GET', '/users?employeeId=' + encodeURIComponent(employeeId)).then(
    (u) => u || undefined,
  );
}

// ── Auth (localStorage session) ──────────────────────────────────────────────

export function getCurrentUser(): User | null {
  const raw = localStorage.getItem(CURRENT_USER_KEY);
  return raw ? JSON.parse(raw) : null;
}

export function setCurrentUser(user: User | null) {
  if (user) localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
  else localStorage.removeItem(CURRENT_USER_KEY);
}

// ── Bookings ─────────────────────────────────────────────────────────────────

export async function getBookings(): Promise<Booking[]> {
  const data = await api<Array<Booking & { status?: string }>>('GET', '/bookings');
  return (data || []).filter((b) => b.status !== '已取消');
}

export async function addBooking(booking: Booking) {
  return api<{ success: boolean; id: string }>('POST', '/bookings', booking);
}

export async function addBookings(newBookings: Booking[]) {
  for (const b of newBookings) await addBooking(b);
}

export async function cancelBooking(id: string) {
  return api('PATCH', '/bookings?id=' + encodeURIComponent(id));
}

export async function cancelBookingsBySubSlot(
  labId: string, instrumentId: string, subSlotId: string, userId: string,
) {
  const all = await getBookings();
  for (const b of all) {
    if (
      b.labId === labId &&
      b.instrumentId === instrumentId &&
      b.subSlotId === subSlotId &&
      b.userId === userId
    ) {
      await cancelBooking(b.id);
    }
  }
}

// ── Queries ──────────────────────────────────────────────────────────────────

export async function isSlotTaken(
  labId: string, instrumentId: string, date: string, slot: string,
): Promise<Booking | undefined> {
  const all = await getBookings();
  return all.find((b) => {
    if (b.labId !== labId || b.instrumentId !== instrumentId || b.date !== date) return false;
    if (b.bookingType === 'day') return false;
    if (!b.slotEnd && b.slot === slot) return true;
    if (b.slotEnd && b.slot <= slot && slot < b.slotEnd) return true;
    return false;
  });
}

export async function isDayTaken(
  labId: string, instrumentId: string, subSlotId: string, date: string,
): Promise<Booking | undefined> {
  const all = await getBookings();
  return all.find(
    (b) =>
      b.labId === labId &&
      b.instrumentId === instrumentId &&
      b.subSlotId === subSlotId &&
      b.date === date &&
      b.bookingType === 'day',
  );
}

export async function getSubSlotBookings(
  labId: string, instrumentId: string, subSlotId: string,
): Promise<Booking[]> {
  const all = await getBookings();
  return all.filter(
    (b) =>
      b.labId === labId &&
      b.instrumentId === instrumentId &&
      b.subSlotId === subSlotId &&
      b.bookingType === 'day',
  );
}

export async function getBookingsByUser(userId: string): Promise<Booking[]> {
  const all = await getBookings();
  return all.filter((b) => b.userId === userId);
}
