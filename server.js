// server.js (CLEAN, UPDATED)
// - PendingRequest model: students create pending requests; admin accepts -> creates User
// - Adds batch field to User & Attendance
// - Fixes batch undefined crash and attendance-by-date duplicate responses
// - Maintains previous features: login, toggle, lunch start/end, admin recent activity, csv

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
app.set('view engine', 'ejs');

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));

// === CONFIG / ENV ===
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/attendance_portal';
const SESSION_SECRET = process.env.SESSION_SECRET || 'secret-demo';
const ENABLE_SETUP_ADMIN = (process.env.ENABLE_SETUP_ADMIN || 'false').toLowerCase() === 'true';

// Simple batch deadlines map (you can change times here: hour, minute)
const BATCH_DEADLINES = {
  batch1: { hour: 10, minute: 0 },   // 10:00
  batch2: { hour: 11, minute: 0 },   // 11:00
  batch3: { hour: 9, minute: 30 }    // 09:30
};

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
  batch: { type: String, enum: ['batch1','batch2','batch3'], default: 'batch1' },
  createdAt: { type: Date, default: Date.now }
});
const User = mongoose.models.User || mongoose.model('User', userSchema);

// Pending requests: stored until admin accepts. Contains hashed password so you can create user later.
const pendingRequestSchema = new Schema({
  name: String,
  email: { type: String, unique: true },
  passwordHash: String,
  batch: { type: String, enum: ['batch1','batch2','batch3'], default: 'batch1' },
  createdAt: { type: Date, default: Date.now }
});
const PendingRequest = mongoose.models.PendingRequest || mongoose.model('PendingRequest', pendingRequestSchema);

// Attendance schema with clock-in/out & lunch fields + batch
const attendanceSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User' },
  date: String, // YYYY-MM-DD
  status: { type: String, enum: ['logged_in','logged_out'], default: 'logged_out' },
  lastToggledAt: Date,
  lastClockInAt: Date,
  lastClockOutAt: Date,
  // Lunch fields
  lunchStartAt: Date,
  lunchEndAt: Date,
  lunchDurationMins: Number,
  lunchOvertime: { type: Boolean, default: false },
  batch: { type: String, enum: ['batch1','batch2','batch3'], default: 'batch1' }
});
attendanceSchema.index({ userId: 1, date: 1 }, { unique: true });
const Attendance = mongoose.models.Attendance || mongoose.model('Attendance', attendanceSchema);

// === SESSIONS (connect-mongo compatibility) ===
const createMongoStore = () => {
  try {
    if (connectMongo && typeof connectMongo.create === 'function') {
      return connectMongo.create({ mongoUrl: MONGODB_URI });
    }
    if (typeof connectMongo === 'function') {
      const LegacyStore = connectMongo(session);
      return new LegacyStore({ mongooseConnection: mongoose.connection });
    }
  } catch (e) {}
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
  return null;
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
function isAjaxRequest(req) {
  const accept = (req.headers['accept'] || '');
  return req.xhr || accept.includes('application/json') || req.headers['content-type'] === 'application/json';
}
function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    if (isAjaxRequest(req)) return res.status(401).json({ ok:false, message: 'Not authenticated' });
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

// Serve static frontend pages
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/register', (req, res) => res.sendFile(path.join(__dirname, 'public', 'register.html')));
app.get('/student', requireAuth, (req, res) => res.sendFile(path.join(__dirname, 'public', 'student_dashboard.html')));
app.get('/admin/dashboard', requireAdmin, (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin_dashboard.html')));
app.get('/admin/new-requests', requireAdmin, (req, res) => res.sendFile(path.join(__dirname, 'public', 'new_request.html')));
app.get('/admin/calendar', requireAdmin, (req, res) => res.sendFile(path.join(__dirname, 'public', 'calendar.html')));
app.get('/view_data', requireAdmin, (req, res) => res.sendFile(path.join(__dirname, 'public', 'view_data.html')));

// Admin temp deletes
app.get('/admin/delete-all-attendance', requireAdmin, async (req, res) => { await Attendance.deleteMany({}); res.send('All attendance records deleted.'); });
app.get('/admin/delete-all-users', requireAdmin, async (req, res) => { await User.deleteMany({}); res.send('All users deleted.'); });

// Legacy EJS handlers (kept for compatibility)
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
app.get('/logout', (req, res) => req.session.destroy(()=>res.redirect('/login')));
app.post('/api/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) { console.error('Session destroy error during logout:', err); return res.status(500).json({ ok:false, message: 'Logout failed' }); }
    res.clearCookie('connect.sid');
    return res.json({ ok:true });
  });
});

