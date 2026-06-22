import type { User, Booking } from '../types';
import { ADMIN_ACCOUNT, LABS } from '../data/constants';

const USERS_KEY = 'lab_users';
const BOOKINGS_KEY = 'lab_bookings';
const CURRENT_USER_KEY = 'lab_current_user';

// ── Helpers ──

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}

function save<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value));
}

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ── Demo data generator ──

function seedData() {
  if (!localStorage.getItem(USERS_KEY)) {
    const demoUsers: User[] = [
      { id: 'admin', employeeId: ADMIN_ACCOUNT.employeeId, name: ADMIN_ACCOUNT.name, pi: '管理员' },
      { id: uid(), employeeId: 'user1', name: '张三', pi: '李老师' },
      { id: uid(), employeeId: 'user2', name: '李四', pi: '王老师' },
    ];
    save(USERS_KEY, demoUsers);
  }
  if (!localStorage.getItem(BOOKINGS_KEY)) {
    const now = Date.now();
    const d = (offset: number) => {
      const date = new Date(now + offset * 86400000);
      return Math.floor(date.getTime() / 1000).toString();
    };
    const demoBookings: Booking[] = [
      ...[1, 2, 3].flatMap(i => LABS[0].instruments.map(inst => ({
        id: uid(),
        userId: 'user1',
        userName: '张三',
        userPi: '李老师',
        userEmployeeId: 'user1',
        labId: LABS[0].id,
        instrumentId: inst.id,
        subSlotId: '',
        date: d(i),
        slot: '09:00-10:00',
        slotEnd: '',
        pathogenName: '示例病原',
        bookingType: 'slot' as const,
        status: '已预约' as const,
        createdAt: new Date().toISOString().slice(0, 10),
      }))),
    ];
    save(BOOKINGS_KEY, demoBookings);
  }
}

seedData();

// ── Users ──

export async function getUsers(): Promise<User[]> {
  return load<User[]>(USERS_KEY, []);
}

export async function addUser(user: User) {
  if (user.employeeId === ADMIN_ACCOUNT.employeeId) throw new Error('该工号已被注册');
  const users = await getUsers();
  if (users.find(u => u.employeeId === user.employeeId)) throw new Error('该工号已被注册');
  users.push({ ...user, id: user.id || uid() });
  save(USERS_KEY, users);
}

export async function deleteUser(id: string) {
  const users = await getUsers();
  save(USERS_KEY, users.filter(u => u.id !== id));
}

export async function findUserByEmployeeId(employeeId: string): Promise<User | undefined> {
  if (employeeId === ADMIN_ACCOUNT.employeeId) return ADMIN_ACCOUNT;
  const users = await getUsers();
  return users.find(u => u.employeeId === employeeId);
}

// ── Auth ──

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
  return load<Booking[]>(BOOKINGS_KEY, []);
}

export async function addBooking(booking: Booking) {
  const bookings = await getBookings();
  const newBooking = { ...booking, id: booking.id || uid() };
  bookings.push(newBooking);
  save(BOOKINGS_KEY, bookings);
  return { success: true, id: newBooking.id };
}

export async function addBookings(newBookings: Booking[]) {
  const bookings = await getBookings();
  for (const b of newBookings) {
    bookings.push({ ...b, id: b.id || uid() });
  }
  save(BOOKINGS_KEY, bookings);
}

export async function cancelBooking(id: string) {
  const bookings = await getBookings();
  const idx = bookings.findIndex(b => b.id === id);
  if (idx !== -1) {
    bookings[idx].status = '已取消';
    save(BOOKINGS_KEY, bookings);
  }
}

export async function cancelBookingsBySubSlot(
  labId: string, instrumentId: string, subSlotId: string, userId: string,
) {
  const bookings = await getBookings();
  let changed = false;
  for (const b of bookings) {
    if (b.labId === labId && b.instrumentId === instrumentId && b.subSlotId === subSlotId && b.userId === userId) {
      b.status = '已取消';
      changed = true;
    }
  }
  if (changed) save(BOOKINGS_KEY, bookings);
}

// ── Queries ──

export async function isSlotTaken(
  labId: string, instrumentId: string, date: string, slot: string,
): Promise<Booking | undefined> {
  const all = await getBookings();
  return all.find((b) => {
    if (b.status === '已取消') return false;
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
      b.status !== '已取消' &&
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
      b.status !== '已取消' &&
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
