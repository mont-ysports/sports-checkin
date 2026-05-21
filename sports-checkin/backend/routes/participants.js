// routes/participants.js
const express = require('express');
const router  = express.Router();

async function db() { return require('../db/init').getDb(); }
const { query, queryOne, insert, exec, saveDb } = require('../db/init');

router.get('/', async (req, res) => {
  try {
    await db();
    const rows = query(`
      SELECT p.*,
        (SELECT COUNT(*) FROM guardians WHERE participant_id=p.id) as guardian_count,
        (SELECT event_type FROM session_logs WHERE participant_id=p.id ORDER BY event_time DESC LIMIT 1) as last_event,
        (SELECT event_time  FROM session_logs WHERE participant_id=p.id ORDER BY event_time DESC LIMIT 1) as last_event_time
      FROM participants p WHERE p.active=1 ORDER BY p.last_name, p.first_name
    `);
    res.json(rows);
  } catch(e) { res.status(500).json({error:e.message}); }
});

router.get('/lookup/pin/:pin', async (req, res) => {
  try {
    await db();
    const p = queryOne('SELECT * FROM participants WHERE pin=? AND active=1', [req.params.pin]);
    if (!p) return res.status(404).json({error:'No participant found with that PIN'});
    const guardians = query('SELECT * FROM guardians WHERE participant_id=?', [p.id]);
    const lastLog   = queryOne('SELECT * FROM session_logs WHERE participant_id=? ORDER BY event_time DESC LIMIT 1', [p.id]);
    res.json({...p, guardians, lastLog});
  } catch(e) { res.status(500).json({error:e.message}); }
});

router.get('/lookup/qr/:code', async (req, res) => {
  try {
    await db();
    const p = queryOne('SELECT * FROM participants WHERE qr_code=? AND active=1', [req.params.code]);
    if (!p) return res.status(404).json({error:'No participant found'});
    const guardians = query('SELECT * FROM guardians WHERE participant_id=?', [p.id]);
    const lastLog   = queryOne('SELECT * FROM session_logs WHERE participant_id=? ORDER BY event_time DESC LIMIT 1', [p.id]);
    res.json({...p, guardians, lastLog});
  } catch(e) { res.status(500).json({error:e.message}); }
});

router.get('/:id', async (req, res) => {
  try {
    await db();
    const p = queryOne('SELECT * FROM participants WHERE id=?', [req.params.id]);
    if (!p) return res.status(404).json({error:'Not found'});
    const guardians = query('SELECT * FROM guardians WHERE participant_id=?', [p.id]);
    res.json({...p, guardians});
  } catch(e) { res.status(500).json({error:e.message}); }
});

router.post('/', async (req, res) => {
  try {
    await db();
    const { first_name, last_name, date_of_birth, sport_group, medical_notes, pin, guardians } = req.body;
    if (!first_name||!last_name||!sport_group||!pin)
      return res.status(400).json({error:'first_name, last_name, sport_group, pin required'});
    const existing = queryOne('SELECT id FROM participants WHERE pin=?', [pin]);
    if (existing) return res.status(409).json({error:'PIN already in use'});
    const qr = 'QR' + Date.now().toString(36).toUpperCase();
    const pid = insert(
      'INSERT INTO participants (first_name,last_name,date_of_birth,sport_group,medical_notes,pin,qr_code) VALUES (?,?,?,?,?,?,?)',
      [first_name, last_name, date_of_birth||null, sport_group, medical_notes||'', pin, qr]
    );
    if (Array.isArray(guardians)) {
      for (const g of guardians) {
        if (g.full_name && g.phone_number)
          insert('INSERT INTO guardians (participant_id,full_name,relationship,phone_number,wa_verified) VALUES (?,?,?,?,?)',
            [pid, g.full_name, g.relationship||'Guardian', g.phone_number, g.wa_verified?1:0]);
      }
    }
    const created   = queryOne('SELECT * FROM participants WHERE id=?', [pid]);
    const glist     = query('SELECT * FROM guardians WHERE participant_id=?', [pid]);
    res.status(201).json({...created, guardians:glist});
  } catch(e) { res.status(500).json({error:e.message}); }
});

router.put('/:id', async (req, res) => {
  try {
    await db();
    const { first_name, last_name, date_of_birth, sport_group, medical_notes, active } = req.body;
    const cur = queryOne('SELECT * FROM participants WHERE id=?', [req.params.id]);
    if (!cur) return res.status(404).json({error:'Not found'});
    exec('UPDATE participants SET first_name=?,last_name=?,date_of_birth=?,sport_group=?,medical_notes=?,active=? WHERE id=?',
      [first_name||cur.first_name, last_name||cur.last_name, date_of_birth||cur.date_of_birth,
       sport_group||cur.sport_group, medical_notes||cur.medical_notes, active??cur.active, req.params.id]);
    res.json({success:true});
  } catch(e) { res.status(500).json({error:e.message}); }
});

router.delete('/:id', async (req, res) => {
  try {
    await db();
    exec('UPDATE participants SET active=0 WHERE id=?', [req.params.id]);
    res.json({success:true});
  } catch(e) { res.status(500).json({error:e.message}); }
});

module.exports = router;

// POST /api/participants/bulk-import — import many participants at once
router.post('/bulk-import', async (req, res) => {
  try {
    await db();
    const { participants } = req.body;
    if (!Array.isArray(participants) || participants.length === 0)
      return res.status(400).json({ error: 'participants array required' });

    const results = { imported: 0, skipped: 0, errors: [] };

    for (const p of participants) {
      try {
        const { first_name, last_name, date_of_birth, sport_group, pin, guardians } = p;
        if (!first_name || !last_name || !sport_group || !pin) {
          results.skipped++;
          results.errors.push(`Skipped ${first_name} ${last_name}: missing required fields`);
          continue;
        }
        // Skip if PIN already exists
        const existing = queryOne('SELECT id FROM participants WHERE pin=?', [pin]);
        if (existing) {
          results.skipped++;
          results.errors.push(`Skipped ${first_name} ${last_name}: PIN ${pin} already in use`);
          continue;
        }
        const qr = 'QR' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substr(2,3).toUpperCase();
        const pid = insert(
          'INSERT INTO participants (first_name,last_name,date_of_birth,sport_group,medical_notes,pin,qr_code) VALUES (?,?,?,?,?,?,?)',
          [first_name, last_name, date_of_birth||null, sport_group, p.medical_notes||'', pin, qr]
        );
        if (Array.isArray(guardians)) {
          for (const g of guardians) {
            if (g.full_name && g.phone_number) {
              insert(
                'INSERT INTO guardians (participant_id,full_name,relationship,phone_number,wa_verified) VALUES (?,?,?,?,?)',
                [pid, g.full_name, g.relationship||'Guardian', g.phone_number, 0]
              );
            }
          }
        }
        results.imported++;
      } catch (err) {
        results.skipped++;
        results.errors.push(`Error on ${p.first_name} ${p.last_name}: ${err.message}`);
      }
    }

    res.status(201).json(results);
  } catch(e) { res.status(500).json({ error: e.message }); }
});
