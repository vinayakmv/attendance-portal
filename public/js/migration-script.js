// migration-script.js (run once with node migration-script.js after connecting mongoose)
const mongoose = require('mongoose');
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/attendance_portal';
mongoose.connect(MONGODB_URI).then(async ()=> {
  const Attendance = mongoose.model('Attendance');
  const docs = await Attendance.find({});
  for (const d of docs) {
    if (!d.lastClockInAt && !d.lastClockOutAt && d.lastToggledAt) {
      if (d.status === 'logged_in') d.lastClockInAt = d.lastToggledAt;
      else d.lastClockOutAt = d.lastToggledAt;
      await d.save();
      console.log('Updated', d._id.toString());
    }
  }
  console.log('Done');
  process.exit(0);
}).catch(err => { console.error(err); process.exit(1); });
