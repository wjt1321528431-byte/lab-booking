const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// ── Feishu credentials ──
const BH = 'https://open.feishu.cn/open-apis';
const FA = 'cli_aaa50174943a1cba';
const FS = 'w6GiKncSIYgmxfeeWXTiOhH1IWFqpvtv';
const FB = 'PZZwbEHRZa4uaPsgUUwc7qJCnhG';
const TU = 'tbl8MdOrJYDcLaF8';
const TB = 'tblfax0UiTK8SEhO';

// Token cache
let cachedToken = null;
let tokenExpiry = 0;

async function getToken() {
  const now = Date.now();
  if (cachedToken && now < tokenExpiry) return cachedToken;

  const resp = await fetch(BH + '/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: FA, app_secret: FS }),
  });
  const data = await resp.json();
  if (data.code !== 0) throw new Error('Feishu auth failed: ' + (data.msg || ''));
  cachedToken = data.tenant_access_token;
  tokenExpiry = now + (data.expire || 7200) * 1000 - 60000; // 1 min buffer
  return cachedToken;
}

async function feishuReq(method, path, body) {
  const token = await getToken();
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(BH + path, opts);
  return res.json();
}

// ── Users ──

app.route('/api/users')
  .get(async (req, res) => {
    try {
      const eid = req.query.employeeId;
      if (!eid) return res.status(400).json({ error: 'Missing employeeId' });
      const rd = await feishuReq(
        'GET',
        `/bitable/v1/apps/${FB}/tables/${TU}/records?filter=CurrentValue.[工号]="${encodeURIComponent(eid)}"&page_size=1`
      );
      const items = rd.data && rd.data.items;
      if (items && items.length > 0) {
        const f = items[0].fields;
        return res.json({
          id: f['工号'] || items[0].record_id,
          employeeId: f['工号'] || '',
          name: f['姓名'] || '',
          pi: f['导师'] || '',
          passwordHash: f['密码'] || '',
          role: 'user',
          createdAt: '',
        });
      }
      return res.json(null);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  })
  .post(async (req, res) => {
    try {
      const { employeeId, name, pi, passwordHash } = req.body || {};
      if (!employeeId) return res.status(400).json({ error: 'Missing employeeId' });
      const rd = await feishuReq(
        'POST',
        `/bitable/v1/apps/${FB}/tables/${TU}/records`,
        { fields: { '工号': employeeId, '姓名': name || '', '导师': pi || '', '密码': passwordHash || '' } }
      );
      if (rd.code !== 0) return res.status(500).json({ error: rd.msg || 'Feishu error' });
      return res.json({
        id: employeeId, employeeId, name: name || '', pi: pi || '',
        passwordHash: passwordHash || '', role: 'user', createdAt: new Date().toISOString(),
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

// ── Bookings ──

function toBooking(rec) {
  const f = rec.fields;
  return {
    id: rec.record_id,
    userId: f['预约人工号'] || '',
    userName: f['预约人姓名'] || '',
    userPi: f['预约人导师'] || '',
    userEmployeeId: f['预约人工号'] || '',
    labId: f['实验室ID'] || '',
    instrumentId: f['设备'] || '',
    subSlotId: f['副时段'] || '',
    date: f['日期'] ? String(f['日期']).slice(0, 10) : '',
    slot: f['开始时段'] || '',
    slotEnd: f['结束时段'] || '',
    pathogenName: f['病原体'] || '',
    bookingType: f['类型'] || 'slot',
    status: f['状态'] || '',
    createdAt: f['创建时间'] || '',
  };
}

app.route('/api/bookings')
  .get(async (req, res) => {
    try {
      const all = [];
      let pt = null;
      do {
        const apiPath = `/bitable/v1/apps/${FB}/tables/${TB}/records?page_size=200` + (pt ? '&page_token=' + pt : '');
        const rd = await feishuReq('GET', apiPath);
        if (rd.data && rd.data.items) {
          for (const it of rd.data.items) all.push(toBooking(it));
        }
        pt = rd.data && rd.data.has_more ? rd.data.page_token : null;
      } while (pt);
      res.json(all);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  })
  .post(async (req, res) => {
    try {
      const b = req.body;
      const rd = await feishuReq(
        'POST',
        `/bitable/v1/apps/${FB}/tables/${TB}/records`,
        {
          fields: {
            '预约人工号': b.userEmployeeId || b.userId || '',
            '预约人姓名': b.userName || '',
            '预约人导师': b.userPi || '',
            '设备': b.instrumentId || '',
            '实验室ID': b.labId || '',
            '日期': b.date ? new Date(b.date).getTime() : null,
            '开始时段': b.slot || '',
            '结束时段': b.slotEnd || '',
            '病原体': b.pathogenName || '',
            '副时段': b.subSlotId || '',
            '类型': b.bookingType || 'slot',
            '状态': '已预约',
            '创建时间': Date.now(),
          },
        }
      );
      if (rd.code !== 0) return res.status(500).json({ error: rd.msg || 'Feishu error' });
      const rec = rd.data && rd.data.record;
      return res.json({ success: true, id: rec ? rec.record_id : '' });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  })
  .patch(async (req, res) => {
    try {
      const bid = req.query.id;
      if (!bid) return res.status(400).json({ error: 'Missing id' });
      await feishuReq(
        'PUT',
        `/bitable/v1/apps/${FB}/tables/${TB}/records/${bid}`,
        { fields: { '状态': '已取消' } }
      );
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

// Health check
app.get('/', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Lab Booking API on port', PORT));
