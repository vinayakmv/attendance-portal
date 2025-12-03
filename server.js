// server.js (UPDATED)
require('dotenv').config();

console.log('Loaded ADMIN_INVITE_CODE (len):', String(process.env.ADMIN_INVITE_CODE || '').length, 'value-preview:', (process.env.ADMIN_INVITE_CODE || '').slice(0,50));


const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const connectMongo = require('connect-mongo'); // supports v4+ or legacy
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const { stringify } = require('csv-stringify/sync');
const path = require('path');

const app = express();
// keep view engine if you want to keep old EJS pages as backup (not used by new static frontend)
app.set('view engine', 'ejs');

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));

// === CONFIG / ENV ===
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/attendance_portal';
const SESSION_SECRET = process.env.SESSION_SECRET || 'secret-demo';
const ENABLE_SETUP_ADMIN = (process.env.ENABLE_SETUP_ADMIN || 'false').toLowerCase() === 'true';

// === MONGOOSE / MONGO CONNECT ===
mongoose.connect(MONGODB_URI)
  .then(() => console.log('Mongoose connected'))
  .catch(err => {
    console.error('Mongoose connection error:', err && err.message ? err.message : err);
    process.exit(1);
  });

// === MODELS ===
const { Schema } = mongoose;
const userSchema = new Schema({
  name: String,
  email: { type: String, unique: true },
  passwordHash: String,
  role: { type: String, enum: ['student','admin'], default: 'student' },
  status: { type: String, enum: ['pending','active','declined'], default: 'pending' },
  createdAt: { type: Date, default: Date.now }
});
const User = mongoose.models.User || mongoose.model('User', userSchema);

// replace your attendanceSchema definition with this
const attendanceSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User' },
  date: String, // YYYY-MM-DD
  status: { type: String, enum: ['logged_in','logged_out'], default: 'logged_out' },
  lastToggledAt: Date,
  lastClockInAt: Date,   // NEW
  lastClockOutAt: Date   // NEW
});
attendanceSchema.index({ userId: 1, date: 1 }, { unique: true });

const Attendance = mongoose.models.Attendance || mongoose.model('Attendance', attendanceSchema);

// === SESSIONS (connect-mongo compatibility) ===
const createMongoStore = () => {
  // 1) If connect-mongo exports .create (v4+)
  try {
    if (connectMongo && typeof connectMongo.create === 'function') {
      return connectMongo.create({ mongoUrl: MONGODB_URI });
    }
    // 2) If connect-mongo is a function (legacy)
    if (typeof connectMongo === 'function') {
      const LegacyStore = connectMongo(session);
      return new LegacyStore({ mongooseConnection: mongoose.connection });
    }
  } catch (e) {
    // fallthrough to dynamic require below
  }

  // 3) Try dynamic require (edge cases)
  try {
    const pkg = require('connect-mongo');
    if (pkg && typeof pkg.create === 'function') return pkg.create({ mongoUrl: MONGODB_URI });
    if (typeof pkg === 'function') {
      const LegacyStore = pkg(session);
      return new LegacyStore({ mongooseConnection: mongoose.connection });
    }
  } catch (err) {
    console.warn('connect-mongo not available or failed to initialize:', err && err.message ? err.message : err);
  }

  return null; // use MemoryStore
};

const mongoStoreInstance = createMongoStore();

const sessionOptions = {
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 8 } // 8 hours
};

if (mongoStoreInstance) sessionOptions.store = mongoStoreInstance;
else console.warn('WARNING: Using default MemoryStore for sessions. Install connect-mongo for production persistence.');

app.use(session(sessionOptions));

// === MIDDLEWARE ===
// function requireAuth(req, res, next) {
//   if (!req.session.userId) return res.redirect('/login');
//   next();
// }
// function requireAdmin(req, res, next) {
//   if (!req.session.userId) return res.redirect('/login');
//   User.findById(req.session.userId).then(u => {
//     if (!u || u.role !== 'admin') return res.status(403).send('Forbidden');
//     req.user = u;
//     next();
//   }).catch(next);
// }

// server.js — improved auth middlewares (replace your existing requireAuth & requireAdmin)

function isAjaxRequest(req) {
  const accept = (req.headers['accept'] || '');
  return req.xhr || accept.includes('application/json') || req.headers['content-type'] === 'application/json';
}

