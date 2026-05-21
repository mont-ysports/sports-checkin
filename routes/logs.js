// routes/logs.js
const express = require('express');
const router  = express.Router();
const { getDb, query, queryOne } = require('../db/init');

router.get('/', async (req, res) => {
  try {
    await getDb();
    const { date, participant_id, limit = 200 } = req.query;
    let sql = `SELECT sl.*, p.first_name, p.last_name, p.sport_group
               FROM session_logs sl JOIN participants p ON p.id=sl.participant_id WHERE 1=1`;
    const params = [];
    if (date)           { sql += ` AND date(sl.event_time)=?`; params.push(date); }
    if (participant_id) { sql += ` AND sl.participant_id=?`;   params.push(participant_id); }
    sql += ` ORDER BY sl.event_time DESC LIMIT ?`;
    params.push(Number(limit));
    res.json(query(sql, params));
  } catch(e) { res.status(500).json({error:e.message}); }
});

router.get('/today', async (req, res) => {
  try {
    await getDb();
    const today = new Date().toISOString().slice(0,10);
    const participants = query('SELECT * FROM participants WHERE active=1');
    const rows = participants.map(p => {
      const logs = query("SELECT * FROM session_logs WHERE participant_id=? AND date(event_time)=? ORDER BY event_time ASC", [p.id, today]);
      const ins  = logs.filter(l => l.event_type==='IN');
      const outs = logs.filter(l => l.event_type==='OUT');
      const last = logs[logs.length-1];
      return {
        id: p.id, first_name: p.first_name, last_name: p.last_name, sport_group: p.sport_group,
        last_in:  ins.length  ? ins[ins.length-1].event_time   : null,
        last_out: outs.length ? outs[outs.length-1].event_time : null,
        current_status: last ? last.event_type : null,
      };
    });
    res.json(rows);
  } catch(e) { res.status(500).json({error:e.message}); }
});

router.get('/participant/:id', async (req, res) => {
  try {
    await getDb();
    res.json(query('SELECT * FROM session_logs WHERE participant_id=? ORDER BY event_time DESC LIMIT 100', [req.params.id]));
  } catch(e) { res.status(500).json({error:e.message}); }
});

module.exports = router;
