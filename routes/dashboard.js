// routes/dashboard.js
const express = require('express');
const router  = express.Router();
const { getDb, query, queryOne } = require('../db/init');

router.get('/stats', async (req, res) => {
  try {
    await getDb();
    const today = new Date().toISOString().slice(0,10);

    const totalParticipants  = queryOne("SELECT COUNT(*) as c FROM participants WHERE active=1").c;
    const checkedInToday     = query(
      "SELECT DISTINCT participant_id FROM session_logs WHERE event_type='IN' AND date(event_time)=?", [today]
    ).length;
    const eventsToday        = queryOne("SELECT COUNT(*) as c FROM session_logs WHERE date(event_time)=?", [today]).c;
    const notificationsToday = queryOne("SELECT COUNT(*) as c FROM sms_logs WHERE date(sent_at)=?", [today]).c;

    // currently on-site: last event = IN
    const allParticipants = query('SELECT id FROM participants WHERE active=1');
    let currentlyIn = 0;
    for (const p of allParticipants) {
      const last = queryOne('SELECT event_type FROM session_logs WHERE participant_id=? ORDER BY event_time DESC LIMIT 1', [p.id]);
      if (last && last.event_type === 'IN') currentlyIn++;
    }

    // by group
    const groups = query("SELECT DISTINCT sport_group FROM participants WHERE active=1");
    const byGroup = groups.map(g => {
      const total      = queryOne("SELECT COUNT(*) as c FROM participants WHERE active=1 AND sport_group=?", [g.sport_group]).c;
      const checked_in = query(
        "SELECT DISTINCT participant_id FROM session_logs WHERE event_type='IN' AND date(event_time)=? AND participant_id IN (SELECT id FROM participants WHERE sport_group=?)",
        [today, g.sport_group]
      ).length;
      return { sport_group: g.sport_group, total, checked_in };
    });

    const recentActivity = query(`
      SELECT sl.event_type, sl.event_time, p.first_name, p.last_name, p.sport_group
      FROM session_logs sl JOIN participants p ON p.id=sl.participant_id
      ORDER BY sl.event_time DESC LIMIT 10
    `);

    res.json({ totalParticipants, checkedInToday, currentlyIn, eventsToday, notificationsToday, byGroup, recentActivity });
  } catch(e) { res.status(500).json({error:e.message}); }
});

module.exports = router;