function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    if (isAjaxRequest(req)) {
      return res.status(401).json({ ok:false, message: 'Not authenticated' });
    }
    return res.redirect('/login');
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session || !req.session.userId) {
    if (isAjaxRequest(req)) return res.status(401).json({ ok:false, message:'Not authenticated' });
    return res.redirect('/login');
  }
  User.findById(req.session.userId).then(u => {
    if (!u) {
      if (isAjaxRequest(req)) return res.status(401).json({ ok:false, message:'User not found' });
      return res.redirect('/login');
    }
    if (u.role !== 'admin') {
      if (isAjaxRequest(req)) return res.status(403).json({ ok:false, message:'Forbidden' });
      return res.status(403).send('Forbidden');
    }
    req.user = u;
    next();
  }).catch(err => {
    console.error('requireAdmin error', err);
    if (isAjaxRequest(req)) return res.status(500).json({ ok:false, message:'Server error' });
    next(err);
  });
}


const formatDate = (d = new Date()) => {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth()+1).padStart(2,'0');
  const dd = String(d.getDate()).padStart(2,'0');
  return `${yyyy}-${mm}-${dd}`;
};

// === ROUTES ===
// root -> login
app.get('/', (req, res) => res.redirect('/login'));

// Serve static frontend pages (instead of EJS)
app.get('/login', (req, res) => {
  return res.sendFile(path.join(__dirname, 'public', 'login.html'));
});
app.get('/register', (req, res) => {
  return res.sendFile(path.join(__dirname, 'public', 'register.html'));
});
app.get('/student', requireAuth, (req, res) => {
  // student dashboard is static; requireAuth ensures only logged-in users access
  return res.sendFile(path.join(__dirname, 'public', 'student_dashboard.html'));
});
app.get('/admin/dashboard', requireAdmin, (req, res) => {
  return res.sendFile(path.join(__dirname, 'public', 'admin_dashboard.html'));
});
app.get('/admin/new-requests', requireAdmin, (req, res) => {
  // serve the static page; the JS will call the JSON API to fetch pending list
  return res.sendFile(path.join(__dirname, 'public', 'new_request.html'));
});
app.get('/admin/calendar', requireAdmin, (req, res) => {
  return res.sendFile(path.join(__dirname, 'public', 'calendar.html'));
});
app.get('/view_data', requireAdmin, (req, res) => {
  return res.sendFile(path.join(__dirname, 'public', 'view_data.html'));
});

// TEMP: Delete all attendance records
app.get('/admin/delete-all-attendance', requireAdmin, async (req, res) => {
  await Attendance.deleteMany({});
  res.send('All attendance records deleted.');
});

app.get('/admin/delete-all-users', requireAdmin, async (req, res) => {
  await User.deleteMany({});
  res.send('All users deleted.');
});



// --- legacy EJS POST handlers kept for compatibility (optional) ---

app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const u = await User.findOne({ email });
  if (!u) return res.render('login', { error: 'Invalid credentials', registered: false });
  const ok = await bcrypt.compare(password, u.passwordHash);
  if (!ok) return res.render('login', { error: 'Invalid credentials', registered: false });
  if (u.role === 'student' && u.status !== 'active') {
    return res.render('login', { error: 'Account pending admin approval or declined', registered: false });
  }
  req.session.userId = u._id;
  if (u.role === 'admin') return res.redirect('/admin/dashboard');
  return res.redirect('/student');
});

// Logout (works the same)
app.get('/logout', (req, res) => req.session.destroy(()=>res.redirect('/login')));


// Preferred logout endpoint (POST) - used by modern frontend
app.post('/api/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.error('Session destroy error during logout:', err);
      return res.status(500).json({ ok:false, message: 'Logout failed' });
    }
    // Clear cookie on client (best-effort)
    res.clearCookie('connect.sid'); // or your session cookie name if different
    return res.json({ ok:true });
  });
});

// Optional backward-compatible GET route that redirects (keeps existing behavior)
app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});


// === API endpoints (JSON) for frontend integration ===

