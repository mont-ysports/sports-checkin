// routes/broadcast.js — Emergency broadcast (#1) + group messaging (#8)
const express = require('express');
const router  = express.Router();
const { getDb, query, queryOne, insert } = require('../db/init');

function waUrl(phone, message) {
  const clean = phone.replace(/[\s\-\+\(\)]/g, '');
  return `https://wa.me/${clean}?text=${encodeURIComponent(message)}`;
}

// POST /api/broadcast — generate WhatsApp links for all or filtered parents
// Body: { message, group? } — group is optional, omit for all parents
router.post('/', async (req, res) => {
  try {
    await getDb();
    const { message, group, type = 'custom' } = req.body;
    if (!message) return res.status(400).json({ error: 'message is required' });

    // Get participants filtered by group if provided
    let participants;
    if (group && group !== 'All') {
      participants = query('SELECT * FROM participants WHERE active=1 AND sport_group=?', [group]);
    } else {
      participants = query('SELECT * FROM participants WHERE active=1');
    }

    // Build one WhatsApp link per unique guardian phone number
    const seen = new Set();
    const links = [];

    for (const p of participants) {
      const guardians = query('SELECT * FROM guardians WHERE participant_id=? AND sms_enabled=1', [p.id]);
      for (const g of guardians) {
        if (seen.has(g.phone_number)) continue;
        seen.add(g.phone_number);
        links.push({
          guardian_id:   g.id,
          guardian_name: g.full_name,
          child_name:    `${p.first_name} ${p.last_name}`,
          phone:         g.phone_number,
          wa_url:        waUrl(g.phone_number, message),
        });
        // Log the broadcast intent
        insert(
          'INSERT INTO sms_logs (guardian_id, session_log_id, message_text, wa_url, status) VALUES (?,?,?,?,?)',
          [g.id, null, message, waUrl(g.phone_number, message), 'broadcast_generated']
        );
      }
    }

    res.json({
      success:     true,
      total_links: links.length,
      group:       group || 'All',
      message,
      links,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/broadcast/unaccounted — end-of-day unaccounted children (#2)
router.get('/unaccounted', async (req, res) => {
  try {
    await getDb();
    const { checkUnaccountedChildren } = require('../scheduler');
    const result = await checkUnaccountedChildren();
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/broadcast/summary — daily summary data (#7)
router.get('/summary', async (req, res) => {
  try {
    await getDb();
    const { dailySummary } = require('../scheduler');
    const result = await dailySummary();
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
