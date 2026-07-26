// ============================================================
// POLLUP — Complete Backend (Cloudflare Pages Functions)
// D1 Binding: POLLUP_DB | Database: pollup-db
// ============================================================

const JWT_SECRET = 'pollup_jwt_secret_change_in_production_2024';
const SALT = 'pollup_salt_2024';
const TOKEN_EXPIRY = 30 * 24 * 60 * 60 * 1000;

// ─── Crypto ────────────────────────────────────────────────
async function sha256(text) {
  const enc = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hmacSign(data, secret) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

function base64url(str) {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return atob(str);
}

async function signToken(payload) {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64url(JSON.stringify(payload));
  const signature = await hmacSign(`${header}.${body}`, JWT_SECRET);
  return `${header}.${body}.${signature}`;
}

async function verifyToken(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const expectedSig = await hmacSign(`${parts[0]}.${parts[1]}`, JWT_SECRET);
    if (parts[2] !== expectedSig) return null;
    const payload = JSON.parse(base64urlDecode(parts[1]));
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch { return null; }
}

// ─── Helpers ────────────────────────────────────────────────
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Key'
    }
  });
}

function err(msg, status = 400) {
  return json({ error: msg }, status);
}

async function getUser(request) {
  const auth = request.headers.get('Authorization');
  if (!auth || !auth.startsWith('Bearer ')) return null;
  return await verifyToken(auth.slice(7));
}

// ─── Database Setup ─────────────────────────────────────────
async function ensureTables(db) {
  // System settings
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      val TEXT
    )
  `).run();

  // Users
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      userno TEXT UNIQUE,
      eml TEXT UNIQUE,
      pwd TEXT,
      nam TEXT,
      rol TEXT DEFAULT 'user',
      pln TEXT DEFAULT 'free',
      pln_exp INTEGER DEFAULT 0,
      sts INTEGER DEFAULT 1,
      ip_hash TEXT,
      cat INTEGER
    )
  `).run();

  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_u_no ON users(userno)`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_u_eml ON users(eml)`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_u_pln ON users(pln)`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_u_ip ON users(ip_hash)`).run();

  // Polls (options, results snapshot, reports all as JSON)
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS polls (
      id TEXT PRIMARY KEY,
      uid TEXT,
      tit TEXT,
      slg TEXT,
      sts INTEGER DEFAULT 1,
      typ INTEGER DEFAULT 0,
      clr TEXT DEFAULT '#1a73e8',
      pwd TEXT,
      exp INTEGER,
      opt TEXT,
      snap TEXT,
      rpt TEXT,
      ended INTEGER,
      cleaned INTEGER,
      cat INTEGER
    )
  `).run();

  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_p_uid ON polls(uid)`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_p_sts ON polls(sts)`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_p_slg ON polls(slg)`).run();

  // Votes (only for active polls — deleted on close)
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS votes (
      id TEXT PRIMARY KEY,
      pid TEXT,
      oid TEXT,
      fp TEXT,
      ip TEXT,
      cat INTEGER
    )
  `).run();

  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_v_pid ON votes(pid)`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_v_fp ON votes(pid, fp)`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_v_ip ON votes(pid, ip)`).run();

  // Admin passphrase
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS admin_keys (
      id TEXT PRIMARY KEY DEFAULT 'admin',
      salt TEXT,
      test TEXT,
      updated INTEGER
    )
  `).run();

  // Seed admin user
  const adminPwd = await sha256('secured_hidden');
  await db.prepare(`
    INSERT OR IGNORE INTO users (id, userno, eml, pwd, nam, rol, pln, sts, ip_hash, cat)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind('admin-001', '000000', 'admin@pollup.internal', adminPwd, 'Admin', 'admin', 'max', 1, 'seed', Date.now()).run();

  // Default settings
  await db.prepare(`INSERT OR IGNORE INTO settings (key, val) VALUES ('polling_enabled', '1')`).run();
  await db.prepare(`INSERT OR IGNORE INTO settings (key, val) VALUES ('site_name', 'PollUp')`).run();

  // Migrations
  const migrations = [
    "ALTER TABLE users ADD COLUMN ip_hash TEXT",
    "ALTER TABLE polls ADD COLUMN snap TEXT",
    "ALTER TABLE polls ADD COLUMN rpt TEXT",
    "ALTER TABLE polls ADD COLUMN ended INTEGER",
    "ALTER TABLE polls ADD COLUMN cleaned INTEGER"
  ];
  for (const sql of migrations) {
    try { await db.prepare(sql).run(); } catch {}
  }
}

