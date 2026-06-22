import type { User, Booking } from '../types';
import { ADMIN_ACCOUNT } from '../data/constants';
import {
  dbGetUsers,
  dbAddUser,
  dbFindUserByEmployeeId,
  dbGetBookings,
  dbAddBooking,
  dbCancelBooking,
  dbCancelBookingsBySubSlot,
} from './cloudbase';

const CURRENT_USER_KEY = 'lab_current_user';

// ── Users ────────────────────────────────────────────────────────────────────

export async function getUsers(): Promise<User[]> {
  const list = await dbGetUsers();
  return [...list] as unknown as User[];
}

export async function addUser(user: User) {
  if (user.employeeId === ADMIN_ACCOUNT.employeeId) throw new Error('该工号已被注册');
  const existing = await findUserByEmployeeId(user.employeeId);
  if (existing) throw new Error('该工号已被注册');
  await dbAddUser(user as unknown as Record<string, unknown>);
}

export async function deleteUser(_id: string) {
  // not used
}

export async function findUserByEmployeeId(employeeId: string): Promise<User | undefined> {
  if (employeeId === ADMIN_ACCOUNT.employeeId) return ADMIN_ACCOUNT;
  const u = await dbFindUserByEmployeeId(employeeId);
  return u as unknown as User | undefined;
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
  const list = await dbGetBookings();
  return [...list] as unknown as Booking[];
}

export async function addBooking(booking: Booking) {
  await dbAddBooking(booking as unknown as Record<string, unknown>);
  return { success: true, id: booking.id };
}

export async function addBookings(newBookings: Booking[]) {
  for (const b of newBookings) {
    await dbAddBooking(b as unknown as Record<string, unknown>);
  }
}

export async function cancelBooking(id: string) {
  await dbCancelBooking(id);
}

export async function cancelBookingsBySubSlot(
  labId: string, instrumentId: string, subSlotId: string, userId: string,
) {
  await dbCancelBookingsBySubSlot(labId, instrumentId, subSlotId, userId);
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