// POST /api/register
// secure register POST (replace your existing /register POST)
// ---- unified secure register route (handles form POSTs and API JSON) ----
// ---- Secure unified register route (form POST or fetch to /register or /api/register) ----
async function handleRegisterRequest(req, res) {
  try {
    // normalize incoming fields (form or JSON)
    const name = req.body.name && String(req.body.name).trim();
    const email = req.body.email && String(req.body.email).trim().toLowerCase();
    const password = req.body.password && String(req.body.password);
    const clientRole = String(req.body.role || req.body.userRole || '').toLowerCase();
    const inviteCode = req.body.inviteCode && String(req.body.inviteCode).trim();

    console.log('[REGISTER] incoming request:', { email, clientRole, fromJson: req.is('json') || req.xhr });

    // basic validation
    if (!name || !email || !password) {
      if (req.is('json') || req.xhr) return res.status(400).json({ ok:false, message:'All fields required' });
      return res.render('register', { error: 'All fields required' });
    }

    // default safe values
    let finalRole = 'student';
    let finalStatus = 'pending';

    // determine whether admin creation is allowed
    const envInvite = (process.env.ADMIN_INVITE_CODE || '').trim();
    let allowedToCreateAdmin = false;
    let allowedReason = null;

    // 1) allow if current logged-in session user is admin
    if (req.session && req.session.userId) {
      try {
        const currentUser = await User.findById(req.session.userId).select('role email');
        if (currentUser && currentUser.role === 'admin') {
          allowedToCreateAdmin = true;
          allowedReason = `creatorAdmin:${currentUser.email}`;
        }
      } catch (e) {
        console.warn('[REGISTER] error checking session user role', e && e.message ? e.message : e);
      }
    }

    // 2) allow if invite code present and matches env
    if (!allowedToCreateAdmin && clientRole === 'admin' && envInvite && inviteCode && inviteCode === envInvite) {
      allowedToCreateAdmin = true;
      allowedReason = 'invite-code';
    }

    // If client explicitly asked for admin but not allowed, reject (403) with message
    if (clientRole === 'admin' && !allowedToCreateAdmin) {
      console.warn('[REGISTER] blocked admin creation attempt for', email, 'reason: no-permission');
      if (req.is('json') || req.xhr) return res.status(403).json({ ok:false, message:'Not authorized to create admin' });
      return res.render('register', { error: 'You are not authorized to create an admin account.' });
    }

    // If allowed, make them admin (active); otherwise student & pending
    if (allowedToCreateAdmin && clientRole === 'admin') {
      finalRole = 'admin';
      finalStatus = 'active';
      console.log('[REGISTER] creating ADMIN account for', email, 'by', allowedReason);
    } else {
      // normal user
      finalRole = 'student';
      finalStatus = 'pending';
      console.log('[REGISTER] creating STUDENT account for', email);
    }

    // create user
    const passwordHash = await bcrypt.hash(password, 10);
    const created = await User.create({
      name,
      email,
      passwordHash,
      role: finalRole,
      status: finalStatus
    });

    // success response (JSON vs HTML)
    if (req.is('json') || req.xhr) {
      return res.json({ ok:true, message:'Registered', userId: created._id, role: finalRole });
    }
    return res.redirect('/login?registered=1');

  } catch (err) {
    console.error('[REGISTER] error:', err && err.message ? err.message : err);
    if (req.is('json') || req.xhr) {
      return res.status(400).json({ ok:false, message:'Registration failed or email exists' });
    }
    return res.render('register', { error: 'Email may already exist' });
  }
}

// Mount at both /register and /api/register for compatibility
app.post('/register', handleRegisterRequest);
app.post('/api/register', handleRegisterRequest);







// POST /api/login
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  const u = await User.findOne({ email });
  if (!u) return res.status(401).json({ ok:false, message: 'Invalid credentials' });
  const ok = await bcrypt.compare(password, u.passwordHash);
  if (!ok) return res.status(401).json({ ok:false, message: 'Invalid credentials' });
  if (u.role === 'student' && u.status !== 'active') {
    return res.status(403).json({ ok:false, message: 'Account pending admin approval or declined' });
  }
  req.session.userId = u._id;
  res.json({ ok:true, role: u.role, name: u.name });
});

// GET /api/me
app.get('/api/me', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ ok:false });
  const u = await User.findById(req.session.userId).select('name email role status');
  res.json({ ok:true, user: u });
});

// Student status & toggle
app.get('/api/student/status', requireAuth, async (req, res) => {
  const today = formatDate();
  const att = await Attendance.findOne({ userId: req.session.userId, date: today });
  res.json({ ok:true, status: att ? att.status : 'logged_out' });
});

app.post('/api/student/toggle', requireAuth, async (req, res) => {
  const u = await User.findById(req.session.userId);
  if (!u || u.role !== 'student') return res.status(403).json({ ok:false, message: 'Forbidden' });

  const today = formatDate();
  let att = await Attendance.findOne({ userId: u._id, date: today });

  const now = new Date();
  const nextStatus = (!att || att.status === 'logged_out') ? 'logged_in' : 'logged_out';

  if (!att) {
    att = new Attendance({ userId: u._id, date: today, status: nextStatus, lastToggledAt: now });
  } else {
    att.status = nextStatus;
    att.lastToggledAt = now;
  }

  // maintain explicit clockIn/clockOut fields for better UI/history
  if (nextStatus === 'logged_in') {
    // record lastClockInAt (overwrite with most recent in)
    att.lastClockInAt = now;
  } else {
    // record lastClockOutAt
    att.lastClockOutAt = now;
  }

  await att.save();
  res.json({
    ok: true,
    status: nextStatus,
    timestamp: att.lastToggledAt,
    lastClockInAt: att.lastClockInAt || null,
    lastClockOutAt: att.lastClockOutAt || null
  });
});