// ─── System Status ──────────────────────────────────────────
async function isPollingEnabled(db) {
  const row = await db.prepare("SELECT val FROM settings WHERE key = 'polling_enabled'").first();
  return row && row.val === '1';
}

// ─── Admin Key Verification ─────────────────────────────────
async function verifyAdminKey(db, request) {
  const adminKey = request.headers.get('X-Admin-Key');
  if (!adminKey) return false;

  const ak = await db.prepare('SELECT * FROM admin_keys WHERE id = ?').bind('admin').first();
  if (!ak || !ak.test) return false;

  try {
    const keyRaw = Uint8Array.from(atob(adminKey), c => c.charCodeAt(0));
    const key = await crypto.subtle.importKey('raw', keyRaw, 'AES-GCM', false, ['decrypt']);
    const combined = Uint8Array.from(atob(ak.test), c => c.charCodeAt(0));
    const iv = combined.slice(0, 12);
    const data = combined.slice(12);
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
    return new TextDecoder().decode(decrypted) === '__admin_verify__';
  } catch {
    return false;
  }
}

// ─── Auth Handlers ──────────────────────────────────────────
async function handleAuth(method, path, body, db, request) {
  // POST /api/auth/signup
  if (method === 'POST' && path === '/auth/signup') {
    const { name, email, password } = body;
    if (!name || !email || !password) return err('Name, email, and password required');
    if (password.length < 6) return err('Password must be at least 6 characters');

    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const ipHash = await sha256(ip + SALT);

    const ipCount = await db.prepare('SELECT COUNT(*) as c FROM users WHERE ip_hash = ?').bind(ipHash).first();
    if (ipCount.c >= 2) return err('Account limit reached for this network. Maximum 2 accounts.', 403);

    const exists = await db.prepare('SELECT id FROM users WHERE eml = ?').bind(email).first();
    if (exists) return err('Email already registered');

    const id = crypto.randomUUID();
    const count = await db.prepare('SELECT COUNT(*) as c FROM users').first();
    const userno = String(count.c + 1).padStart(6, '0');
    const hashedPwd = await sha256(password);

    await db.prepare(
      'INSERT INTO users (id, userno, eml, pwd, nam, rol, pln, sts, ip_hash, cat) VALUES (?,?,?,?,?,?,?,?,?,?)'
    ).bind(id, userno, email, hashedPwd, name, 'user', 'free', 1, ipHash, Date.now()).run();

    const payload = { id, email, role: 'user', plan: 'free', exp: Date.now() + TOKEN_EXPIRY };
    const token = await signToken(payload);
    return json({ token, user: { id, userno, name, email, role: 'user', plan: 'free' } }, 201);
  }

  // POST /api/auth/login
  if (method === 'POST' && path === '/auth/login') {
    const { email, password } = body;
    if (!email || !password) return err('Email and password required');

    const hashedPwd = await sha256(password);
    const user = await db.prepare(
      'SELECT id, userno, eml, nam, rol, pln, pln_exp, sts FROM users WHERE eml = ? AND pwd = ?'
    ).bind(email, hashedPwd).first();

    if (!user) return err('Invalid email or password', 401);
    if (user.sts === 0) return err('Account blocked. Contact support.', 403);

    let plan = user.pln;
    if (user.pln_exp > 0 && user.pln_exp < Date.now() && user.pln !== 'free') {
      plan = 'free';
      await db.prepare('UPDATE users SET pln = ?, pln_exp = 0 WHERE id = ?').bind('free', user.id).run();
    }

    const payload = { id: user.id, email: user.eml, role: user.rol, plan, exp: Date.now() + TOKEN_EXPIRY };
    const token = await signToken(payload);
    return json({ token, user: { id: user.id, userno: user.userno, name: user.nam, email: user.eml, role: user.rol, plan } });
  }

  // GET /api/auth/me
  if (method === 'GET' && path === '/auth/me') {
    const u = await getUser(request);
    if (!u) return err('Unauthorized', 401);
    const user = await db.prepare('SELECT id, userno, eml, nam, rol, pln, pln_exp, sts FROM users WHERE id = ?').bind(u.id).first();
    if (!user || user.sts === 0) return err('Account blocked', 403);

    let plan = user.pln;
    if (user.pln_exp > 0 && user.pln_exp < Date.now() && user.pln !== 'free') plan = 'free';

    return json({ user: { id: user.id, userno: user.userno, name: user.nam, email: user.eml, role: user.rol, plan } });
  }

  return err('Not found', 404);
}