// GET /api/admin/user-records?user=ID&year=2025&month=12
// GET /api/admin/user-records?user=ID&year=2025&month=12
app.get('/api/admin/user-records', requireAdmin, async (req, res) => {
  try {
    const { user, year, month } = req.query;

    if (!user || !year || !month) {
      return res.status(400).json({ ok:false, message: 'Missing parameters: user, year, month required' });
    }

    // month should be 1-12; normalize to two digits
    const mm = String(parseInt(month, 10)).padStart(2, '0');

    // match dates like "2025-07-.." using prefix regex
    const prefix = `${year}-${mm}`;
    const records = await Attendance.find({ userId: user, date: { $regex: `^${prefix}` } }).sort({ date: 1 }).lean();

    const formatted = records.map(r => ({
      date: r.date,
      clockIn: r.lastClockInAt ? new Date(r.lastClockInAt).toLocaleTimeString() : null,
      clockOut: r.lastClockOutAt ? new Date(r.lastClockOutAt).toLocaleTimeString() : null,
      lunchStart: r.lunchStartAt ? new Date(r.lunchStartAt).toLocaleTimeString() : null,
      lunchEnd: r.lunchEndAt ? new Date(r.lunchEndAt).toLocaleTimeString() : null
    }));

    return res.json({ ok:true, records: formatted });
  } catch (err) {
    console.error('/api/admin/user-records error', err && err.message ? err.message : err);
    return res.status(500).json({ ok:false, message: 'Server error' });
  }
});



