import type { User, Booking } from '../types';
import { ADMIN_ACCOUNT } from '../data/constants';

const USERS_KEY = 'lab_users';
const BOOKINGS_KEY = 'lab_bookings';
const CURRENT_USER_KEY = 'lab_current_user';

// ── Users ────────────────────────────────────────────────────────────────────

function readUsers(): User[] {
  try { return JSON.parse(localStorage.getItem(USERS_KEY) || '[]'); }
  catch { return []; }
}

function writeUsers(users: User[]) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

export async function getUsers(): Promise<User[]> {
  return [...readUsers(), ADMIN_ACCOUNT];
}

export async function addUser(user: User) {
  const users = readUsers();
  if (users.some((u) => u.employeeId === user.employeeId) || user.employeeId === ADMIN_ACCOUNT.employeeId) {
    throw new Error('该工号已被注册');
  }
  users.push(user);
  writeUsers(users);
}

export async function deleteUser(id: string) {
  const users = readUsers().filter((u) => u.id !== id);
  writeUsers(users);
}

export async function findUserByEmployeeId(employeeId: string): Promise<User | undefined> {
  if (employeeId === ADMIN_ACCOUNT.employeeId) return ADMIN_ACCOUNT;
  return readUsers().find((u) => u.employeeId === employeeId);
}

// ── Auth (localStorage for session) ─────────────────────────────────────────

export function getCurrentUser(): User | null {
  const raw = localStorage.getItem(CURRENT_USER_KEY);
  return raw ? JSON.parse(raw) : null;
}

export function setCurrentUser(user: User | null) {
  if (user) localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
  else localStorage.removeItem(CURRENT_USER_KEY);
}

// ── Bookings ─────────────────────────────────────────────────────────────────

function readBookings(): Booking[] {
  try { return JSON.parse(localStorage.getItem(BOOKINGS_KEY) || '[]'); }
  catch { return []; }
}

function writeBookings(bookings: Booking[]) {
  localStorage.setItem(BOOKINGS_KEY, JSON.stringify(bookings));
}

export async function getBookings(): Promise<Booking[]> {
  return readBookings();
}

export async function addBooking(booking: Booking) {
  const bookings = readBookings();
  bookings.push(booking);
  writeBookings(bookings);
}

export async function addBookings(newBookings: Booking[]) {
  const bookings = readBookings();
  bookings.push(...newBookings);
  writeBookings(bookings);
}

export async function cancelBooking(id: string) {
  const bookings = readBookings().filter((b) => b.id !== id);
  writeBookings(bookings);
}

export async function cancelBookingsBySubSlot(
  labId: string, instrumentId: string, subSlotId: string, userId: string,
) {
  const bookings = readBookings().filter(
    (b) => !(b.labId === labId && b.instrumentId === instrumentId
      && b.subSlotId === subSlotId && b.userId === userId)
  );
  writeBookings(bookings);
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
    (b) => b.labId === labId && b.instrumentId === instrumentId
      && b.subSlotId === subSlotId && b.date === date && b.bookingType === 'day'
  );
}

export async function getSubSlotBookings(
  labId: string, instrumentId: string, subSlotId: string,
): Promise<Booking[]> {
  const all = await getBookings();
  return all.filter(
    (b) => b.labId === labId && b.instrumentId === instrumentId
      && b.subSlotId === subSlotId && b.bookingType === 'day'
  );
}

export async function getBookingsByUser(userId: string): Promise<Booking[]> {
  const all = await getBookings();
  return all.filter((b) => b.userId === userId);
}
