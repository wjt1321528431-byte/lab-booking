import cloudbase from '@cloudbase/js-sdk';

const ENV_ID = 'lab-booking-d3gr36fpq4a2355b6';

const app = cloudbase.init({
  env: ENV_ID,
  region: 'ap-shanghai',
});

const auth = app.auth({ persistence: 'local' });
const db = app.database();

let authReady: Promise<void> | null = null;

function ensureAuth(): Promise<void> {
  if (!authReady) {
    authReady = (async () => {
      // v3: check if already logged in
      const loginState = await auth.getLoginState();
      if (loginState) {
        console.log('[CloudBase] Already logged in, uid:', loginState.user?.uid);
        return;
      }

      // v3: signInAnonymously returns { data, error }, NOT throw
      const result = await auth.signInAnonymously();
      console.log('[CloudBase] signInAnonymously raw result:', JSON.stringify(result, null, 2));

      if (result.error) {
        console.error('[CloudBase] Auth error:', result.error);
        const msg = result.error.message || String(result.error);
        throw new Error('服务器连接失败：' + msg);
      }

      console.log('[CloudBase] Anonymous sign-in OK, uid:', result.data?.user?.uid);
    })();
  }
  return authReady;
}

async function ready() {
  await ensureAuth();
  return db;
}

// ── Users ──

export async function dbGetUsers(): Promise<any[]> {
  const d = await ready();
  const res = await d.collection('users').limit(1000).get();
  console.log('[CloudBase] dbGetUsers result:', JSON.stringify({ error: res.error, count: res.data?.length }));
  if (res.error) throw new Error(res.error.message || String(res.error));
  return (res.data || []) as any[];
}

export async function dbAddUser(user: Record<string, unknown>) {
  const d = await ready();
  const res = await d.collection('users').add(user);
  console.log('[CloudBase] dbAddUser result:', JSON.stringify({ error: res.error, id: res.id }));
  if (res.error) throw new Error(res.error.message || String(res.error));
}

export async function dbDeleteUser(id: string) {
  const d = await ready();
  const res = await d.collection('users').where({ id }).get();
  if (res.error) return;
  if (res.data && res.data.length > 0) {
    const doc = res.data[0] as any;
    await d.collection('users').doc(doc._id).remove();
  }
}

export async function dbFindUserByEmployeeId(employeeId: string): Promise<any | undefined> {
  const d = await ready();
  const res = await d.collection('users').where({ employeeId }).get();
  if (res.error) throw new Error(res.error.message || String(res.error));
  return res.data?.[0] as any;
}

// ── Bookings ──

export async function dbGetBookings(): Promise<any[]> {
  const d = await ready();
  const res = await d.collection('bookings').limit(1000).get();
  console.log('[CloudBase] dbGetBookings result:', JSON.stringify({ error: res.error, count: res.data?.length }));
  if (res.error) throw new Error(res.error.message || String(res.error));
  return (res.data || []) as any[];
}

export async function dbAddBooking(booking: Record<string, unknown>) {
  const d = await ready();
  const res = await d.collection('bookings').add(booking);
  console.log('[CloudBase] dbAddBooking result:', JSON.stringify({ error: res.error, id: res.id }));
  if (res.error) throw new Error(res.error.message || String(res.error));
}

export async function dbAddBookings(bookings: Record<string, unknown>[]) {
  const d = await ready();
  const collection = d.collection('bookings');
  for (const b of bookings) {
    const res = await collection.add(b);
    if (res.error) throw new Error(res.error.message || String(res.error));
  }
}

export async function dbCancelBooking(id: string) {
  const d = await ready();
  const res = await d.collection('bookings').where({ id }).get();
  if (res.error) return;
  if (res.data && res.data.length > 0) {
    for (const doc of res.data as any[]) {
      await d.collection('bookings').doc(doc._id).remove();
    }
  }
}

export async function dbCancelBookingsBySubSlot(
  labId: string, instrumentId: string, subSlotId: string, userId: string,
) {
  const d = await ready();
  const res = await d
    .collection('bookings')
    .where({ labId, instrumentId, subSlotId })
    .get();
  if (res.error) return;
  if (res.data) {
    for (const doc of res.data as any[]) {
      if (doc.userId === userId) {
        await d.collection('bookings').doc(doc._id).remove();
      }
    }
  }
}