// === REGISTRATION (Pending flow) ===
async function handleRegisterRequest(req, res) {
  try {
    // normalize incoming fields
    const name = req.body.name && String(req.body.name).trim();
    const email = req.body.email && String(req.body.email).trim().toLowerCase();
    const password = req.body.password && String(req.body.password);
    const clientRole = String(req.body.role || req.body.userRole || '').toLowerCase();
    const inviteCode = req.body.inviteCode && String(req.body.inviteCode).trim();
    const batch = (req.body.batch && String(req.body.batch).toLowerCase()) || 'batch1';

    console.log('[REGISTER] incoming request:', { email, clientRole, batch, fromJson: req.is('json') || req.xhr });

    // validation
    if (!name || !email || !password) {
      if (req.is('json') || req.xhr) return res.status(400).json({ ok:false, message:'All fields required' });
      return res.render('register', { error: 'All fields required' });
    }
    // ensure batch allowed
    const allowedBatches = ['batch1','batch2','batch3'];
    const finalBatch = allowedBatches.includes(batch) ? batch : 'batch1';

    // default
    let finalRole = 'student';
    let finalStatus = 'pending';

    // determine admin creation permission
    const envInvite = (process.env.ADMIN_INVITE_CODE || '').trim();
    let allowedToCreateAdmin = false;
    let allowedReason = null;

    // 1) current session admin allowed
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
    // 2) invite code
    if (!allowedToCreateAdmin && clientRole === 'admin' && envInvite && inviteCode && inviteCode === envInvite) {
      allowedToCreateAdmin = true;
      allowedReason = 'invite-code';
    }

    // If trying to create admin but not allowed -> reject
    if (clientRole === 'admin' && !allowedToCreateAdmin) {
      console.warn('[REGISTER] blocked admin creation attempt for', email, 'reason: no-permission');
      if (req.is('json') || req.xhr) return res.status(403).json({ ok:false, message:'Not authorized to create admin' });
      return res.render('register', { error: 'You are not authorized to create an admin account.' });
    }

    // If allowed to create admin, create User immediately with active status
    if (allowedToCreateAdmin && clientRole === 'admin') {
      finalRole = 'admin';
      finalStatus = 'active';
      console.log('[REGISTER] creating ADMIN account for', email, 'by', allowedReason);

      const passwordHash = await bcrypt.hash(password, 10);
      const created = await User.create({
        name,
        email,
        passwordHash,
        role: finalRole,
        status: finalStatus,
        batch: finalBatch
      });
      if (req.is('json') || req.xhr) return res.json({ ok:true, message:'Admin created', userId: created._id, role: finalRole });
      return res.redirect('/login?registered=1');
    }

    // Otherwise: create a PendingRequest (do NOT add to User)
    // If an existing pending request exists with same email -> respond accordingly
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      if (req.is('json') || req.xhr) return res.status(400).json({ ok:false, message:'Account already exists' });
      return res.render('register', { error: 'Account already exists' });
    }
    const existingPending = await PendingRequest.findOne({ email });
    if (existingPending) {
      if (req.is('json') || req.xhr) return res.json({ ok:true, message:'Registration request already submitted' });
      return res.render('register', { error: 'Registration request already submitted' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const pending = await PendingRequest.create({
      name,
      email,
      passwordHash,
      batch: finalBatch
    });

    // success
    if (req.is('json') || req.xhr) {
      return res.json({ ok:true, message:'Registration request submitted. Await admin approval.' });
    }
    return res.redirect('/login?registered=1');

  } catch (err) {
    console.error('[REGISTER] error:', err && err.message ? err.message : err);
    if (req.is('json') || req.xhr) return res.status(400).json({ ok:false, message:'Registration failed' });
    return res.render('register', { error: 'Registration failed' });
  }
}
app.post('/register', handleRegisterRequest);
app.post('/api/register', handleRegisterRequest);

// POST /api/login (API)
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

// POST /api/me/update-batch  -> body { batch: 'batch1' }
app.post('/api/me/update-batch', requireAuth, async (req, res) => {
  try {
    const batch = String((req.body && req.body.batch) || '').toLowerCase();
    const allowed = ['batch1','batch2','batch3'];
    if (!allowed.includes(batch)) return res.status(400).json({ ok:false, message: 'Bad batch' });
    const u = await User.findById(req.session.userId);
    if (!u) return res.status(404).json({ ok:false, message: 'User not found' });
    u.batch = batch;
    await u.save();
    return res.json({ ok:true, batch: u.batch });
  } catch (err) {
    console.error('update-batch error', err);
    return res.status(500).json({ ok:false, message: 'Server error' });
  }
});


// GET /api/me
app.get('/api/me', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ ok:false });
  const u = await User.findById(req.session.userId).select('name email role status batch');
  res.json({ ok:true, user: u });
});

// Student status & toggle (clock in/out) - writes lastClockInAt / lastClockOutAt + batch from user
// --- GET /api/student/status ---
// Returns cleaned/consistent timestamps so client can reliably display them
app.get('/api/student/status', requireAuth, async (req, res) => {
  try {
    const today = formatDate();
    const att = await Attendance.findOne({ userId: req.session.userId, date: today }).lean();

    if (!att) {
      return res.json({
        ok: true,
        status: 'logged_out',
        lastClockInAt: null,
        lastClockOutAt: null,
        lunchStartAt: null,
        lunchEndAt: null,
        lunchDurationMins: null,
        lunchOvertime: false
      });
    }

    // Clean inconsistent timestamps: if out < in then ignore out (return null)
    let safeClockIn = att.lastClockInAt ? new Date(att.lastClockInAt) : null;
    let safeClockOut = att.lastClockOutAt ? new Date(att.lastClockOutAt) : null;
    if (safeClockIn && safeClockOut && safeClockOut.getTime() < safeClockIn.getTime()) {
      // prefer to not return a misleading earlier out time
      safeClockOut = null;
    }

    // Lunch cleaning: ignore lunchEnd if earlier than lunchStart
    let safeLunchStart = att.lunchStartAt ? new Date(att.lunchStartAt) : null;
    let safeLunchEnd = att.lunchEndAt ? new Date(att.lunchEndAt) : null;
    if (safeLunchStart && safeLunchEnd && safeLunchEnd.getTime() < safeLunchStart.getTime()) {
      safeLunchEnd = null;
    }

    // Determine status reliably: if there's an in and no valid out => logged_in
    const status = (safeClockIn && !safeClockOut) ? 'logged_in' : (att.status || 'logged_out');

    return res.json({
      ok: true,
      status,
      lastClockInAt: safeClockIn ? safeClockIn.toISOString() : null,
      lastClockOutAt: safeClockOut ? safeClockOut.toISOString() : null,
      lunchStartAt: safeLunchStart ? safeLunchStart.toISOString() : null,
      lunchEndAt: safeLunchEnd ? safeLunchEnd.toISOString() : null,
      lunchDurationMins: att.lunchDurationMins != null ? att.lunchDurationMins : null,
      lunchOvertime: !!att.lunchOvertime
    });
  } catch (err) {
    console.error('/api/student/status error', err);
    return res.status(500).json({ ok:false, message: 'Server error' });
  }
});


