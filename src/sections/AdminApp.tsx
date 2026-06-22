import { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '../contexts/AuthContext';
import { LABS } from '../data/constants';
import {
  getUsers,
  getBookings,
  cancelBooking,
  deleteUser,
} from '../utils/storage';
import type { User, Booking, Instrument } from '../types';
import {
  FlaskConical,
  LogOut,
  Users,
  Calendar,
  Trash2,
  ChevronDown,
  ChevronUp,
  Shield,
  Download,
  X,
  FileSpreadsheet,
  Loader2,
} from 'lucide-react';

type AdminTab = 'bookings' | 'users';

function getAllInstruments(): (Instrument & { labName: string })[] {
  const result: (Instrument & { labName: string })[] = [];
  for (const lab of LABS) {
    for (const inst of lab.instruments) {
      result.push({ ...inst, labName: lab.name });
    }
  }
  return result;
}

export default function AdminApp() {
  const { logout } = useAuth();
  const [tab, setTab] = useState<AdminTab>('bookings');
  const [users, setUsers] = useState<User[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [filterLab, setFilterLab] = useState('all');
  const [filterDate, setFilterDate] = useState('');
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const [showExportModal, setShowExportModal] = useState(false);
  const [exportInstId, setExportInstId] = useState('');
  const [exportYearMonth, setExportYearMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  const allInstruments = useMemo(() => getAllInstruments(), []);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [u, b] = await Promise.all([getUsers(), getBookings()]);
    setUsers(u.filter((u) => u.role !== 'admin'));
    setBookings(b);
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh, tab]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  };

  const handleCancelBooking = async (id: string) => {
    await cancelBooking(id);
    await refresh();
    showToast('预约已删除');
  };

  const handleDeleteUser = async (id: string) => {
    if (!confirm('确定要删除该用户吗？')) return;
    await deleteUser(id);
    await refresh();
    showToast('用户已删除');
  };

  const labName = (labId: string) =>
    LABS.find((l) => l.id === labId)?.name ?? labId;
  const instName = (labId: string, instId: string) =>
    LABS.find((l) => l.id === labId)?.instruments.find((i) => i.id === instId)?.name ?? instId;
  const subSlotName = (labId: string, instId: string, subSlotId?: string) => {
    if (!subSlotId) return '';
    const inst = LABS.find((l) => l.id === labId)?.instruments.find((i) => i.id === instId);
    return inst?.subSlots?.find((s) => s.id === subSlotId)?.name ?? subSlotId;
  };

  const filteredBookings = bookings.filter((b) => {
    if (filterLab !== 'all' && b.labId !== filterLab) return false;
    if (filterDate && b.date !== filterDate) return false;
    return true;
  });

  const sortedBookings = [...filteredBookings].sort((a, b) => {
    if (a.date !== b.date) return a.date > b.date ? 1 : -1;
    return a.slot > b.slot ? 1 : -1;
  });

  const handleExport = () => {
    if (!exportInstId || !exportYearMonth) {
      showToast('请选择仪器和月份');
      return;
    }
    const [yy, mm] = exportYearMonth.split('-');
    const selectedInst = allInstruments.find((i) => i.id === exportInstId);
    if (!selectedInst) return;

    const filtered = bookings
      .filter((b) => b.instrumentId === exportInstId && b.date.startsWith(`${yy}-${mm}`))
      .sort((a, b) => {
        if (a.date !== b.date) return a.date > b.date ? 1 : -1;
        if (a.subSlotId !== b.subSlotId) return (a.subSlotId ?? '') > (b.subSlotId ?? '') ? 1 : -1;
        return a.slot > b.slot ? 1 : -1;
      });

    if (filtered.length === 0) {
      showToast('该仪器此月份暂无预约记录');
      return;
    }

    const BOM = '\uFEFF';
    const header = '序号,预约人,工号,实验室负责人(PI),预约日期,预约时间段,预约板位,病原体名称';
    const rows = filtered.map((b, idx) => {
      const board = b.subSlotId ? subSlotName(b.labId, b.instrumentId, b.subSlotId) : '';
      const timeSlot = b.bookingType === 'day' ? '整天' : (b.slotEnd ? `${b.slot}~${b.slotEnd}` : b.slot);
      const escape = (s: string) => `"${s.replace(/"/g, '""')}"`;
      return [
        idx + 1, escape(b.userName), escape(b.userEmployeeId ?? ''),
        escape(b.userPi), b.date, escape(timeSlot),
        escape(board), escape(b.pathogenName ?? ''),
      ].join(',');
    });

    const csv = BOM + header + '\n' + rows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedInst.name}_${exportYearMonth}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    setShowExportModal(false);
    showToast(`已导出 ${filtered.length} 条记录`);
  };

  const renderBookingsTab = () => (
    <div>
      <div className="flex flex-wrap gap-3 mb-5 bg-gray-50 p-3 rounded-lg">
        <div>
          <label className="text-xs text-gray-500 block mb-1">实验室筛选</label>
          <select
            value={filterLab}
            onChange={(e) => setFilterLab(e.target.value)}
            className="border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            <option value="all">全部实验室</option>
            {LABS.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">日期筛选</label>
          <input
            type="date"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
            className="border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>
        {filterDate && (
          <div className="flex items-end">
            <Button variant="ghost" size="sm" className="text-gray-500 text-xs" onClick={() => setFilterDate('')}>
              清除日期
            </Button>
          </div>
        )}
        <div className="flex items-end ml-auto">
          <Button
            variant="outline" size="sm"
            className="flex items-center gap-1 text-indigo-600 border-indigo-300 hover:bg-indigo-50"
            onClick={() => setShowExportModal(true)}
          >
            <Download size={14} />
            <span className="text-xs">导出数据</span>
          </Button>
        </div>
      </div>

      <p className="text-sm text-gray-500 mb-3 flex items-center gap-2">
        共 <strong>{sortedBookings.length}</strong> 条预约记录
        {loading && <Loader2 size={14} className="animate-spin text-blue-500" />}
      </p>

      {sortedBookings.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <Calendar size={40} className="mx-auto mb-3 opacity-40" />
          <p>暂无预约记录</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Group by instrument */}
          {(() => {
            // Build grouped map preserving insertion order
            const groups: { key: string; labId: string; instId: string; bookings: Booking[] }[] = [];
            for (const b of sortedBookings) {
              const key = `${b.labId}|${b.instrumentId}`;
              let group = groups.find((g) => g.key === key);
              if (!group) {
                group = { key, labId: b.labId, instId: b.instrumentId, bookings: [] };
                groups.push(group);
              }
              group.bookings.push(b);
            }
            return groups.map((group) => (
              <div key={group.key}>
                <div className="flex items-center gap-2 mb-2 px-1">
                  <Shield size={14} className="text-blue-500" />
                  <span className="text-sm font-semibold text-blue-700">
                    {labName(group.labId)} · {instName(group.labId, group.instId)}
                  </span>
                  <Badge variant="secondary" className="text-xs">{group.bookings.length}</Badge>
                </div>
                <div className="space-y-2">
                  {group.bookings.map((b) => (
                    <Card key={b.id} className="border-l-4 border-l-blue-400">
                      <CardContent className="p-3 flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-gray-500">
                            📅 {b.date} &nbsp;
                            {b.bookingType === 'day' ? (
                              <span className="text-indigo-600 font-medium">整天</span>
                            ) : b.slotEnd ? (
                              <span>⏰ {b.slot} ~ {b.slotEnd}</span>
                            ) : (
                              <span>⏰ {b.slot}</span>
                            )}
                            {b.subSlotId && (
                              <span className="ml-1 text-xs text-indigo-600 bg-indigo-50 rounded px-1.5 py-0.5">
                                {subSlotName(b.labId, b.instrumentId, b.subSlotId)}
                              </span>
                            )}
                            &nbsp; 👤 {b.userName}（PI: {b.userPi}）
                            {b.pathogenName && (
                              <span className="ml-2 text-amber-600">🦠 {b.pathogenName}</span>
                            )}
                          </p>
                        </div>
                        <Button
                          size="sm" variant="ghost"
                          className="text-red-500 hover:bg-red-50 ml-2 shrink-0"
                          onClick={() => handleCancelBooking(b.id)}
                          title="删除此预约"
                        >
                          <Trash2 size={15} />
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            ));
          })()}
        </div>
      )}

      {showExportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-[92vw] max-w-md p-6 relative">
            <button className="absolute top-3 right-3 text-gray-400 hover:text-gray-600" onClick={() => setShowExportModal(false)}>
              <X size={18} />
            </button>
            <h3 className="text-lg font-bold text-gray-800 mb-1 flex items-center gap-2">
              <FileSpreadsheet size={20} className="text-green-600" />
              导出预约数据
            </h3>
            <p className="text-sm text-gray-500 mb-5">选择仪器和月份，导出为 CSV 文件</p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">选择仪器</label>
                <select
                  value={exportInstId}
                  onChange={(e) => setExportInstId(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                >
                  <option value="">-- 请选择仪器 --</option>
                  {allInstruments.map((inst) => (
                    <option key={inst.id} value={inst.id}>
                      [{inst.labName}] {inst.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">选择月份</label>
                <input
                  type="month"
                  value={exportYearMonth}
                  onChange={(e) => setExportYearMonth(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
            </div>
            <div className="flex gap-3 justify-end mt-6">
              <Button variant="outline" onClick={() => setShowExportModal(false)}>取消</Button>
              <Button className="bg-green-600 hover:bg-green-700 text-white" onClick={handleExport}>
                <Download size={14} className="mr-1" />导出 CSV
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const renderUsersTab = () => (
    <div>
      <p className="text-sm text-gray-500 mb-3 flex items-center gap-2">
        共 <strong>{users.length}</strong> 位注册用户
        {loading && <Loader2 size={14} className="animate-spin text-blue-500" />}
      </p>
      {users.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <Users size={40} className="mx-auto mb-3 opacity-40" />
          <p>暂无用户</p>
        </div>
      ) : (
        <div className="space-y-2">
          {users.map((u) => {
            const uBookings = bookings.filter((b) => b.userId === u.id);
            const isExpanded = expandedUser === u.id;
            return (
              <Card key={u.id} className="overflow-hidden">
                <CardContent className="p-0">
                  <div
                    className="p-3 flex items-center justify-between cursor-pointer hover:bg-gray-50"
                    onClick={() => setExpandedUser(isExpanded ? null : u.id)}
                  >
                    <div>
                      <p className="font-semibold text-gray-800 text-sm">
                        {u.name}
                        <span className="ml-2 text-xs text-gray-400 font-normal">工号: {u.employeeId}</span>
                      </p>
                      <p className="text-xs text-gray-500">
                        PI: {u.pi} &nbsp;·&nbsp; 预约记录: {uBookings.length} 条
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm" variant="ghost"
                        className="text-red-500 hover:bg-red-50"
                        onClick={(e) => { e.stopPropagation(); handleDeleteUser(u.id); }}
                        title="删除用户"
                      >
                        <Trash2 size={14} />
                      </Button>
                      {isExpanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="border-t bg-gray-50 px-4 py-3">
                      {uBookings.length === 0 ? (
                        <p className="text-xs text-gray-400">该用户暂无预约记录</p>
                      ) : (
                        <div className="space-y-1.5">
                          {[...uBookings].sort((a, b) =>
                            a.date === b.date ? (a.slot > b.slot ? 1 : -1) : (a.date > b.date ? 1 : -1)
                          ).map((b) => (
                            <div key={b.id} className="flex items-center justify-between text-xs bg-white rounded p-2 border">
                              <span className="text-gray-700">
                                {labName(b.labId)} · {instName(b.labId, b.instrumentId)}
                                {b.subSlotId && ` · ${subSlotName(b.labId, b.instrumentId, b.subSlotId)}`}
                                &nbsp; {b.date}{' '}
                                {b.bookingType === 'day' ? '整天' : b.slot}
                                {b.pathogenName && <span className="ml-1 text-amber-600">🦠{b.pathogenName}</span>}
                              </span>
                              <button onClick={() => handleCancelBooking(b.id)} className="text-red-400 hover:text-red-600" title="删除">
                                <Trash2 size={12} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-indigo-800 text-white px-4 py-3 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-2">
          <FlaskConical size={20} />
          <span className="font-semibold text-sm">实验室预约系统</span>
          <Badge className="bg-yellow-500 text-white text-xs ml-1 flex items-center gap-0.5">
            <Shield size={10} /> 管理员
          </Badge>
        </div>
        <button onClick={logout} className="flex items-center gap-1 text-xs text-indigo-200 hover:text-white">
          <LogOut size={14} /> 退出
        </button>
      </div>

      <div className="bg-indigo-700 px-4 pb-3 flex gap-6">
        <div className="text-center">
          <p className="text-indigo-200 text-xs">用户总数</p>
          <p className="text-white font-bold text-lg">{users.length}</p>
        </div>
        <div className="text-center">
          <p className="text-indigo-200 text-xs">预约总数</p>
          <p className="text-white font-bold text-lg">{bookings.length}</p>
        </div>
      </div>

      <div className="bg-white border-b flex shadow-sm">
        <button onClick={() => setTab('bookings')}
          className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors flex items-center justify-center gap-1 ${
            tab === 'bookings' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}>
          <Calendar size={15} /> 全部预约
        </button>
        <button onClick={() => setTab('users')}
          className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors flex items-center justify-center gap-1 ${
            tab === 'users' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}>
          <Users size={15} /> 用户管理
        </button>
      </div>

      <div className="max-w-2xl mx-auto p-4 mt-2">
        {tab === 'bookings' && renderBookingsTab()}
        {tab === 'users' && renderUsersTab()}
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 px-5 py-3 rounded-full bg-indigo-700 text-white text-sm font-medium shadow-lg z-50">
          {toast}
        </div>
      )}
    </div>
  );
}
