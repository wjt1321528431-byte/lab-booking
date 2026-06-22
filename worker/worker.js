const BH = 'https://open.feishu.cn/open-apis';

async function getToken(env) {
  const now = Date.now();
  const resp = await fetch(BH + '/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: env.FEISHU_APP_ID, app_secret: env.FEISHU_APP_SECRET }),
  });
  const data = await resp.json();
  return data.tenant_access_token;
}

async function feishuReq(env, method, path, body) {
  const token = await getToken(env);
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(BH + path, opts);
  return res.json();
}

function corsResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

// ── Users ──────────────────────────────────────────────────────────────

async function handleUsers(request, env) {
  const url = new URL(request.url);
  const method = request.method;

  // GET /api/users?employeeId=xxx
  if (method === 'GET') {
    const eid = url.searchParams.get('employeeId');
    if (!eid) return corsResponse({ error: 'Missing employeeId' }, 400);
    const rd = await feishuReq(
      env, 'GET',
      `/bitable/v1/apps/${env.FEISHU_BASE_TOKEN}/tables/${env.FEISHU_TABLE_USERS}/records?filter=CurrentValue.[工号]="${encodeURIComponent(eid)}"&page_size=1`
    );
    const items = rd.data && rd.data.items;
    if (items && items.length > 0) {
      const f = items[0].fields;
      return corsResponse({
        id: f['工号'] || items[0].record_id,
        employeeId: f['工号'] || '',
        name: f['姓名'] || '',
        pi: f['导师'] || '',
        passwordHash: f['密码'] || '',
        role: 'user',
        createdAt: '',
      });
    }
    return corsResponse(null);
  }

  // POST /api/users
  if (method === 'POST') {
    const body = await request.json();
    const { employeeId, name, pi, passwordHash } = body || {};
    if (!employeeId) return corsResponse({ error: 'Missing employeeId' }, 400);
    const rd = await feishuReq(
      env, 'POST',
      `/bitable/v1/apps/${env.FEISHU_BASE_TOKEN}/tables/${env.FEISHU_TABLE_USERS}/records`,
      { fields: { '工号': employeeId, '姓名': name || '', '导师': pi || '', '密码': passwordHash || '' } }
    );
    if (rd.code !== 0) return corsResponse({ error: rd.msg || 'Feishu error' }, 500);
    return corsResponse({
      id: employeeId,
      employeeId,
      name: name || '',
      pi: pi || '',
      passwordHash: passwordHash || '',
      role: 'user',
      createdAt: new Date().toISOString(),
    });
  }

  return corsResponse({ error: 'Not found' }, 404);
}

// ── Bookings ───────────────────────────────────────────────────────────

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

async function handleBookings(request, env) {
  const url = new URL(request.url);
  const method = request.method;

  // GET /api/bookings
  if (method === 'GET') {
    const all = [];
    let pt = null;
    do {
      const apiPath = `/bitable/v1/apps/${env.FEISHU_BASE_TOKEN}/tables/${env.FEISHU_TABLE_BOOKINGS}/records?page_size=200` + (pt ? '&page_token=' + pt : '');
      const rd = await feishuReq(env, 'GET', apiPath);
      if (rd.data && rd.data.items) {
        for (const it of rd.data.items) all.push(toBooking(it));
      }
      pt = rd.data && rd.data.has_more ? rd.data.page_token : null;
    } while (pt);
    return corsResponse(all);
  }

  // POST /api/bookings
  if (method === 'POST') {
    const b = await request.json();
    const rd = await feishuReq(
      env, 'POST',
      `/bitable/v1/apps/${env.FEISHU_BASE_TOKEN}/tables/${env.FEISHU_TABLE_BOOKINGS}/records`,
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
    if (rd.code !== 0) return corsResponse({ error: rd.msg || 'Feishu error' }, 500);
    const rec = rd.data && rd.data.record;
    return corsResponse({ success: true, id: rec ? rec.record_id : '' });
  }

  // PATCH /api/bookings?id=xxx
  if (method === 'PATCH') {
    const bid = url.searchParams.get('id');
    if (!bid) return corsResponse({ error: 'Missing id' }, 400);
    await feishuReq(
      env, 'PUT',
      `/bitable/v1/apps/${env.FEISHU_BASE_TOKEN}/tables/${env.FEISHU_TABLE_BOOKINGS}/records/${bid}`,
      { fields: { '状态': '已取消' } }
    );
    return corsResponse({ success: true });
  }

  return corsResponse({ error: 'Not found' }, 404);
}

// ── Main handler ───────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === '/api/users') return await handleUsers(request, env);
      if (path === '/api/bookings') return await handleBookings(request, env);
      return corsResponse({ error: 'Not found', path }, 404);
    } catch (e) {
      return corsResponse({ error: e.message }, 500);
    }
  },
};