// --- POST /api/student/toggle ---
// Ensures clockOut >= lastClockInAt and returns timestamps
app.post('/api/student/toggle', requireAuth, async (req, res) => {
  try {
    const u = await User.findById(req.session.userId);
    if (!u || u.role !== 'student') return res.status(403).json({ ok:false, message: 'Forbidden' });

    const today = formatDate();
    let att = await Attendance.findOne({ userId: u._id, date: today });

    const now = new Date();
    const nextStatus = (!att || att.status === 'logged_out') ? 'logged_in' : 'logged_out';

    if (!att) {
      att = new Attendance({
        userId: u._id,
        date: today,
        status: nextStatus,
        lastToggledAt: now,
        batch: u.batch || 'batch1'
      });
    } else {
      att.status = nextStatus;
      att.lastToggledAt = now;
      att.batch = u.batch || att.batch || 'batch1';
    }

    if (nextStatus === 'logged_in') {
      // Start a fresh session: set lastClockInAt to server now and clear any prior lastClockOutAt for that day
      att.lastClockInAt = now;
      att.lastClockOutAt = null;
    } else {
      // Clock out: ensure out >= lastClockInAt (avoid showing an earlier out)
      let outTime = now;
      if (att.lastClockInAt && outTime.getTime() < new Date(att.lastClockInAt).getTime()) {
        // adjust to at least lastClockInAt
        outTime = new Date(att.lastClockInAt);
        att.notes = (att.notes || '') + `| adjustedClockOut:${now.toISOString()}->${outTime.toISOString()}`;
      }
      att.lastClockOutAt = outTime;
    }

    await att.save();

    // Return cleaned values (string ISO or null)
    const safeClockIn = att.lastClockInAt ? new Date(att.lastClockInAt) : null;
    const safeClockOut = att.lastClockOutAt ? new Date(att.lastClockOutAt) : null;
    return res.json({
      ok: true,
      status: att.status,
      lastClockInAt: safeClockIn ? safeClockIn.toISOString() : null,
      lastClockOutAt: safeClockOut ? safeClockOut.toISOString() : null,
      timestamp: att.lastToggledAt ? att.lastToggledAt.toISOString() : null,
      message: nextStatus === 'logged_in' ? 'Clocked in' : 'Clocked out'
    });
  } catch (err) {
    console.error('/api/student/toggle error', err);
    res.status(500).json({ ok:false, message: 'Server error' });
  }
});


// Lunch start/end endpoints
// --- POST /api/student/lunch/start ---
app.post('/api/student/lunch/start', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const today = formatDate();
    let att = await Attendance.findOne({ userId, date: today });
    if (!att) {
      // create an attendance doc if not present; assume logged_in
      const u = await User.findById(userId);
      att = new Attendance({ userId, date: today, status: 'logged_in', lastToggledAt: new Date(), batch: u ? u.batch : 'batch1' });
    }

    // set lunchStartAt to now and clear any prior lunchEnd/duration
    att.lunchStartAt = new Date();
    att.lunchEndAt = null;
    att.lunchDurationMins = null;
    att.lunchOvertime = false;
    await att.save();
    return res.json({ ok:true, lunchStartAt: att.lunchStartAt.toISOString() });
  } catch (err) {
    console.error('/api/student/lunch/start error', err);
    res.status(500).json({ ok:false, message: 'Server error' });
  }
});


