// routes/portal.js — Public parent self-service portal (#12)
const express = require('express');
const router  = express.Router();
const { getDb, query, queryOne } = require('../db/init');

// GET /api/portal/:phone — parent looks up their child's attendance by phone number
router.get('/:phone', async (req, res) => {
  try {
    await getDb();
    const phone = req.params.phone.replace(/[\s\-\+\(\)]/g, '');

    // Find guardian by phone number
    const guardian = queryOne(
      'SELECT * FROM guardians WHERE REPLACE(REPLACE(REPLACE(phone_number," ",""),"-",""),"+","") LIKE ?',
      [`%${phone}%`]
    );
    if (!guardian) return res.status(404).json({ error: 'No registration found for this phone number. Please contact the program coordinator.' });

    // Get the child
    const participant = queryOne('SELECT * FROM participants WHERE id=? AND active=1', [guardian.participant_id]);
    if (!participant) return res.status(404).json({ error: 'Child record not found.' });

    // Get all siblings (other children with same guardian phone)
    const allGuardianRecords = query(
      'SELECT * FROM guardians WHERE REPLACE(REPLACE(REPLACE(phone_number," ",""),"-",""),"+","") LIKE ?',
      [`%${phone}%`]
    );
    const allChildren = allGuardianRecords.map(g => {
      const p = queryOne('SELECT * FROM participants WHERE id=? AND active=1', [g.participant_id]);
      if (!p) return null;
      const logs = query(
        'SELECT * FROM session_logs WHERE participant_id=? ORDER BY event_time DESC LIMIT 50',
        [p.id]
      );
      const daysAttended = new Set(
        logs.filter(l => l.event_type === 'IN').map(l => l.event_time.slice(0, 10))
      ).size;
      const lastLog = logs[0] || null;
      return { participant: p, logs, daysAttended, lastLog };
    }).filter(Boolean);

    res.json({
      guardian_name: guardian.full_name,
      children:      allChildren,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
