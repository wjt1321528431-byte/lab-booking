export interface User {
  id: string;
  name: string;
  pi: string;
  employeeId: string;
  passwordHash: string;
  role: 'user' | 'admin';
  createdAt: string;
}

// bookingType: 'slot' = 1-hour slot, 'day' = full-day (for incucyte sub-slots)
// slotEnd: if set, the booking spans from `slot` (inclusive) to `slotEnd` (exclusive), e.g. "08:00"~"11:00" = 3 one-hour slots
export interface Booking {
  id: string;
  userId: string;
  userName: string;
  userPi: string;
  userEmployeeId: string;  // 工号，方便导出
  labId: string;
  instrumentId: string;
  subSlotId?: string;
  date: string;         // YYYY-MM-DD
  slot: string;         // HH:mm for normal, 'allday' for full-day incucyte booking
  slotEnd?: string;     // HH:mm (exclusive), for multi-slot range bookings
  bookingType: 'slot' | 'day';
  pathogenName: string;  // 实验病原体名称
  createdAt: string;
}

export interface SubSlot {
  id: string;
  name: string;
}

export interface Instrument {
  id: string;
  name: string;
  labId: string;
  /** If set, this instrument uses full-day sub-slot booking */
  subSlots?: SubSlot[];
}

export interface Lab {
  id: string;
  name: string;
  instruments: Instrument[];
}

export type AuthState = {
  currentUser: User | null;
};
