// routes/analytics.js — Full-program analytics (#10)
const express = require('express');
const router  = express.Router();
const { getDb, query, queryOne } = require('../db/init');

router.get('/', async (req, res) => {
  try {
    await getDb();

    const totalParticipants = queryOne("SELECT COUNT(*) as c FROM participants WHERE active=1").c;

    // All unique program days that have at least one check-in
    const programDays = query(
      "SELECT date(event_time) as day, COUNT(DISTINCT participant_id) as unique_checkins, COUNT(*) as total_events FROM session_logs WHERE event_type='IN' GROUP BY date(event_time) ORDER BY day ASC"
    );

    // Overall attendance rate per day
    const attendanceByDay = programDays.map(d => ({
      date:             d.day,
      unique_checkins:  d.unique_checkins,
      total_events:     d.total_events,
      attendance_rate:  totalParticipants > 0 ? Math.round((d.unique_checkins / totalParticipants) * 100) : 0,
    }));

    // Peak arrival times — hour buckets
    const hourlyData = query(
      "SELECT strftime('%H', event_time) as hour, COUNT(*) as count FROM session_logs WHERE event_type='IN' GROUP BY hour ORDER BY hour"
    );

    // Per-group attendance across all days
    const groups = query("SELECT DISTINCT sport_group FROM participants WHERE active=1");
    const groupStats = groups.map(g => {
      const total = queryOne("SELECT COUNT(*) as c FROM participants WHERE active=1 AND sport_group=?", [g.sport_group]).c;
      const totalCheckins = query(
        "SELECT COUNT(DISTINCT participant_id) as c FROM session_logs WHERE event_type='IN' AND participant_id IN (SELECT id FROM participants WHERE sport_group=?)",
        [g.sport_group]
      ).length;
      const days = programDays.length || 1;
      return {
        group:           g.sport_group,
        total_enrolled:  total,
        avg_daily:       programDays.length > 0
          ? Math.round(query(
              "SELECT date(event_time) as day, COUNT(DISTINCT participant_id) as c FROM session_logs WHERE event_type='IN' AND participant_id IN (SELECT id FROM participants WHERE sport_group=?) GROUP BY day",
              [g.sport_group]
            ).reduce((s, r) => s + r.c, 0) / days)
          : 0,
      };
    });

    // Top attendees — children with highest attendance days
    const topAttendees = query(`
      SELECT p.first_name, p.last_name, p.sport_group,
        COUNT(DISTINCT date(sl.event_time)) as days_attended,
        MIN(sl.event_time) as first_seen,
        MAX(sl.event_time) as last_seen
      FROM participants p
      LEFT JOIN session_logs sl ON sl.participant_id = p.id AND sl.event_type = 'IN'
      WHERE p.active = 1
      GROUP BY p.id
      ORDER BY days_attended DESC
      LIMIT 20
    `);

    // Children who have never checked in
    const neverCheckedIn = query(`
      SELECT p.first_name, p.last_name, p.sport_group
      FROM participants p
      WHERE p.active=1
        AND p.id NOT IN (SELECT DISTINCT participant_id FROM session_logs)
      ORDER BY p.sport_group, p.last_name
    `);

    // Program duration
    const firstDay = programDays.length > 0 ? programDays[0].date : null;
    const lastDay  = programDays.length > 0 ? programDays[programDays.length-1].date : null;

    res.json({
      totalParticipants,
      programDays:      programDays.length,
      firstDay,
      lastDay,
      attendanceByDay,
      hourlyData,
      groupStats,
      topAttendees,
      neverCheckedIn,
      neverCheckedInCount: neverCheckedIn.length,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/analytics/child/:id — individual child history
router.get('/child/:id', async (req, res) => {
  try {
    await getDb();
    const p = queryOne('SELECT * FROM participants WHERE id=?', [req.params.id]);
    if (!p) return res.status(404).json({ error: 'Not found' });
    const logs = query(
      'SELECT * FROM session_logs WHERE participant_id=? ORDER BY event_time ASC',
      [req.params.id]
    );
    const daysAttended = new Set(logs.filter(l => l.event_type==='IN').map(l => l.event_time.slice(0,10))).size;
    res.json({ participant: p, logs, daysAttended });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