// ─── Poll Handlers (User) ───────────────────────────────────
async function handlePolls(method, path, body, db, request) {
  const user = await getUser(request);
  if (!user) return err('Unauthorized', 401);

  const u = await db.prepare('SELECT sts, pln, pln_exp FROM users WHERE id = ?').bind(user.id).first();
  if (!u || u.sts === 0) return err('Account blocked', 403);

  let plan = u.pln;
  if (u.pln_exp > 0 && u.pln_exp < Date.now() && u.pln !== 'free') plan = 'free';

  // GET /api/polls
  if (method === 'GET' && path === '/polls') {
    const { results } = await db.prepare(
      'SELECT id, tit, slg, sts, typ, clr, exp, opt, snap, cat, ended FROM polls WHERE uid = ? ORDER BY cat DESC LIMIT 50'
    ).bind(user.id).all();
    return json({ polls: results.map(p => ({ ...p, opt: p.opt ? JSON.parse(p.opt) : [], snap: p.snap ? JSON.parse(p.snap) : null })) });
  }

  // POST /api/polls
  if (method === 'POST' && path === '/polls') {
    if (!(await isPollingEnabled(db))) return err('Poll creation is temporarily disabled by the administrator', 503);

    const { title, options, multiple, color, endsAt } = body;
    if (!title || !options || options.length < 2) return err('Title and at least 2 options required');
    if (options.length > 20) return err('Maximum 20 options allowed');

    const limits = { free: 5, pro: 50, max: 999999 };
    const pollCount = await db.prepare('SELECT COUNT(*) as c FROM polls WHERE uid = ? AND sts = 1').bind(user.id).first();
    if (pollCount.c >= (limits[plan] || 5)) return err(`Your ${plan} plan allows ${limits[plan]} active polls. Upgrade to create more.`, 403);

    const id = crypto.randomUUID();
    const slug = id.slice(0, 8);
    const opts = options.map((text, i) => ({ id: crypto.randomUUID(), text, sort: i }));

    await db.prepare(
      'INSERT INTO polls (id, uid, tit, slg, sts, typ, clr, pwd, exp, opt, cat) VALUES (?,?,?,?,?,?,?,?,?,?,?)'
    ).bind(id, user.id, title, slug, 1, multiple ? 1 : 0, color || '#1a73e8', null, endsAt || null, JSON.stringify(opts), Date.now()).run();

    return json({ poll: { id, tit: title, slg: slug, sts: 1 } }, 201);
  }

  // GET /api/polls/:id
  const pollMatch = path.match(/^\/polls\/([a-zA-Z0-9-]+)$/);
  if (method === 'GET' && pollMatch) {
    const poll = await db.prepare('SELECT * FROM polls WHERE id = ? AND uid = ?').bind(pollMatch[1], user.id).first();
    if (!poll) return err('Poll not found', 404);

    if (poll.sts === 2 && poll.snap) {
      const snap = JSON.parse(poll.snap);
      return json({ poll: { ...poll, opt: JSON.parse(poll.opt || '[]'), results: snap, totalVotes: snap.reduce((s, r) => s + r.count, 0) } });
    }

    const { results: vr } = await db.prepare('SELECT oid, COUNT(*) as count FROM votes WHERE pid = ? GROUP BY oid').bind(poll.id).all();
    const opts = JSON.parse(poll.opt || '[]');
    const total = vr.reduce((s, v) => s + v.count, 0);
    const results = opts.map(o => ({
      id: o.id, text: o.text,
      count: (vr.find(v => v.oid === o.id) || {}).count || 0,
      percent: total > 0 ? Math.round((((vr.find(v => v.oid === o.id) || {}).count || 0) / total) * 100) : 0
    }));
    return json({ poll: { ...poll, opt: opts, results, totalVotes: total } });
  }

  // PUT /api/polls/:id
  if (method === 'PUT' && pollMatch) {
    const poll = await db.prepare('SELECT * FROM polls WHERE id = ? AND uid = ?').bind(pollMatch[1], user.id).first();
    if (!poll) return err('Poll not found', 404);
    if (poll.sts !== 1) return err('Cannot edit a poll that is not active', 403);

    const { title, color, endsAt } = body;
    if (title) await db.prepare('UPDATE polls SET tit = ? WHERE id = ?').bind(title, poll.id).run();
    if (color) await db.prepare('UPDATE polls SET clr = ? WHERE id = ?').bind(color, poll.id).run();
    if (endsAt !== undefined) await db.prepare('UPDATE polls SET exp = ? WHERE id = ?').bind(endsAt, poll.id).run();

    return json({ success: true });
  }

  // POST /api/polls/:id/close
  const closeMatch = path.match(/^\/polls\/([a-zA-Z0-9-]+)\/close$/);
  if (method === 'POST' && closeMatch) {
    const poll = await db.prepare('SELECT * FROM polls WHERE id = ? AND uid = ?').bind(closeMatch[1], user.id).first();
    if (!poll) return err('Poll not found', 404);
    if (poll.sts !== 1) return err('Poll is already closed', 403);

    const { results: vr } = await db.prepare('SELECT oid, COUNT(*) as count FROM votes WHERE pid = ? GROUP BY oid').bind(poll.id).all();
    const opts = JSON.parse(poll.opt || '[]');
    const results = opts.map(o => ({
      id: o.id, text: o.text,
      count: (vr.find(v => v.oid === o.id) || {}).count || 0
    }));
    const snap = JSON.stringify(results);

    await db.prepare('UPDATE polls SET sts = 2, snap = ?, ended = ?, cleaned = ? WHERE id = ?')
      .bind(snap, Date.now(), Date.now(), poll.id).run();
    await db.prepare('DELETE FROM votes WHERE pid = ?').bind(poll.id).run();

    return json({ success: true, results });
  }

  // DELETE /api/polls/:id
  if (method === 'DELETE' && pollMatch) {
    const poll = await db.prepare('SELECT id FROM polls WHERE id = ? AND uid = ?').bind(pollMatch[1], user.id).first();
    if (!poll) return err('Poll not found', 404);
    await db.prepare('DELETE FROM votes WHERE pid = ?').bind(poll.id).run();
    await db.prepare('DELETE FROM polls WHERE id = ?').bind(poll.id).run();
    return json({ success: true });
  }

  return err('Not found', 404);
}

