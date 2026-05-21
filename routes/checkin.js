// routes/checkin.js
const express = require('express');
const router  = express.Router();
const { getDb, query, queryOne, insert, exec } = require('../db/init');

function buildWaUrl(phone, childName, eventType, time) {
  const clean = phone.replace(/[\s\-\+\(\)]/g,'');
  const emoji  = eventType==='IN' ? '✅' : '👋';
  const action = eventType==='IN' ? 'checked IN' : 'checked OUT';
  const msg = `${emoji} [Sports Program 2026] ${childName} has ${action} at ${time}. If you did not expect this, please contact the program coordinator immediately.`;
  return `https://wa.me/${clean}?text=${encodeURIComponent(msg)}`;
}

function formatTime() {
  return new Date().toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'});
}

router.post('/', async (req, res) => {
  try {
    await getDb();
    const { participant_id, event_type, checked_in_by, notes } = req.body;
    if (!participant_id||!event_type) return res.status(400).json({error:'participant_id and event_type required'});
    if (!['IN','OUT'].includes(event_type)) return res.status(400).json({error:'event_type must be IN or OUT'});

    const p = queryOne('SELECT * FROM participants WHERE id=? AND active=1', [participant_id]);
    if (!p) return res.status(404).json({error:'Participant not found'});

    // Duplicate check — 60s window
    const now = new Date();
    const cutoff = new Date(now - 60000).toISOString().replace('T',' ').slice(0,19);
    const recent = queryOne(
      "SELECT id FROM session_logs WHERE participant_id=? AND event_type=? AND event_time > ?",
      [participant_id, event_type, cutoff]
    );
    if (recent) return res.status(409).json({error:'Duplicate event within 60 seconds'});

    const logId = insert(
      'INSERT INTO session_logs (participant_id,event_type,checked_in_by,notes) VALUES (?,?,?,?)',
      [participant_id, event_type, checked_in_by||'staff', notes||'']
    );

    const eventTime  = formatTime();
    const childName  = `${p.first_name} ${p.last_name}`;
    const guardians  = query('SELECT * FROM guardians WHERE participant_id=? AND sms_enabled=1', [participant_id]);

    const waLinks = guardians.map(g => {
      const url = buildWaUrl(g.phone_number, childName, event_type, eventTime);
      insert('INSERT INTO sms_logs (guardian_id,session_log_id,message_text,wa_url,status) VALUES (?,?,?,?,?)',
        [g.id, logId, `${childName} ${event_type} at ${eventTime}`, url, 'generated']);
      return { guardian_id:g.id, guardian_name:g.full_name, phone:g.phone_number, wa_url:url };
    });

    res.status(201).json({ success:true, log_id:logId, child_name:childName, event_type, event_time:eventTime, wa_links:waLinks });
  } catch(e) { res.status(500).json({error:e.message}); }
});

router.get('/status/:participant_id', async (req, res) => {
  try {
    await getDb();
    const log = queryOne('SELECT * FROM session_logs WHERE participant_id=? ORDER BY event_time DESC LIMIT 1', [req.params.participant_id]);
    res.json({ status: log ? log.event_type : null, last_event: log||null });
  } catch(e) { res.status(500).json({error:e.message}); }
});

router.patch('/notify/:sms_log_id', async (req, res) => {
  try {
    await getDb();
    exec("UPDATE sms_logs SET status='sent', sent_at=datetime('now') WHERE id=?", [req.params.sms_log_id]);
    res.json({success:true});
  } catch(e) { res.status(500).json({error:e.message}); }
});

module.exports = router;
