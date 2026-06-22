/**
 * UserApp — normal instrument booking (1-h slots) + My Bookings
 */
import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '../contexts/AuthContext';
import { LABS, TIME_SLOTS, isDateBookable, getMaxBookableDate, getNextOpenMessage } from '../data/constants';
import {
  isSlotTaken,
  addBooking,
  cancelBooking,
  getBookingsByUser,
  getBookings,
} from '../utils/storage';
import type { Booking, Lab, Instrument } from '../types';
import {
  ChevronLeft,
  Calendar,
  Clock,
  FlaskConical,
  LogOut,
  User,
  CheckCircle,
  XCircle,
  Microscope,
  List,
  Info,
  X,
  Loader2,
  MousePointerClick,
} from 'lucide-react';
import IncucyteBooking from './IncucyteBooking';

type Page = 'labs' | 'instruments' | 'booking' | 'incucyte' | 'my-bookings';

// Helper: info row for booking detail modal
function InfoRow({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <span className="text-gray-500 min-w-[52px] shrink-0">{label}</span>
      <span className={`text-gray-800 ${valueClass ?? ''}`}>{value}</span>
    </div>
  );
}

export default function UserApp() {
  const { currentUser, logout } = useAuth();
  const [page, setPage] = useState<Page>('labs');
  const [selectedLab, setSelectedLab] = useState<Lab | null>(null);
  const [selectedInstrument, setSelectedInstrument] = useState<Instrument | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const d = new Date();
    return d.toISOString().split('T')[0];
  });
  const [myBookings, setMyBookings] = useState<Booking[]>([]);
  const [allBookings, setAllBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  // ── Pathogen modal state ─────────────────────────────────────────────────
  const [showPathogenModal, setShowPathogenModal] = useState(false);
  const [pendingSlot, setPendingSlot] = useState('');
  const [pathogenName, setPathogenName] = useState('');

  // ── Drag-select state ────────────────────────────────────────────────────
  const [dragSlots, setDragSlots] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  // ── Booking info modal (view other's booking) ────────────────────────────
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [infoBooking, setInfoBooking] = useState<Booking | null>(null);

  const today = new Date().toISOString().split('T')[0];
  const maxDate = getMaxBookableDate();

  const loadData = useCallback(async () => {
    if (!currentUser) return;
    setLoading(true);
    const [my, all] = await Promise.all([
      getBookingsByUser(currentUser.id),
      getBookings(),
    ]);
    setMyBookings(my);
    setAllBookings(all);
    setLoading(false);
  }, [currentUser]);

  useEffect(() => { loadData(); }, [loadData, page, selectedDate]);

  const showToast = (msg: string, type: 'success' | 'error') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2500);
  };

  // ── Slot interaction: drag-select + single click ──────────────────────────
  const slotIndex = (slot: string) => TIME_SLOTS.indexOf(slot);

  const handleSlotMouseDown = (slot: string) => {
    if (!selectedLab || !selectedInstrument) return;
    // Check if slot is free
    const taken = slotTakenSync(selectedLab.id, selectedInstrument.id, selectedDate, slot);
    if (taken) return; // Can't drag on taken slots
    // Start drag
    setDragSlots([slot]);
    setIsDragging(true);
  };

  const handleSlotMouseEnter = (slot: string) => {
    if (!isDragging || dragSlots.length === 0 || !selectedLab || !selectedInstrument) return;
    // Check if any slot in the new range would be taken
    const startIdx = slotIndex(dragSlots[0]);
    const endIdx = slotIndex(slot);
    const minIdx = Math.min(startIdx, endIdx);
    const maxIdx = Math.max(startIdx, endIdx);
    for (let i = minIdx; i <= maxIdx; i++) {
      const taken = slotTakenSync(selectedLab.id, selectedInstrument.id, selectedDate, TIME_SLOTS[i]);
      if (taken) return; // Can't drag over taken slots
    }
    // Update range
    const range: string[] = [];
    for (let i = minIdx; i <= maxIdx; i++) {
      range.push(TIME_SLOTS[i]);
    }
    setDragSlots(range);
  };

  // Global mouseup to end drag
  useEffect(() => {
    if (!isDragging) return;
    const handleMouseUp = () => {
      setIsDragging(false);
      if (dragSlots.length > 0) {
        // Open pathogen modal for the selected range
        setPendingSlot(dragSlots[0]);
        setPathogenName('');
        setShowPathogenModal(true);
      }
    };
    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
  }, [isDragging, dragSlots]);

  const handleSlotClick = async (slot: string) => {
    // If we just finished a drag, don't handle click
    if (dragSlots.length > 1) return;
    if (!selectedLab || !selectedInstrument) return;
    const taken = slotTakenSync(selectedLab.id, selectedInstrument.id, selectedDate, slot);
    if (taken && taken.userId === currentUser?.id) {
      // Click my own booking → cancel
      await cancelBooking(taken.id);
      await loadData();
      showToast('已取消预约', 'success');
      return;
    }
    if (taken) {
      // Click someone else's booking → show info
      setInfoBooking(taken);
      setShowInfoModal(true);
      return;
    }
    // Free single slot → book
    setDragSlots([slot]);
    setPendingSlot(slot);
    setPathogenName('');
    setShowPathogenModal(true);
  };

  const confirmBookingWithPathogen = async () => {
    if (!currentUser || !selectedLab || !selectedInstrument) return;
    if (!pathogenName.trim()) {
      showToast('请填写实验病原体名称', 'error');
      return;
    }
    const slots = dragSlots.length > 0 ? [...dragSlots].sort() : [pendingSlot];
    const slotStart = slots[0];
    // slotEnd = last slot + 1 hour (e.g., "08:00"~"11:00" for 3 slots)
    const lastSlotIdx = slotIndex(slots[slots.length - 1]);
    const slotEnd = TIME_SLOTS[lastSlotIdx + 1] ?? '22:00'; // 21:00+1h = 22:00

    const booking: Booking = {
      id: `bk_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      userId: currentUser.id,
      userName: currentUser.name,
      userPi: currentUser.pi,
      userEmployeeId: currentUser.employeeId,
      labId: selectedLab.id,
      instrumentId: selectedInstrument.id,
      date: selectedDate,
      slot: slotStart,
      slotEnd: slots.length > 1 ? slotEnd : undefined,
      bookingType: 'slot',
      pathogenName: pathogenName.trim(),
      createdAt: new Date().toISOString(),
    };
    await addBooking(booking);
    await loadData();
    setShowPathogenModal(false);
    setPathogenName('');
    setDragSlots([]);
    showToast(`预约成功：${slotStart}${slots.length > 1 ? ` ~ ${slotEnd}` : ''}`, 'success');
  };

  const handleCancel = async (bookingId: string) => {
    await cancelBooking(bookingId);
    await loadData();
    showToast('已取消预约', 'success');
  };

  // ── Helpers ──────────────────────────────────────────────────────────────
  const getLabName = (labId: string) => LABS.find((l) => l.id === labId)?.name ?? labId;
  const getInstName = (labId: string, instId: string) =>
    LABS.find((l) => l.id === labId)?.instruments.find((i) => i.id === instId)?.name ?? instId;
  const getSubSlotName = (labId: string, instId: string, subSlotId?: string) => {
    if (!subSlotId) return '';
    const inst = LABS.find((l) => l.id === labId)?.instruments.find((i) => i.id === instId);
    return inst?.subSlots?.find((s) => s.id === subSlotId)?.name ?? subSlotId;
  };

  // Sync slot-taken check from allBookings state (handles single + range bookings)
  const slotTakenSync = (labId: string, instId: string, date: string, slot: string): Booking | undefined =>
    allBookings.find(
      (b) => {
        if (b.labId !== labId || b.instrumentId !== instId || b.date !== date) return false;
        if (b.bookingType === 'day') return false;
        if (!b.slotEnd && b.slot === slot) return true;
        if (b.slotEnd && b.slot <= slot && slot < b.slotEnd) return true;
        return false;
      }
    );

  // ── Render: Labs Page ─────────────────────────────────────────────────────
  const renderLabsPage = () => (
    <div>
      <h2 className="text-xl font-bold text-gray-800 mb-5 flex items-center gap-2">
        <FlaskConical className="text-blue-600" size={22} />
        选择实验室
      </h2>
      <div className="grid gap-4">
        {LABS.map((lab) => (
          <Card
            key={lab.id}
            className="cursor-pointer hover:shadow-md transition-all border-2 hover:border-blue-400"
            onClick={() => {
              setSelectedLab(lab);
              setPage('instruments');
            }}
          >
            <CardContent className="p-5 flex items-center justify-between">
              <div>
                <p className="text-lg font-semibold text-gray-800">{lab.name}</p>
                <p className="text-sm text-gray-500 mt-0.5">
                  {lab.instruments.length} 台仪器可预约
                </p>
              </div>
              <ChevronLeft className="rotate-180 text-gray-400" size={22} />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );

  // ── Render: Instruments Page ──────────────────────────────────────────────
  const renderInstrumentsPage = () => (
    <div>
      <button
        onClick={() => setPage('labs')}
        className="flex items-center gap-1 text-blue-600 hover:text-blue-800 mb-4 text-sm font-medium"
      >
        <ChevronLeft size={16} /> 返回实验室列表
      </button>
      <h2 className="text-xl font-bold text-gray-800 mb-2 flex items-center gap-2">
        <Microscope className="text-blue-600" size={22} />
        {selectedLab?.name}
      </h2>
      <p className="text-sm text-gray-500 mb-5">请选择要预约的仪器</p>
      <div className="grid gap-3">
        {selectedLab?.instruments.map((inst) => (
          <Card
            key={inst.id}
            className="cursor-pointer hover:shadow-md transition-all border-2 hover:border-indigo-400"
            onClick={() => {
              setSelectedInstrument(inst);
              if (inst.subSlots && inst.subSlots.length > 0) {
                setPage('incucyte');
              } else {
                setPage('booking');
              }
            }}
          >
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <span className="font-medium text-gray-800">{inst.name}</span>
                {inst.subSlots && (
                  <span className="ml-2 text-xs text-indigo-500 bg-indigo-50 rounded px-1.5 py-0.5">
                    {inst.subSlots.length} 个板位
                  </span>
                )}
              </div>
              <ChevronLeft className="rotate-180 text-gray-400" size={20} />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );

  // ── Render: Booking Page (1-hour slots) ───────────────────────────────────
  const renderBookingPage = () => {
    const myBookingsOnDate = myBookings.filter(
      (b) =>
        b.instrumentId === selectedInstrument?.id &&
        b.labId === selectedLab?.id &&
        b.date === selectedDate &&
        b.bookingType === 'slot'
    );

    const dateNotBookable = selectedDate !== today && !isDateBookable(selectedDate);

    return (
      <div>
        <button
          onClick={() => setPage('instruments')}
          className="flex items-center gap-1 text-blue-600 hover:text-blue-800 mb-4 text-sm font-medium"
        >
          <ChevronLeft size={16} /> 返回仪器列表
        </button>
        <h2 className="text-xl font-bold text-gray-800 mb-1 flex items-center gap-2">
          <Clock className="text-blue-600" size={22} />
          {selectedInstrument?.name}
        </h2>
        <p className="text-sm text-gray-500 mb-4">{selectedLab?.name}</p>

        {/* Booking window notice */}
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-xs text-amber-800">
          <Info size={14} className="mt-0.5 shrink-0" />
          <span>可预约范围：今天 ~ {maxDate}。{getNextOpenMessage()}</span>
        </div>

        {/* Date Picker */}
        <div className="flex items-center gap-3 mb-5 bg-blue-50 rounded-lg p-3">
          <Calendar size={18} className="text-blue-600" />
          <label className="text-sm font-medium text-gray-700">选择日期：</label>
          <input
            type="date"
            value={selectedDate}
            min={today}
            max={maxDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="border rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          {loading && <Loader2 size={16} className="animate-spin text-blue-500 ml-2" />}
        </div>

        {dateNotBookable ? (
          <div className="text-center py-10 text-amber-600">
            <Info size={36} className="mx-auto mb-2 opacity-60" />
            <p className="text-sm">该日期暂不在预约窗口内</p>
            <p className="text-xs mt-1 text-gray-500">{getNextOpenMessage()}</p>
          </div>
        ) : (
          <>
            {/* Time Slots Grid */}
            {isDragging && dragSlots.length > 1 && (
              <p className="text-xs text-amber-600 mb-1 text-center">
                已选 {dragSlots.length} 个时段（{dragSlots[0]} ~ {dragSlots[dragSlots.length - 1]}），松手确认
              </p>
            )}
            <div className="grid grid-cols-4 gap-2 select-none" onContextMenu={(e) => e.preventDefault()}>
              {TIME_SLOTS.map((slot) => {
                const taken = slotTakenSync(
                  selectedLab!.id,
                  selectedInstrument!.id,
                  selectedDate,
                  slot
                );
                const isMine = taken?.userId === currentUser?.id;
                const isPast =
                  selectedDate === today &&
                  slot < new Date().toTimeString().slice(0, 5);
                const inDrag = dragSlots.includes(slot);

                let slotClass =
                  'rounded-lg border-2 p-2 text-center text-sm font-medium transition-all select-none ';
                let label = slot;
                let disabled = false;

                if (isPast) {
                  slotClass += 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed';
                  disabled = true;
                } else if (inDrag) {
                  slotClass += 'border-amber-400 bg-amber-100 text-amber-700 cursor-pointer';
                  label = slot;
                } else if (isMine) {
                  slotClass += 'border-green-500 bg-green-50 text-green-700 hover:bg-green-100 cursor-pointer';
                  label = `${slot} ✓`;
                } else if (taken) {
                  slotClass += 'border-red-300 bg-red-50 text-red-600 hover:bg-red-100 hover:border-red-400 cursor-pointer';
                  label = `${slot} 占用`;
                } else {
                  slotClass += 'border-blue-300 bg-white text-blue-700 hover:bg-blue-50 hover:border-blue-500 cursor-pointer';
                }

                return (
                  <button
                    key={slot}
                    className={slotClass}
                    disabled={disabled}
                    onMouseDown={() => handleSlotMouseDown(slot)}
                    onMouseEnter={() => handleSlotMouseEnter(slot)}
                    onClick={() => handleSlotClick(slot)}
                    title={
                      isMine
                        ? '点击取消预约'
                        : taken
                        ? `${taken.userName}（PI: ${taken.userPi}）\n病原体: ${taken.pathogenName}\n点击查看详情`
                        : isPast
                        ? '时间已过'
                        : '单击预约 / 按住拖拽选取多时段'
                    }
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {/* Legend */}
            <div className="flex flex-wrap gap-4 mt-5 text-xs text-gray-600">
              <span className="flex items-center gap-1">
                <span className="w-4 h-4 rounded border-2 border-blue-300 bg-white inline-block" /> 可预约
              </span>
              <span className="flex items-center gap-1">
                <span className="w-4 h-4 rounded border-2 border-amber-400 bg-amber-100 inline-block" /> 拖拽选取中
              </span>
              <span className="flex items-center gap-1">
                <span className="w-4 h-4 rounded border-2 border-green-500 bg-green-50 inline-block" /> 我的预约（点击取消）
              </span>
              <span className="flex items-center gap-1">
                <span className="w-4 h-4 rounded border-2 border-red-300 bg-red-50 inline-block" /> 已被占用（点击查看详情）
              </span>
            </div>

            {myBookingsOnDate.length > 0 && (
              <div className="mt-5 bg-green-50 rounded-lg p-4 border border-green-200">
                <p className="text-sm font-semibold text-green-800 mb-2">
                  📅 {selectedDate} 您已预约的时间段
                </p>
                <div className="flex flex-wrap gap-2">
                  {myBookingsOnDate.map((b) => (
                    <Badge key={b.id} className="bg-green-600 text-white">
                      {b.slotEnd ? `${b.slot} ~ ${b.slotEnd}` : b.slot}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* ── Booking Info Modal (view other's booking) ── */}
        {showInfoModal && infoBooking && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-[92vw] max-w-sm p-6 relative animate-in fade-in zoom-in duration-200">
              <button
                className="absolute top-3 right-3 text-gray-400 hover:text-gray-600"
                onClick={() => { setShowInfoModal(false); setInfoBooking(null); }}
              >
                <X size={18} />
              </button>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                  <User className="text-red-500" size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-800">预约详情</h3>
                  <p className="text-xs text-gray-500">该时间段已被预约</p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="bg-gray-50 rounded-xl p-4 space-y-2.5">
                  <InfoRow label="预约人" value={infoBooking.userName} />
                  <InfoRow label="工号" value={infoBooking.userEmployeeId} />
                  <InfoRow label="所属PI" value={infoBooking.userPi} />
                  <InfoRow label="仪器" value={`${getLabName(infoBooking.labId)} · ${getInstName(infoBooking.labId, infoBooking.instrumentId)}`} />
                  <InfoRow label="日期" value={infoBooking.date} />
                  <InfoRow label="时间段" value={infoBooking.bookingType === 'day' ? '全天' : (infoBooking.slotEnd ? `${infoBooking.slot} ~ ${infoBooking.slotEnd}` : infoBooking.slot)} />
                  <InfoRow
                    label="病原体"
                    value={infoBooking.pathogenName}
                    valueClass="text-orange-600 font-medium"
                  />
                </div>
              </div>

              <div className="mt-4 flex justify-end">
                <Button
                  variant="outline"
                  onClick={() => { setShowInfoModal(false); setInfoBooking(null); }}
                >
                  关闭
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ── Pathogen Name Modal ── */}
        {showPathogenModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-[92vw] max-w-md p-6 relative animate-in fade-in zoom-in duration-200">
              <button
                className="absolute top-3 right-3 text-gray-400 hover:text-gray-600"
                onClick={() => setShowPathogenModal(false)}
              >
                <X size={18} />
              </button>
              <h3 className="text-lg font-bold text-gray-800 mb-1">确认预约</h3>
              <p className="text-sm text-gray-500 mb-4">
                {selectedInstrument?.name} &nbsp;|&nbsp; {selectedDate} &nbsp;|&nbsp;
                {dragSlots.length > 1 ? `${dragSlots[0]} ~ ${dragSlots[dragSlots.length - 1]}（${dragSlots.length}小时）` : pendingSlot}
              </p>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  实验病原体名称 <span className="text-red-500">*</span>
                </label>
                <input
                  autoFocus
                  value={pathogenName}
                  onChange={(e) => setPathogenName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') confirmBookingWithPathogen(); }}
                  placeholder="请输入实验病原体名称"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
              <div className="flex gap-3 justify-end">
                <Button variant="outline" onClick={() => setShowPathogenModal(false)}>
                  取消
                </Button>
                <Button
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                  onClick={confirmBookingWithPathogen}
                >
                  确认预约
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ── Render: My Bookings Page ──────────────────────────────────────────────
  const renderMyBookingsPage = () => {
    const sorted = [...myBookings].sort((a, b) => {
      if (a.date !== b.date) return a.date > b.date ? 1 : -1;
      return a.slot > b.slot ? 1 : -1;
    });
    const now = new Date();
    const upcoming = sorted.filter(
      (b) =>
        b.date > today ||
        (b.date === today && (b.bookingType === 'day' || b.slot >= now.toTimeString().slice(0, 5)))
    );
    const past = sorted.filter(
      (b) =>
        b.date < today ||
        (b.date === today && b.bookingType !== 'day' && b.slot < now.toTimeString().slice(0, 5))
    );

    // Group by instrument
    const groupByInstrument = (bookings: Booking[]) => {
      const map = new Map<string, Booking[]>();
      for (const b of bookings) {
        const key = `${b.labId}|${b.instrumentId}`;
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(b);
      }
      return map;
    };

    const upcomingGroups = groupByInstrument(upcoming);
    const pastGroups = groupByInstrument(past);

    const formatSlot = (b: Booking) => {
      if (b.bookingType === 'day') return <span className="text-indigo-600 font-medium">全天</span>;
      if (b.slotEnd) return <span>⏰ {b.slot} ~ {b.slotEnd}</span>;
      return <span>⏰ {b.slot}</span>;
    };

    const renderGroup = (bookings: Booking[], showCancel: boolean) => (
      <div className="space-y-2">
        {bookings.map((b) => (
          <Card key={b.id} className={`border-l-4 ${showCancel ? 'border-l-blue-500' : 'border-l-gray-300'}`}>
            <CardContent className={`${showCancel ? 'p-3' : 'p-2.5'} flex items-center justify-between`}>
              <div className="min-w-0 flex-1">
                <p className={`text-gray-500 ${showCancel ? 'text-xs' : 'text-xs'}`}>
                  📅 {b.date}&nbsp;{formatSlot(b)}
                  {b.subSlotId && (
                    <span className="ml-1 text-xs text-indigo-600">
                      {getSubSlotName(b.labId, b.instrumentId, b.subSlotId)}
                    </span>
                  )}
                </p>
                {b.pathogenName && (
                  <p className="text-xs text-gray-400 mt-0.5 truncate">🦠 {b.pathogenName}</p>
                )}
              </div>
              {showCancel && (
                <Button
                  size="sm"
                  variant="outline"
                  className="text-red-600 border-red-300 hover:bg-red-50 shrink-0 ml-2"
                  onClick={() => handleCancel(b.id)}
                >
                  取消
                </Button>
              )}
              {!showCancel && (
                <Badge variant="outline" className="text-xs text-gray-400 shrink-0 ml-2">
                  已结束
                </Badge>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    );

    return (
      <div>
        <h2 className="text-xl font-bold text-gray-800 mb-5 flex items-center gap-2">
          <List className="text-blue-600" size={22} />
          我的预约
        </h2>

        {loading && (
          <div className="flex justify-center py-4">
            <Loader2 className="animate-spin text-blue-500" size={24} />
          </div>
        )}

        {!loading && sorted.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <Calendar size={40} className="mx-auto mb-3 opacity-40" />
            <p>暂无预约记录</p>
          </div>
        ) : !loading ? (
          <>
            {upcoming.length > 0 && (
              <div className="mb-6">
                <p className="text-sm font-semibold text-gray-600 mb-3 uppercase tracking-wide">
                  即将到来
                </p>
                {[...upcomingGroups.entries()].map(([key, bookings]) => {
                  const sample = bookings[0];
                  const title = `${getLabName(sample.labId)} · ${getInstName(sample.labId, sample.instrumentId)}`;
                  return (
                    <div key={key} className="mb-4">
                      <div className="flex items-center gap-2 mb-2 px-1">
                        <Microscope size={14} className="text-blue-500" />
                        <span className="text-sm font-semibold text-blue-700">{title}</span>
                        <Badge variant="secondary" className="text-xs">{bookings.length}</Badge>
                      </div>
                      {renderGroup(bookings, true)}
                    </div>
                  );
                })}
              </div>
            )}
            {past.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-gray-400 mb-3 uppercase tracking-wide">
                  历史记录
                </p>
                {[...pastGroups.entries()].map(([key, bookings]) => {
                  const sample = bookings[0];
                  const title = `${getLabName(sample.labId)} · ${getInstName(sample.labId, sample.instrumentId)}`;
                  return (
                    <div key={key} className="mb-3 opacity-60">
                      <div className="flex items-center gap-2 mb-1.5 px-1">
                        <Microscope size={13} className="text-gray-400" />
                        <span className="text-xs font-medium text-gray-500">{title}</span>
                        <Badge variant="outline" className="text-xs">{bookings.length}</Badge>
                      </div>
                      {renderGroup(bookings, false)}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        ) : null}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Topbar */}
      <div className="bg-blue-700 text-white px-4 py-3 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-2">
          <FlaskConical size={20} />
          <span className="font-semibold text-sm">实验室预约系统</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-blue-200">
            <User size={12} className="inline mr-1" />
            {currentUser?.name}
          </span>
          <button
            onClick={logout}
            className="flex items-center gap-1 text-xs text-blue-200 hover:text-white"
          >
            <LogOut size={14} /> 退出
          </button>
        </div>
      </div>

      {/* Nav Tabs */}
      <div className="bg-white border-b flex gap-0 shadow-sm">
        <button
          onClick={() => setPage('labs')}
          className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors flex items-center justify-center gap-1 ${
            ['labs', 'instruments', 'booking', 'incucyte'].includes(page)
              ? 'border-blue-600 text-blue-700'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Calendar size={15} /> 预约仪器
        </button>
        <button
          onClick={() => setPage('my-bookings')}
          className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors flex items-center justify-center gap-1 ${
            page === 'my-bookings'
              ? 'border-blue-600 text-blue-700'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <List size={15} /> 我的预约
        </button>
      </div>

      {/* Main Content */}
      <div className="max-w-2xl mx-auto p-4 mt-2">
        {page === 'labs' && renderLabsPage()}
        {page === 'instruments' && renderInstrumentsPage()}
        {page === 'booking' && renderBookingPage()}
        {page === 'incucyte' && selectedInstrument && currentUser && (
          <IncucyteBooking
            instrument={selectedInstrument}
            currentUser={currentUser}
            onBack={() => setPage('instruments')}
            onBookingChange={loadData}
          />
        )}
        {page === 'my-bookings' && renderMyBookingsPage()}
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 px-5 py-3 rounded-full shadow-lg text-white text-sm font-medium transition-all z-50 ${
            toast.type === 'success' ? 'bg-green-600' : 'bg-red-500'
          }`}
        >
          {toast.type === 'success' ? <CheckCircle size={16} /> : <XCircle size={16} />}
          {toast.msg}
        </div>
      )}
    </div>
  );
}