// ─── Public Poll Handlers ───────────────────────────────────
async function handlePublic(method, path, body, db, request) {
  // GET /api/public/poll/:slug
  const slugMatch = path.match(/^\/public\/poll\/([a-zA-Z0-9-]+)$/);
  if (method === 'GET' && slugMatch) {
    const poll = await db.prepare('SELECT * FROM polls WHERE slg = ?').bind(slugMatch[1]).first();
    if (!poll) return err('Poll not found', 404);
    if (poll.sts === 0) return err('Poll is not available', 404);

    if (poll.sts === 1 && !(await isPollingEnabled(db))) {
      return json({ poll: { id: poll.id, tit: poll.tit, sts: poll.sts, typ: poll.typ, clr: poll.clr, exp: poll.exp, votingDisabled: true } });
    }

    if (poll.sts === 2 && poll.snap) {
      const snap = JSON.parse(poll.snap);
      return json({ poll: { id: poll.id, tit: poll.tit, sts: 2, typ: poll.typ, clr: poll.clr, exp: poll.exp, results: snap, totalVotes: snap.reduce((s, r) => s + r.count, 0) } });
    }

    const opts = JSON.parse(poll.opt || '[]');
    const { results: vr } = await db.prepare('SELECT oid, COUNT(*) as count FROM votes WHERE pid = ? GROUP BY oid').bind(poll.id).all();
    const total = vr.reduce((s, v) => s + v.count, 0);
    const results = opts.map(o => ({
      id: o.id, text: o.text,
      count: (vr.find(v => v.oid === o.id) || {}).count || 0,
      percent: total > 0 ? Math.round((((vr.find(v => v.oid === o.id) || {}).count || 0) / total) * 100) : 0
    }));
    return json({ poll: { id: poll.id, tit: poll.tit, sts: poll.sts, typ: poll.typ, clr: poll.clr, exp: poll.exp, opt: opts, results, totalVotes: total } });
  }

  // POST /api/public/poll/:slug/vote
  const voteMatch = path.match(/^\/public\/poll\/([a-zA-Z0-9-]+)\/vote$/);
  if (method === 'POST' && voteMatch) {
    if (!(await isPollingEnabled(db))) return err('Voting is temporarily paused', 503);

    const { option, fingerprint } = body;
    if (!option || !fingerprint) return err('Missing required fields', 400);

    const poll = await db.prepare('SELECT * FROM polls WHERE slg = ?').bind(voteMatch[1]).first();
    if (!poll) return err('Poll not found', 404);
    if (poll.sts !== 1) return err('Poll is not active', 403);
    if (poll.pwd) return err('This poll requires a password', 403);
    if (poll.exp && Date.now() > poll.exp) return err('This poll has ended', 410);

    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const ipHash = await sha256(ip + SALT);

    // Check fingerprint
    const fpVote = await db.prepare('SELECT id FROM votes WHERE pid = ? AND fp = ?').bind(poll.id, fingerprint).first();
    if (fpVote) return err('You have already voted on this poll', 409);

    // Check IP
    const ipVote = await db.prepare('SELECT id FROM votes WHERE pid = ? AND ip = ?').bind(poll.id, ipHash).first();
    if (ipVote) return err('You have already voted on this poll', 409);

    // Rate limit
    const recent = await db.prepare("SELECT COUNT(*) as c FROM votes WHERE ip = ? AND cat > ?").bind(ipHash, Date.now() - 60000).first();
    if (recent.c > 10) return err('Too many votes. Please slow down.', 429);

    // Validate option belongs to poll
    const opts = JSON.parse(poll.opt || '[]');
    if (!opts.find(o => o.id === option)) return err('Invalid option', 400);

    // Record vote
    await db.prepare('INSERT INTO votes (id, pid, oid, fp, ip, cat) VALUES (?,?,?,?,?,?)')
      .bind(crypto.randomUUID(), poll.id, option, fingerprint, ipHash, Date.now()).run();

    // Return updated results
    const { results: vr } = await db.prepare('SELECT oid, COUNT(*) as count FROM votes WHERE pid = ? GROUP BY oid').bind(poll.id).all();
    const total = vr.reduce((s, v) => s + v.count, 0);
    const results = opts.map(o => ({
      id: o.id, text: o.text,
      count: (vr.find(v => v.oid === o.id) || {}).count || 0,
      percent: total > 0 ? Math.round((((vr.find(v => v.oid === o.id) || {}).count || 0) / total) * 100) : 0
    }));

    return json({ voted: true, results, totalVotes: total });
  }

  // POST /api/public/poll/:slug/check
  const checkMatch = path.match(/^\/public\/poll\/([a-zA-Z0-9-]+)\/check$/);
  if (method === 'POST' && checkMatch) {
    const { fingerprint } = body;
    if (!fingerprint) return err('Fingerprint required', 400);

    const poll = await db.prepare('SELECT * FROM polls WHERE slg = ?').bind(checkMatch[1]).first();
    if (!poll) return err('Poll not found', 404);

    const fpVote = await db.prepare('SELECT id FROM votes WHERE pid = ? AND fp = ?').bind(poll.id, fingerprint).first();
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const ipHash = await sha256(ip + SALT);
    const ipVote = await db.prepare('SELECT id FROM votes WHERE pid = ? AND ip = ?').bind(poll.id, ipHash).first();

    return json({ voted: !!(fpVote || ipVote) });
  }

  // POST /api/public/poll/:slug/report
  const reportMatch = path.match(/^\/public\/poll\/([a-zA-Z0-9-]+)\/report$/);
  if (method === 'POST' && reportMatch) {
    const { reason } = body;
    if (!reason) return err('Reason is required', 400);

    const poll = await db.prepare('SELECT * FROM polls WHERE slg = ?').bind(reportMatch[1]).first();
    if (!poll) return err('Poll not found', 404);

    const reports = poll.rpt ? JSON.parse(poll.rpt) : [];
    reports.push({ reason, ts: Date.now() });
    await db.prepare('UPDATE polls SET rpt = ? WHERE id = ?').bind(JSON.stringify(reports), poll.id).run();

    return json({ success: true });
  }

  return err('Not found', 404);
}