// Admin APIs
app.get('/api/admin/new-requests', requireAdmin, async (req, res) => {
  const pending = await User.find({ role: 'student', status: 'pending' }).sort({ createdAt: 1 });
  res.json({ ok:true, pending });
});

// Accept / Decline (JSON API)
app.post('/api/admin/requests/:id/:action', requireAdmin, async (req, res) => {
  const { id, action } = req.params;
  if (!['accept','decline'].includes(action)) return res.status(400).json({ ok:false, message: 'Bad action' });
  const u = await User.findById(id);
  if (!u) return res.status(404).json({ ok:false, message: 'User not found' });
  u.status = (action === 'accept') ? 'active' : 'declined';
  await u.save();
  res.json({ ok:true });
});

// Attendance list by date (admin)
app.get('/api/admin/attendance-by-date', requireAdmin, async (req, res) => {
  const date = req.query.date || formatDate();
  const students = await User.find({ role:'student', status:'active' }).sort({ name:1 });
  const atts = await Attendance.find({ date });
  const attMap = {};
  atts.forEach(a => { attMap[a.userId.toString()] = a; });
const list = students.map(s => {
  const a = attMap[s._id.toString()];
  return {
    _id: s._id,
    name: s.name,
    email: s.email,
    status: a ? a.status : 'logged_out',
    lastToggledAt: a ? a.lastToggledAt : null,
    lastClockInAt: a ? a.lastClockInAt : null,
    lastClockOutAt: a ? a.lastClockOutAt : null
  };
});


  res.json({ ok:true, date, list });
});

// Keep your CSV report endpoint (admin)
app.get('/admin/report', requireAdmin, async (req, res) => {
  const { date, from, to } = req.query;
  let dates = [];
  if (date) dates = [date];
  else if (from && to) {
    const start = new Date(from); const end = new Date(to);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate()+1)) dates.push(formatDate(new Date(d)));
  } else dates = [formatDate()];
  const students = await User.find({ role:'student', status:'active' }).sort({ name:1 });
  const rows = [['Name','Email','Date','Status','LastToggledAt']];
  for (const d of dates) {
    const atts = await Attendance.find({ date: d });
    const map = {}; atts.forEach(a => { map[a.userId.toString()] = a; });
    for (const s of students) {
      const a = map[s._id.toString()];
      rows.push([s.name, s.email, d, a ? a.status : 'logged_out', a && a.lastToggledAt ? a.lastToggledAt.toISOString() : '']);
    }
  }
  const csv = stringify(rows);
  res.setHeader('Content-disposition', `attachment; filename=attendance_${dates[0]}.csv`);
  res.setHeader('Content-type', 'text/csv');
  res.send(csv);
});

// Dev bootstrap for admin (guarded)
if (ENABLE_SETUP_ADMIN) {
  app.get('/setup-admin', async (req, res) => {
    const anyAdmin = await User.findOne({ role: 'admin' });
    if (anyAdmin) return res.send('Admin exists');
    const passwordHash = await bcrypt.hash('admin123', 10);
    await User.create({ name: 'Admin', email: 'admin@example.com', passwordHash, role: 'admin', status: 'active' });
    res.send('Admin created: admin@example.com / admin123');
  });
} else {
  // remove route if accidentally left
  app.get('/setup-admin', (req, res) => res.status(404).send('Not found'));
}

// server.js — add this (Admin: recent activity)
// GET /api/admin/recent-activity -> returns latest attendance toggles (most recent first)
app.get('/api/admin/recent-activity', requireAdmin, async (req, res) => {
  try {
    // find recent attendance records (that have lastToggledAt), newest first
    const recent = await Attendance.find({ lastToggledAt: { $ne: null } })
      .sort({ lastToggledAt: -1 })
      .limit(15)
      .populate('userId', 'name email'); // bring user name/email

    // map to simpler shape for frontend
    const list = recent.map(r => ({
      userId: r.userId ? r.userId._id : null,
      name: r.userId ? r.userId.name : 'Unknown',
      email: r.userId ? r.userId.email : '',
      status: r.status,                 // 'logged_in' or 'logged_out'
      timestamp: r.lastToggledAt
    }));

    res.json({ ok: true, list });
  } catch (err) {
    console.error('recent-activity error:', err && err.message ? err.message : err);
    res.status(500).json({ ok: false, message: 'Server error' });
  }
});


// === START SERVER ===
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
app.listen(PORT, HOST, ()=>console.log(`Listening on ${HOST}:${PORT}`));
