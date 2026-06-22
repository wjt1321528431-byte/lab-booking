const FA = process.env.FEISHU_APP_ID;
const FS = process.env.FEISHU_APP_SECRET;
const FB = process.env.FEISHU_BASE_TOKEN;
const TB = process.env.FEISHU_TABLE_BOOKINGS;
const BH = 'https://open.feishu.cn/open-apis';

let tk = null, te = 0;

async function gt() {
  const n = Date.now();
  if (tk && n < te - 60000) return tk;
  const r = await fetch(BH + '/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: FA, app_secret: FS }),
  });
  const d = await r.json();
  tk = d.tenant_access_token;
  te = n + (d.expire || 7200) * 1000;
  return tk;
}

async function fr(method, path, body) {
  const token = await gt();
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(BH + path, opts);
  return res.json();
}

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

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { method, query, body } = req;

  try {
    // GET /api/bookings  →  list all bookings
    if (method === 'GET') {
      const all = [];
      let pt = null;
      do {
        const url =
          '/bitable/v1/apps/' + FB + '/tables/' + TB + '/records?page_size=200' +
          (pt ? '&page_token=' + pt : '');
        const rd = await fr('GET', url);
        if (rd.data && rd.data.items) {
          for (const it of rd.data.items) all.push(toBooking(it));
        }
        pt = rd.data && rd.data.has_more ? rd.data.page_token : null;
      } while (pt);
      return res.json(all);
    }

    // POST /api/bookings  →  create booking
    if (method === 'POST') {
      const b = body || {};
      const rd = await fr(
        'POST',
        '/bitable/v1/apps/' + FB + '/tables/' + TB + '/records',
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
        },
      );
      if (rd.code !== 0) return res.status(500).json({ error: rd.msg || 'Feishu error' });
      const rec = rd.data && rd.data.record;
      return res.json({
        success: true,
        id: rec ? rec.record_id : '',
      });
    }

    // PATCH /api/bookings?id=xxx  →  cancel
    if (method === 'PATCH') {
      const bid = query.id;
      if (!bid) return res.status(400).json({ error: 'Missing id' });
      await fr(
        'PUT',
        '/bitable/v1/apps/' + FB + '/tables/' + TB + '/records/' + bid,
        { fields: { '状态': '已取消' } },
      );
      return res.json({ success: true });
    }

    return res.status(404).json({ error: 'Not found' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
