// scheduler.js — Scheduled jobs: end-of-day alert + daily summary
const cron = require('node-cron');
const { getDb, query, queryOne } = require('./db/init');

// Build WhatsApp deep-link
function waUrl(phone, message) {
  const clean = phone.replace(/[\s\-\+\(\)]/g, '');
  return `https://wa.me/${clean}?text=${encodeURIComponent(message)}`;
}

// Format time nicely
function fmt(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

// ── Job 1: End-of-day unaccounted children alert (#2) ─────────
// Runs at 5:00 PM every day
// Finds children who checked IN but never checked OUT today
async function checkUnaccountedChildren() {
  try {
    await getDb();
    const today = new Date().toISOString().slice(0, 10);

    const participants = query('SELECT * FROM participants WHERE active=1');
    const unaccounted = [];

    for (const p of participants) {
      const lastLog = queryOne(
        'SELECT * FROM session_logs WHERE participant_id=? AND date(event_time)=? ORDER BY event_time DESC LIMIT 1',
        [p.id, today]
      );
      // Child checked IN but last event is still IN (never checked out)
      if (lastLog && lastLog.event_type === 'IN') {
        const guardians = query('SELECT * FROM guardians WHERE participant_id=? AND sms_enabled=1', [p.id]);
        unaccounted.push({
          participant: p,
          lastLog,
          guardians,
        });
      }
    }

    if (unaccounted.length === 0) {
      console.log(`[Scheduler] End-of-day check: all ${participants.length} children accounted for ✅`);
      return { count: 0, links: [] };
    }

    // Build WhatsApp links for coordinators/admins
    const adminStaff = query("SELECT * FROM staff WHERE role IN ('admin','coordinator') AND active=1");
    const names = unaccounted.map(u => `${u.participant.first_name} ${u.participant.last_name}`).join(', ');
    const adminLinks = adminStaff.map(s => {
      if (!s.phone_number) return null;
      const msg = `⚠️ [Sports Program 2026] END OF DAY ALERT: ${unaccounted.length} child(ren) checked IN but never checked OUT: ${names}. Please verify their status immediately.`;
      return { name: s.name, url: waUrl(s.phone_number, msg) };
    }).filter(Boolean);

    // Also build parent notification links
    const parentLinks = unaccounted.map(u => {
      const childName = `${u.participant.first_name} ${u.participant.last_name}`;
      return u.guardians.map(g => ({
        child: childName,
        guardian: g.full_name,
        url: waUrl(g.phone_number, `⚠️ [Sports Program 2026] ${childName} checked in today at ${fmt(u.lastLog.event_time)} but has not been checked out. Please confirm they have left the program safely.`)
      }));
    }).flat();

    console.log(`[Scheduler] End-of-day: ${unaccounted.length} unaccounted children found`);
    return { count: unaccounted.length, names, adminLinks, parentLinks, unaccounted };
  } catch (e) {
    console.error('[Scheduler] End-of-day check failed:', e.message);
    return { count: 0, links: [], error: e.message };
  }
}

// ── Job 2: Daily summary to coordinator (#7) ──────────────────
// Runs at 6:00 PM every day
async function dailySummary() {
  try {
    await getDb();
    const today = new Date().toISOString().slice(0, 10);
    const dateLabel = new Date().toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' });

    const totalParticipants = queryOne("SELECT COUNT(*) as c FROM participants WHERE active=1").c;
    const checkedInToday    = query(
      "SELECT DISTINCT participant_id FROM session_logs WHERE event_type='IN' AND date(event_time)=?", [today]
    ).length;

    // Currently on-site (last event = IN)
    let onSite = 0;
    const all = query('SELECT id FROM participants WHERE active=1');
    for (const p of all) {
      const last = queryOne('SELECT event_type FROM session_logs WHERE participant_id=? ORDER BY event_time DESC LIMIT 1', [p.id]);
      if (last && last.event_type === 'IN') onSite++;
    }

    const eventsToday = queryOne("SELECT COUNT(*) as c FROM session_logs WHERE date(event_time)=?", [today]).c;

    // By group
    const groups = query("SELECT DISTINCT sport_group FROM participants WHERE active=1");
    const groupLines = groups.map(g => {
      const total = queryOne("SELECT COUNT(*) as c FROM participants WHERE active=1 AND sport_group=?", [g.sport_group]).c;
      const checkedIn = query(
        "SELECT DISTINCT participant_id FROM session_logs WHERE event_type='IN' AND date(event_time)=? AND participant_id IN (SELECT id FROM participants WHERE sport_group=?)",
        [today, g.sport_group]
      ).length;
      return `  • ${g.sport_group}: ${checkedIn}/${total}`;
    }).join('\n');

    const summaryMsg =
      `📊 *Sports Program 2026 — Daily Summary*\n` +
      `📅 ${dateLabel}\n\n` +
      `✅ Checked in today: ${checkedInToday}/${totalParticipants}\n` +
      `🏃 Currently on-site: ${onSite}\n` +
      `📝 Total events: ${eventsToday}\n\n` +
      `*By group:*\n${groupLines}\n\n` +
      `_Powered by Sports Program 2026 Check-in System_`;

    // Get coordinators + admins to notify
    const recipients = query("SELECT * FROM staff WHERE role IN ('admin','coordinator') AND active=1 AND phone_number IS NOT NULL");
    const links = recipients.map(r => ({
      name: r.name,
      url: waUrl(r.phone_number, summaryMsg),
    }));

    console.log(`[Scheduler] Daily summary prepared — ${checkedInToday}/${totalParticipants} attended`);
    return { summaryMsg, checkedInToday, totalParticipants, onSite, eventsToday, links };
  } catch (e) {
    console.error('[Scheduler] Daily summary failed:', e.message);
    return { error: e.message };
  }
}

// ── Start scheduled jobs ──────────────────────────────────────
function startScheduler() {
  // End-of-day unaccounted check — 5:00 PM every day
  cron.schedule('0 17 * * *', () => {
    console.log('[Scheduler] Running end-of-day unaccounted children check...');
    checkUnaccountedChildren();
  }, { timezone: 'Africa/Monrovia' });

  // Daily summary — 6:00 PM every day
  cron.schedule('0 18 * * *', () => {
    console.log('[Scheduler] Running daily summary...');
    dailySummary();
  }, { timezone: 'Africa/Monrovia' });

  console.log('⏰ Scheduler started — jobs run at 5pm and 6pm Monrovia time');
}

module.exports = { startScheduler, checkUnaccountedChildren, dailySummary };
