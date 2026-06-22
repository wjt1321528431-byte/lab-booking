import type { Lab } from '../types';

export const LABS: Lab[] = [
  {
    id: 'p2plus',
    name: 'P2+实验室',
    instruments: [
      { id: 'biosafety-cabinet', name: '生物安全柜', labId: 'p2plus' },
      { id: 'ultracentrifuge', name: '超速离心机', labId: 'p2plus' },
      { id: 'cryostat', name: '冷冻切片机', labId: 'p2plus' },
      {
        id: 'incucyte',
        name: '长时间活细胞成像系统（Incucyte）',
        labId: 'p2plus',
        subSlots: [
          { id: 'slot-1', name: '板位 1' },
          { id: 'slot-2', name: '板位 2' },
          { id: 'slot-3', name: '板位 3' },
          { id: 'slot-4', name: '板位 4' },
          { id: 'slot-5', name: '板位 5' },
          { id: 'slot-6', name: '板位 6' },
        ],
      },
    ],
  },
  {
    id: 'virus-lab',
    name: '病毒操作实验室',
    instruments: [
      { id: 'virus-bsc-1', name: '生物安全柜 1号', labId: 'virus-lab' },
      { id: 'virus-bsc-2', name: '生物安全柜 2号', labId: 'virus-lab' },
      { id: 'virus-bsc-3', name: '生物安全柜 3号', labId: 'virus-lab' },
      { id: 'virus-bsc-4', name: '生物安全柜 4号', labId: 'virus-lab' },
    ],
  },
];

// Generate 1-hour slots from 08:00 to 22:00
export function generateTimeSlots(): string[] {
  const slots: string[] = [];
  for (let h = 8; h < 22; h++) {
    slots.push(`${String(h).padStart(2, '0')}:00`);
  }
  return slots;
}

export const TIME_SLOTS = generateTimeSlots();

export const ADMIN_ACCOUNT = {
  id: 'admin',
  name: '管理员',
  pi: 'Admin',
  employeeId: 'admin001',
  passwordHash: 'admin123',
  role: 'admin' as const,
  createdAt: new Date().toISOString(),
};

// ── Date range helpers ─────────────────────────────────────────────────────

/**
 * Rolling 7-day booking window.
 * At any time, users can book the next 7 days (today + next 6 = 7 total).
 * At 09:00 each morning the window rolls forward by one day,
 * making the 8th day available.
 */
export function getMaxBookableDate(): string {
  const now = new Date();
  const result = new Date(now);
  result.setDate(result.getDate() + 6);
  result.setHours(0, 0, 0, 0);
  return result.toISOString().split('T')[0];
}

/**
 * Check whether a given date string (YYYY-MM-DD) is within the 7-day bookable window.
 */
export function isDateBookable(dateStr: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + 'T00:00:00');
  const maxStr = getMaxBookableDate();
  const max = new Date(maxStr + 'T00:00:00');
  return target >= today && target <= max;
}

/**
 * Human-readable message about the booking window.
 */
export function getNextOpenMessage(): string {
  const maxDate = getMaxBookableDate();
  const max = new Date(maxDate + 'T00:00:00');

  // Next day becomes available tomorrow at 09:00
  const nextOpen = new Date(max);
  nextOpen.setDate(nextOpen.getDate() + 1);

  const m = nextOpen.getMonth() + 1;
  const d = nextOpen.getDate();
  return `每日 09:00 刷新预约窗口，明日 09:00 可预约 ${m}月${d}日`;
}