// --- POST /api/student/lunch/end ---
app.post('/api/student/lunch/end', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const today = formatDate();
    const att = await Attendance.findOne({ userId, date: today });
    if (!att || !att.lunchStartAt) return res.status(400).json({ ok:false, message: 'Lunch not started' });

    let endTime = new Date();
    const startTime = new Date(att.lunchStartAt);

    // Guard: end must not be earlier than start
    if (endTime.getTime() < startTime.getTime()) {
      // adjust end to start -- record adjustment as note
      att.notes = (att.notes || '') + `| adjustedLunchEnd:${endTime.toISOString()}->${startTime.toISOString()}`;
      endTime = startTime;
    }

    att.lunchEndAt = endTime;
    const durationMs = att.lunchEndAt.getTime() - startTime.getTime();
    const durationMins = Math.round(durationMs / 60000);
    att.lunchDurationMins = durationMins >= 0 ? durationMins : 0;
    att.lunchOvertime = durationMins > 30;
    await att.save();

    return res.json({
      ok: true,
      lunchStartAt: att.lunchStartAt ? new Date(att.lunchStartAt).toISOString() : null,
      lunchEndAt: att.lunchEndAt ? att.lunchEndAt.toISOString() : null,
      lunchDurationMins: att.lunchDurationMins,
      lunchOvertime: att.lunchOvertime
    });
  } catch (err) {
    console.error('/api/student/lunch/end error', err);
    res.status(500).json({ ok:false, message: 'Server error' });
  }
});


// === ADMIN: pending requests ===
// Return pending registration requests
app.get('/api/admin/new-requests', requireAdmin, async (req, res) => {
  const pending = await PendingRequest.find({}).sort({ createdAt: 1 }).lean();
  res.json({ ok:true, pending });
});

// Accept / Decline pending request (admin)
app.post('/api/admin/requests/:id/:action', requireAdmin, async (req, res) => {
  const { id, action } = req.params;
  if (!['accept','decline'].includes(action)) return res.status(400).json({ ok:false, message: 'Bad action' });

  // Find pending request (first) by id
  const pr = await PendingRequest.findById(id);
  if (!pr) return res.status(404).json({ ok:false, message: 'Pending request not found' });

  if (action === 'decline') {
    await PendingRequest.deleteOne({ _id: id });
    return res.json({ ok:true, message: 'Request declined and removed' });
  }

  // Accept -> create User and remove pending
  // If user already exists by email, decline to avoid duplicates
  const exists = await User.findOne({ email: pr.email });
  if (exists) {
    await PendingRequest.deleteOne({ _id: id });
    return res.status(400).json({ ok:false, message: 'User already exists; pending removed' });
  }

  const created = await User.create({
    name: pr.name,
    email: pr.email,
    passwordHash: pr.passwordHash,
    role: 'student',
    status: 'active',
    batch: pr.batch || 'batch1'
  });

  await PendingRequest.deleteOne({ _id: id });
  res.json({ ok:true, message: 'User created', userId: created._id });
});

// Admin: delete a user (selective)
app.delete('/api/admin/user/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const u = await User.findById(id);
  if (!u) return res.status(404).json({ ok:false, message: 'User not found' });
  await Attendance.deleteMany({ userId: u._id });
  await User.deleteOne({ _id: u._id });
  res.json({ ok:true, message: 'User and attendance removed' });
});

// Admin: delete attendance for specific date (optionally filtered by batch)
app.delete('/api/admin/attendance', requireAdmin, async (req, res) => {
  // expects ?date=YYYY-MM-DD [&batch=batch1]
  const date = req.query.date;
  if (!date) return res.status(400).json({ ok:false, message: 'date required' });
  const batch = req.query.batch;
  const filter = { date };
  if (batch) filter.batch = batch;
  const result = await Attendance.deleteMany(filter);
  return res.json({ ok:true, deleted: result.deletedCount || 0 });
});

