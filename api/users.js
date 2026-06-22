const FA = process.env.FEISHU_APP_ID;
const FS = process.env.FEISHU_APP_SECRET;
const FB = process.env.FEISHU_BASE_TOKEN;
const TU = process.env.FEISHU_TABLE_USERS;
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

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { method, query, body } = req;

  try {
    // GET /api/users?employeeId=xxx  →  find user by 工号
    if (method === 'GET') {
      const eid = query.employeeId;
      if (!eid) return res.status(400).json({ error: 'Missing employeeId' });
      const rd = await fr(
        'GET',
        '/bitable/v1/apps/' + FB + '/tables/' + TU +
          '/records?filter=CurrentValue.[工号]="' + encodeURIComponent(eid) + '"&page_size=1',
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
    }

    // POST /api/users  →  register
    if (method === 'POST') {
      const { employeeId, name, pi, passwordHash } = body || {};
      if (!employeeId) return res.status(400).json({ error: 'Missing employeeId' });
      const rd = await fr(
        'POST',
        '/bitable/v1/apps/' + FB + '/tables/' + TU + '/records',
        { fields: { '工号': employeeId, '姓名': name || '', '导师': pi || '', '密码': passwordHash || '' } },
      );
      if (rd.code !== 0) return res.status(500).json({ error: rd.msg || 'Feishu error' });
      return res.json({
        id: employeeId,
        employeeId,
        name: name || '',
        pi: pi || '',
        passwordHash: passwordHash || '',
        role: 'user',
        createdAt: new Date().toISOString(),
      });
    }

    return res.status(404).json({ error: 'Not found' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