// ─── Admin Handlers ─────────────────────────────────────────
async function handleAdmin(method, path, body, db, request) {
  // PUBLIC ENDPOINTS (no X-Admin-Key required)
  const publicPaths = [
    '/admin/check-passphrase',
    '/admin/setup-passphrase',
    '/admin/verify-passphrase'
  ];

  // Protected endpoints require valid X-Admin-Key
  if (!publicPaths.includes(path)) {
    const valid = await verifyAdminKey(db, request);
    if (!valid) return err('Unauthorized — invalid or missing admin key', 401);
  }

  // ─── Public: Check if passphrase exists ─────────────────
  if (method === 'GET' && path === '/admin/check-passphrase') {
    const ak = await db.prepare('SELECT salt, test FROM admin_keys WHERE id = ?').bind('admin').first();
    if (ak && ak.test) return json({ exists: true, salt: ak.salt });
    return json({ exists: false });
  }

  // ─── Public: First-time passphrase setup ────────────────
  if (method === 'POST' && path === '/admin/setup-passphrase') {
    const existing = await db.prepare('SELECT test FROM admin_keys WHERE id = ?').bind('admin').first();
    if (existing && existing.test) return err('Passphrase already set. Cannot overwrite.', 409);

    const { salt, testEncrypted } = body;
    if (!salt || !testEncrypted) return err('Salt and testEncrypted are required', 400);

    await db.prepare('INSERT OR REPLACE INTO admin_keys (id, salt, test, updated) VALUES (?,?,?,?)')
      .bind('admin', salt, testEncrypted, Date.now()).run();

    return json({ success: true, message: 'Admin passphrase set successfully' });
  }

  // ─── Public: Verify passphrase during login ─────────────
  if (method === 'POST' && path === '/admin/verify-passphrase') {
    const { key: keyBase64 } = body;
    if (!keyBase64) return err('Key is required', 400);

    const ak = await db.prepare('SELECT test FROM admin_keys WHERE id = ?').bind('admin').first();
    if (!ak || !ak.test) return json({ valid: false });

    try {
      const keyRaw = Uint8Array.from(atob(keyBase64), c => c.charCodeAt(0));
      const key = await crypto.subtle.importKey('raw', keyRaw, 'AES-GCM', false, ['decrypt']);
      const combined = Uint8Array.from(atob(ak.test), c => c.charCodeAt(0));
      const iv = combined.slice(0, 12);
      const data = combined.slice(12);
      const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
      return json({ valid: new TextDecoder().decode(decrypted) === '__admin_verify__' });
    } catch {
      return json({ valid: false });
    }
  }

  // ─── Protected: Dashboard stats ─────────────────────────
  if (method === 'GET' && path === '/admin/stats') {
    const uc = await db.prepare('SELECT COUNT(*) as c FROM users').first();
    const pc = await db.prepare('SELECT COUNT(*) as c FROM polls').first();
    const ac = await db.prepare('SELECT COUNT(*) as c FROM polls WHERE sts = 1').first();
    const vc = await db.prepare('SELECT COUNT(*) as c FROM votes').first();
    const fu = await db.prepare("SELECT COUNT(*) as c FROM users WHERE pln = 'free'").first();
    const pu = await db.prepare("SELECT COUNT(*) as c FROM users WHERE pln = 'pro'").first();
    const mu = await db.prepare("SELECT COUNT(*) as c FROM users WHERE pln = 'max'").first();
    const rp = await db.prepare("SELECT COUNT(*) as c FROM polls WHERE rpt IS NOT NULL AND rpt != '[]'").first();
    const pe = await db.prepare("SELECT val FROM settings WHERE key = 'polling_enabled'").first();

    return json({
      users: uc.c, polls: pc.c, activePolls: ac.c, votes: vc.c,
      freeUsers: fu.c, proUsers: pu.c, maxUsers: mu.c, reportedPolls: rp.c,
      pollingEnabled: pe && pe.val === '1'
    });
  }

  // ─── Protected: List/search users ───────────────────────
  if (method === 'GET' && path === '/admin/users') {
    const url = new URL(request.url);
    const q = url.searchParams.get('q') || '';
    const plan = url.searchParams.get('plan') || '';

    let sql = "SELECT id, userno, eml, nam, rol, pln, pln_exp, sts, cat FROM users WHERE rol != 'admin'";
    const params = [];

    if (q) {
      sql += ' AND (userno LIKE ? OR nam LIKE ? OR eml LIKE ?)';
      params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }
    if (plan && plan !== 'all') {
      sql += ' AND pln = ?';
      params.push(plan);
    }

    sql += ' ORDER BY cat DESC LIMIT 100';
    const { results } = await db.prepare(sql).bind(...params).all();
    return json({ users: results });
  }

  // ─── Protected: Block user ──────────────────────────────
  const blockMatch = path.match(/^\/admin\/user\/([a-zA-Z0-9-]+)\/block$/);
  if (method === 'POST' && blockMatch) {
    await db.prepare('UPDATE users SET sts = 0 WHERE id = ?').bind(blockMatch[1]).run();
    return json({ success: true });
  }

  // ─── Protected: Unblock user ────────────────────────────
  const unblockMatch = path.match(/^\/admin\/user\/([a-zA-Z0-9-]+)\/unblock$/);
  if (method === 'POST' && unblockMatch) {
    await db.prepare('UPDATE users SET sts = 1 WHERE id = ?').bind(unblockMatch[1]).run();
    return json({ success: true });
  }

  // ─── Protected: Grant plan to user ──────────────────────
  const grantMatch = path.match(/^\/admin\/user\/([a-zA-Z0-9-]+)\/grant$/);
  if (method === 'POST' && grantMatch) {
    const { plan, days } = body;
    if (!plan) return err('Plan is required', 400);
    const pln_exp = days ? Date.now() + (days * 24 * 60 * 60 * 1000) : 0;
    await db.prepare('UPDATE users SET pln = ?, pln_exp = ? WHERE id = ?').bind(plan, pln_exp, grantMatch[1]).run();
    return json({ success: true, message: `Plan updated to ${plan}` });
  }

  // ─── Protected: Delete user ─────────────────────────────
  const delUserMatch = path.match(/^\/admin\/user\/([a-zA-Z0-9-]+)$/);
  if (method === 'DELETE' && delUserMatch) {
    const userId = delUserMatch[1];
    const polls = await db.prepare('SELECT id FROM polls WHERE uid = ?').bind(userId).all();
    for (const p of polls.results) {
      await db.prepare('DELETE FROM votes WHERE pid = ?').bind(p.id).run();
    }
    await db.prepare('DELETE FROM polls WHERE uid = ?').bind(userId).run();
    await db.prepare('DELETE FROM users WHERE id = ?').bind(userId).run();
    return json({ success: true });
  }

  // ─── Protected: List/search all polls ───────────────────
  if (method === 'GET' && path === '/admin/polls') {
    const url = new URL(request.url);
    const q = url.searchParams.get('q') || '';
    const sts = url.searchParams.get('status') || '';

    let sql = 'SELECT p.*, u.userno, u.eml as owner_email FROM polls p JOIN users u ON p.uid = u.id WHERE 1=1';
    const params = [];

    if (q) {
      sql += ' AND (p.tit LIKE ? OR u.userno LIKE ? OR u.eml LIKE ?)';
      params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }
    if (sts && sts !== 'all') {
      sql += ' AND p.sts = ?';
      params.push(parseInt(sts));
    }

    sql += ' ORDER BY p.cat DESC LIMIT 50';
    const { results } = await db.prepare(sql).bind(...params).all();

    return json({
      polls: results.map(p => ({
        ...p,
        opt: p.opt ? JSON.parse(p.opt) : [],
        rpt: p.rpt ? JSON.parse(p.rpt) : [],
        reportCount: p.rpt ? JSON.parse(p.rpt).length : 0
      }))
    });
  }

  // ─── Protected: Block poll ──────────────────────────────
  const adminBlockP = path.match(/^\/admin\/poll\/([a-zA-Z0-9-]+)\/block$/);
  if (method === 'POST' && adminBlockP) {
    await db.prepare('UPDATE polls SET sts = 0 WHERE id = ?').bind(adminBlockP[1]).run();
    return json({ success: true });
  }

  // ─── Protected: Unblock poll ────────────────────────────
  const adminUnblockP = path.match(/^\/admin\/poll\/([a-zA-Z0-9-]+)\/unblock$/);
  if (method === 'POST' && adminUnblockP) {
    await db.prepare('UPDATE polls SET sts = 1 WHERE id = ?').bind(adminUnblockP[1]).run();
    return json({ success: true });
  }

  // ─── Protected: Delete poll ─────────────────────────────
  const adminDelP = path.match(/^\/admin\/poll\/([a-zA-Z0-9-]+)$/);
  if (method === 'DELETE' && adminDelP) {
    await db.prepare('DELETE FROM votes WHERE pid = ?').bind(adminDelP[1]).run();
    await db.prepare('DELETE FROM polls WHERE id = ?').bind(adminDelP[1]).run();
    return json({ success: true });
  }

  // ─── Protected: Storage stats ───────────────────────────
  if (method === 'GET' && path === '/admin/storage') {
    const tables = ['users', 'polls', 'votes', 'admin_keys', 'settings'];
    const est = { users: 300, polls: 500, votes: 80, admin_keys: 200, settings: 100 };
    const stats = [];
    let total = 0;

    for (const t of tables) {
      const c = await db.prepare(`SELECT COUNT(*) as c FROM ${t}`).first();
      const s = c.c * (est[t] || 200);
      total += s;
      stats.push({
        table: t, rows: c.c,
        estimatedSize: s < 1024 ? s + ' B' : s < 1048576 ? (s / 1024).toFixed(1) + ' KB' : (s / 1048576).toFixed(2) + ' MB'
      });
    }

    const fmt = (b) => b < 1024 ? b + ' B' : b < 1048576 ? (b / 1024).toFixed(1) + ' KB' : (b / 1048576).toFixed(2) + ' MB';

    return json({
      stats,
      totalSize: fmt(total),
      totalBytes: total,
      limitBytes: 5 * 1024 * 1024 * 1024,
      percentUsed: ((total / (5 * 1024 * 1024 * 1024)) * 100).toFixed(4),
      endedPolls: (await db.prepare("SELECT COUNT(*) as c FROM polls WHERE sts = 2 AND cleaned > 0").first()).c
    });
  }

  // ─── Protected: Force cleanup ───────────────────────────
  if (method === 'POST' && path === '/admin/cleanup') {
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    const r = await db.prepare('DELETE FROM polls WHERE sts = 2 AND cleaned < ? AND cleaned > 0').bind(sevenDaysAgo).run();
    return json({ success: true, deleted: r.changes || 0 });
  }

  // ─── Protected: Toggle polling ──────────────────────────
  if (method === 'POST' && path === '/admin/toggle-polling') {
    const current = await db.prepare("SELECT val FROM settings WHERE key = 'polling_enabled'").first();
    const newVal = (current && current.val === '1') ? '0' : '1';
    await db.prepare("UPDATE settings SET val = ? WHERE key = 'polling_enabled'").bind(newVal).run();
    return json({ success: true, pollingEnabled: newVal === '1' });
  }

  // ─── Protected: Get all settings ────────────────────────
  if (method === 'GET' && path === '/admin/settings') {
    const { results } = await db.prepare("SELECT * FROM settings").all();
    const s = {};
    for (const r of results) s[r.key] = r.val;
    return json({ settings: s });
  }

  // ─── Protected: Update setting ──────────────────────────
  if (method === 'POST' && path === '/admin/settings') {
    const { key, val } = body;
    if (!key) return err('Key is required', 400);
    await db.prepare("INSERT OR REPLACE INTO settings (key, val) VALUES (?,?)").bind(key, val).run();
    return json({ success: true });
  }

  return err('Not found', 404);
}

