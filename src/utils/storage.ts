import type { User, Booking } from '../types';
import { ADMIN_ACCOUNT } from '../data/constants';
import { API_BASE } from '../config';

const CURRENT_USER_KEY = 'lab_current_user';

async function api<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(API_BASE + path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  const text = await res.text();
  if (!text) return null as T;
  return JSON.parse(text) as T;
}

// ── Users ──

export async function getUsers(): Promise<User[]> {
  return api<User[]>('/users');
}

export async function addUser(user: User) {
  if (user.employeeId === ADMIN_ACCOUNT.employeeId) throw new Error('该工号已被注册');
  const existing = await findUserByEmployeeId(user.employeeId);
  if (existing) throw new Error('该工号已被注册');
  await api('/users', {
    method: 'POST',
    body: JSON.stringify(user),
  });
}

export async function deleteUser(_id: string) {}

export async function findUserByEmployeeId(employeeId: string): Promise<User | undefined> {
  if (employeeId === ADMIN_ACCOUNT.employeeId) return ADMIN_ACCOUNT;
  return api<User | null>(`/users?employeeId=${encodeURIComponent(employeeId)}`).then((u) => u || undefined);
}

// ── Auth (localStorage session) ──

export function getCurrentUser(): User | null {
  const raw = localStorage.getItem(CURRENT_USER_KEY);
  return raw ? JSON.parse(raw) : null;
}

export function setCurrentUser(user: User | null) {
  if (user) localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
  else localStorage.removeItem(CURRENT_USER_KEY);
}

// ── Bookings ──

export async function getBookings(): Promise<Booking[]> {
  return api<Booking[]>('/bookings');
}

export async function addBooking(booking: Booking) {
  const result = await api<{ success: boolean; id: string }>('/bookings', {
    method: 'POST',
    body: JSON.stringify(booking),
  });
  return result;
}

export async function addBookings(newBookings: Booking[]) {
  for (const b of newBookings) {
    await api('/bookings', {
      method: 'POST',
      body: JSON.stringify(b),
    });
  }
}

export async function cancelBooking(id: string) {
  await api(`/bookings?id=${encodeURIComponent(id)}`, { method: 'PATCH' });
}

export async function cancelBookingsBySubSlot(
  labId: string, instrumentId: string, subSlotId: string, userId: string,
) {
  const all = await getBookings();
  for (const b of all) {
    if (b.labId === labId && b.instrumentId === instrumentId && b.subSlotId === subSlotId && b.userId === userId) {
      await cancelBooking(b.id);
    }
  }
}

// ── Queries ──

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
