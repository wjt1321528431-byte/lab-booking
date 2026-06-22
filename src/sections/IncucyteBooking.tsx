/**
 * IncucyteBooking — full-day sub-slot booking (板位 1-6).
 */
import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronLeft, Calendar, Info, CheckCircle, XCircle, Loader2, User, X } from 'lucide-react';
import type { Instrument, SubSlot, Booking } from '../types';
import {
  isDayTaken,
  getSubSlotBookings,
  addBookings,
  cancelBooking,
} from '../utils/storage';
import { isDateBookable, getMaxBookableDate, getNextOpenMessage } from '../data/constants';
import type { User } from '../types';

function InfoRow({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <span className="text-gray-500 min-w-[52px] shrink-0">{label}</span>
      <span className={`text-gray-800 ${valueClass ?? ''}`}>{value}</span>
    </div>
  );
}

interface Props {
  instrument: Instrument;
  currentUser: User;
  onBack: () => void;
  onBookingChange?: () => void;
}

function dateRange(start: string, end: string): string[] {
  const dates: string[] = [];
  const cur = new Date(start + 'T00:00:00');
  const last = new Date(end + 'T00:00:00');
  while (cur <= last) {
    dates.push(cur.toISOString().split('T')[0]);
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

export default function IncucyteBooking({ instrument, currentUser, onBack, onBookingChange }: Props) {
  const today = new Date().toISOString().split('T')[0];
  const maxDate = getMaxBookableDate();

  const [selectedSubSlot, setSelectedSubSlot] = useState<SubSlot | null>(null);
  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');
  const [pathogenName, setPathogenName] = useState('');
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  // ── Booking info modal state ────────────────────────────────────────────
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [infoBooking, setInfoBooking] = useState<Booking | null>(null);

  const loadBookings = useCallback(async () => {
    if (!selectedSubSlot) return;
    setLoading(true);
    const data = await getSubSlotBookings(instrument.labId, instrument.id, selectedSubSlot.id);
    setBookings(data);
    setLoading(false);
  }, [selectedSubSlot, instrument]);

  useEffect(() => { loadBookings(); }, [loadBookings]);

  const showToast = (msg: string, type: 'success' | 'error') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleBook = async () => {
    if (!selectedSubSlot || !rangeStart) {
      showToast('请先选择板位和起始日期', 'error');
      return;
    }
    if (!pathogenName.trim()) {
      showToast('请填写实验病原体名称', 'error');
      return;
    }
    const end = rangeEnd || rangeStart;
    if (end < rangeStart) {
      showToast('结束日期不能早于开始日期', 'error');
      return;
    }
    if (!isDateBookable(rangeStart) || !isDateBookable(end)) {
      showToast('所选日期不在可预约范围内', 'error');
      return;
    }
    const dates = dateRange(rangeStart, end);
    for (const d of dates) {
      const conflict = await isDayTaken(instrument.labId, instrument.id, selectedSubSlot.id, d);
      if (conflict) {
        showToast(`${d} 已被 ${conflict.userName} 预约，请调整日期范围`, 'error');
        return;
      }
    }
    const newBookings: Booking[] = dates.map((d) => ({
      id: `bk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${d}`,
      userId: currentUser.id,
      userName: currentUser.name,
      userPi: currentUser.pi,
      userEmployeeId: currentUser.employeeId,
      labId: instrument.labId,
      instrumentId: instrument.id,
      subSlotId: selectedSubSlot.id,
      date: d,
      slot: 'allday',
      bookingType: 'day',
      pathogenName: pathogenName.trim(),
      createdAt: new Date().toISOString(),
    }));
    await addBookings(newBookings);
    await loadBookings();
    onBookingChange?.();
    showToast(
      `预约成功：${selectedSubSlot.name} ${rangeStart}${rangeEnd && rangeEnd !== rangeStart ? ' ~ ' + rangeEnd : ''}`,
      'success'
    );
    setRangeStart('');
    setRangeEnd('');
    setPathogenName('');
  };

  const handleCancelDay = async (booking: Booking) => {
    await cancelBooking(booking.id);
    await loadBookings();
    onBookingChange?.();
    showToast('已取消该日预约', 'success');
  };

  const renderCalendar = () => {
    if (!selectedSubSlot) return null;

    const startD = new Date(today + 'T00:00:00');
    const endD = new Date(maxDate + 'T00:00:00');
    const dayOfWeek = startD.getDay();
    const paddedStart = new Date(startD);
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    paddedStart.setDate(startD.getDate() + diff);

    const weeks: string[][] = [];
    const cur = new Date(paddedStart);
    while (cur <= endD) {
      const week: string[] = [];
      for (let i = 0; i < 7; i++) {
        week.push(cur.toISOString().split('T')[0]);
        cur.setDate(cur.getDate() + 1);
      }
      weeks.push(week);
    }

    return (
      <div className="mt-4">
        <p className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
          {selectedSubSlot.name} — 日历视图
          {loading && <Loader2 size={14} className="animate-spin text-blue-500" />}
        </p>
        <div className="rounded-xl overflow-hidden border border-gray-200 shadow-sm">
          <div className="grid grid-cols-7 bg-blue-600 text-white text-center text-xs font-medium">
            {['一', '二', '三', '四', '五', '六', '日'].map((d) => (
              <div key={d} className="py-2">{d}</div>
            ))}
          </div>
          {weeks.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7 border-t border-gray-100">
              {week.map((dateStr) => {
                const isToday = dateStr === today;
                const isPast = dateStr < today;
                const isOutOfRange = !isDateBookable(dateStr) && dateStr >= today;
                const booking = bookings.find((b) => b.date === dateStr);
                const isMine = booking?.userId === currentUser.id;

                let cellClass = 'min-h-[48px] p-1 text-center border-r border-gray-100 last:border-r-0 ';
                let dayNumClass = 'text-xs font-medium mb-0.5 ';

                if (isPast) {
                  cellClass += 'bg-gray-50';
                  dayNumClass += 'text-gray-300';
                } else if (isOutOfRange) {
                  cellClass += 'bg-gray-50';
                  dayNumClass += 'text-gray-300';
                } else if (isMine) {
                  cellClass += 'bg-green-50 cursor-pointer hover:bg-green-100';
                  dayNumClass += 'text-green-700 font-bold';
                } else if (booking) {
                  cellClass += 'bg-red-50 cursor-pointer hover:bg-red-100';
                  dayNumClass += 'text-red-600 font-medium';
                } else {
                  cellClass += 'bg-white';
                  dayNumClass += isToday ? 'text-blue-600 font-bold' : 'text-gray-700';
                }

                const dayNum = parseInt(dateStr.split('-')[2], 10);
                const isMonthStart = dateStr.endsWith('-01');

                return (
                  <div
                    key={dateStr}
                    className={cellClass}
                    onClick={() => {
                      if (isMine && booking) { handleCancelDay(booking); return; }
                      if (booking) { setInfoBooking(booking); setShowInfoModal(true); }
                    }}
                    title={
                      isMine
                        ? `点击取消 ${dateStr}`
                        : booking
                        ? `${booking.userName}（PI: ${booking.userPi}）\n病原体: ${booking.pathogenName}\n点击查看详情`
                        : isPast || isOutOfRange
                        ? ''
                        : `${dateStr} 可预约`
                    }
                  >
                    <div className={dayNumClass}>
                      {isMonthStart
                        ? `${parseInt(dateStr.split('-')[1], 10)}/${dayNum}`
                        : dayNum}
                    </div>
                    {isMine && (
                      <div className="text-[10px] text-green-700 leading-tight truncate">我的</div>
                    )}
                    {booking && !isMine && (
                      <div className="text-[10px] text-red-400 leading-tight truncate">
                        {booking.userName}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-3 mt-3 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-green-100 border border-green-400 inline-block" /> 我的预约（点击取消）
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-red-100 border border-red-300 inline-block" /> 已被占用（点击查看）
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-gray-100 border border-gray-200 inline-block" /> 不可预约
          </span>
        </div>
      </div>
    );
  };

  return (
    <div>
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-blue-600 hover:text-blue-800 mb-4 text-sm font-medium"
      >
        <ChevronLeft size={16} /> 返回仪器列表
      </button>

      <h2 className="text-xl font-bold text-gray-800 mb-1">{instrument.name}</h2>
      <p className="text-sm text-gray-500 mb-4">每个板位独立预约，以整天为单位</p>

      <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 mb-5 text-xs text-amber-800">
        <Info size={14} className="mt-0.5 shrink-0" />
        <span>可预约范围：今天 ~ {maxDate}。{getNextOpenMessage()}</span>
      </div>

      <p className="text-sm font-semibold text-gray-700 mb-2">选择板位</p>
      <div className="grid grid-cols-3 gap-2 mb-5">
        {instrument.subSlots?.map((ss) => (
          <button
            key={ss.id}
            onClick={() => setSelectedSubSlot(ss)}
            className={`rounded-lg border-2 py-3 text-sm font-medium transition-all ${
              selectedSubSlot?.id === ss.id
                ? 'border-blue-500 bg-blue-50 text-blue-700'
                : 'border-gray-200 bg-white text-gray-700 hover:border-blue-300'
            }`}
          >
            {ss.name}
          </button>
        ))}
      </div>

      {selectedSubSlot && (
        <>
          <Card className="mb-4 border-blue-100">
            <CardContent className="p-4">
              <p className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1">
                <Calendar size={15} className="text-blue-500" />
                预约 {selectedSubSlot.name}
              </p>
              <div className="flex flex-wrap gap-4 items-end">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">开始日期</label>
                  <input
                    type="date"
                    value={rangeStart}
                    min={today}
                    max={maxDate}
                    onChange={(e) => {
                      setRangeStart(e.target.value);
                      if (rangeEnd && rangeEnd < e.target.value) setRangeEnd('');
                    }}
                    className="border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">结束日期（可选）</label>
                  <input
                    type="date"
                    value={rangeEnd}
                    min={rangeStart || today}
                    max={maxDate}
                    onChange={(e) => setRangeEnd(e.target.value)}
                    className="border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
                <div className="flex-1 min-w-[160px]">
                  <label className="text-xs text-gray-500 block mb-1">实验病原体名称 <span className="text-red-500">*</span></label>
                  <input
                    value={pathogenName}
                    onChange={(e) => setPathogenName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleBook(); }}
                    placeholder="必填"
                    className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
                <Button
                  onClick={handleBook}
                  disabled={!rangeStart}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  确认预约
                </Button>
              </div>
              {rangeStart && (
                <p className="text-xs text-gray-500 mt-2">
                  将预约：{rangeStart}{rangeEnd && rangeEnd !== rangeStart ? ` 至 ${rangeEnd}` : ''}（共 {rangeEnd && rangeEnd !== rangeStart ? dateRange(rangeStart, rangeEnd).length : 1} 天）
                </p>
              )}
            </CardContent>
          </Card>

          {renderCalendar()}

          {/* ── Booking Info Modal ── */}
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
                    <p className="text-xs text-gray-500">该板位已被预约</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="bg-gray-50 rounded-xl p-4 space-y-2.5">
                    <InfoRow label="预约人" value={infoBooking.userName} />
                    <InfoRow label="工号" value={infoBooking.userEmployeeId} />
                    <InfoRow label="所属PI" value={infoBooking.userPi} />
                    <InfoRow label="仪器" value={instrument.name} />
                    <InfoRow label="日期" value={infoBooking.date} />
                    <InfoRow label="板位" value={selectedSubSlot?.name ?? ''} />
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

        </>
      )}

      {toast && (
        <div
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 px-5 py-3 rounded-full shadow-lg text-white text-sm font-medium z-50 ${
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