// ─── Main Export ────────────────────────────────────────────
export async function onRequest(context) {
  const { request, env } = context;
  const db = env.POLLUP_DB;
  const url = new URL(request.url);
  const path = url.pathname.replace('/api', '');
  const method = request.method;

  // CORS preflight
  if (method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Key',
        'Access-Control-Max-Age': '86400'
      }
    });
  }

  // Initialize tables (once per worker)
  if (!globalThis.__tablesReady) {
    await ensureTables(db);
    globalThis.__tablesReady = true;
  }

  // Auto-cleanup ended polls older than 7 days
  try {
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    await db.prepare('DELETE FROM polls WHERE sts = 2 AND cleaned < ? AND cleaned > 0').bind(sevenDaysAgo).run();
  } catch {}

  // Parse body
  let body = {};
  if (['POST', 'PUT', 'PATCH'].includes(method)) {
    try { body = await request.json(); } catch {}
  }

  // Route
  try {
    if (path.startsWith('/auth')) return handleAuth(method, path, body, db, request);
    if (path.startsWith('/polls')) return handlePolls(method, path, body, db, request);
    if (path.startsWith('/public')) return handlePublic(method, path, body, db, request);
    if (path.startsWith('/admin')) return handleAdmin(method, path, body, db, request);
    return err('Not found', 404);
  } catch (e) {
    return err('Server error', 500);
  }
}