// Attendance list by date (admin) - supports optional batch filter
// Attendance list by date (admin) - supports optional batch filter (validated)
app.get('/api/admin/attendance-by-date', requireAdmin, async (req, res) => {
  try {
    const date = req.query.date || formatDate();

    // normalize batch and allow only specific values
    const rawBatch = (req.query.batch && String(req.query.batch).trim().toLowerCase()) || null;
    const allowedBatches = ['batch1','batch2','batch3'];
    const batchFilter = allowedBatches.includes(rawBatch) ? rawBatch : null;

    // find active students (optionally filter by batch)
    const userQuery = { role:'student', status:'active' };
    if (batchFilter) userQuery.batch = batchFilter;

    const students = await User.find(userQuery).sort({ name:1 }).lean();

    // load attendances for the date (don't filter by batch here;
    // we attach user's batch from the User doc)
    const atts = await Attendance.find({ date }).lean();
    const attMap = {};
    atts.forEach(a => { attMap[a.userId.toString()] = a; });

    const list = students.map(s => {
      const a = attMap[s._id.toString()];
      return {
        _id: s._id,
        name: s.name,
        email: s.email,
        batch: s.batch || 'batch1',
        status: a ? a.status : 'logged_out',
        lastToggledAt: a ? a.lastToggledAt : null,
        lastClockInAt: a ? a.lastClockInAt : null,
        lastClockOutAt: a ? a.lastClockOutAt : null,
        lunchStartAt: a ? a.lunchStartAt : null,
        lunchEndAt: a ? a.lunchEndAt : null,
        lunchDurationMins: a ? a.lunchDurationMins : null,
        lunchOvertime: a ? !!a.lunchOvertime : false
      };
    });

    return res.json({ ok:true, date, batch: batchFilter || null, list, batchDeadlines: BATCH_DEADLINES });
  } catch (err) {
    console.error('/api/admin/attendance-by-date error', err && err.message ? err.message : err);
    return res.status(500).json({ ok:false, message: 'Server error' });
  }
});


// CSV report (admin) - already supports multiple fields; kept intact
app.get('/admin/report', requireAdmin, async (req, res) => {
  const { date, from, to } = req.query;
  let dates = [];
  if (date) dates = [date];
  else if (from && to) {
    const start = new Date(from); const end = new Date(to);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate()+1)) dates.push(formatDate(new Date(d)));
  } else dates = [formatDate()];
  const students = await User.find({ role:'student', status:'active' }).sort({ name:1 });
  const rows = [['Name','Email','Batch','Date','Status','LastClockInAt','LastClockOutAt','LunchStartAt','LunchEndAt','LunchDurationMins','LunchOvertime']];
  for (const d of dates) {
    const atts = await Attendance.find({ date: d });
    const map = {}; atts.forEach(a => { map[a.userId.toString()] = a; });
    for (const s of students) {
      const a = map[s._id.toString()];
      rows.push([
        s.name,
        s.email,
        s.batch || '',
        d,
        a ? a.status : 'logged_out',
        a && a.lastClockInAt ? a.lastClockInAt.toISOString() : '',
        a && a.lastClockOutAt ? a.lastClockOutAt.toISOString() : '',
        a && a.lunchStartAt ? a.lunchStartAt.toISOString() : '',
        a && a.lunchEndAt ? a.lunchEndAt.toISOString() : '',
        a && a.lunchDurationMins != null ? a.lunchDurationMins : '',
        a && a.lunchOvertime ? 'TRUE' : 'FALSE'
      ]);
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
  app.get('/setup-admin', (req, res) => res.status(404).send('Not found'));
}

// Admin: recent activity
app.get('/api/admin/recent-activity', requireAdmin, async (req, res) => {
  try {
    const recent = await Attendance.find({ lastToggledAt: { $ne: null } })
      .sort({ lastToggledAt: -1 })
      .limit(15)
      .populate('userId', 'name email');
    const list = recent.map(r => ({
      userId: r.userId ? r.userId._id : null,
      name: r.userId ? r.userId.name : 'Unknown',
      email: r.userId ? r.userId.email : '',
      status: r.status,
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
