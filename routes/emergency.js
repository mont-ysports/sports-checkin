// routes/emergency.js — Emergency contact management
const express = require('express');
const router  = express.Router();
const { getDb, query, queryOne, insert, exec } = require('../db/init');

// Build SMS deep-link URL
function smsUrl(phone, childName, note) {
  const clean = phone.replace(/[\s\-\+\(\)]/g, '');
  const msg = encodeURIComponent(
    `[Sports Program 2026] EMERGENCY: This is regarding ${childName}. Please call the program coordinator immediately.`
  );
  // sms: URI scheme works on both Android and iPhone
  return `sms:+${clean}?body=${msg}`;
}

// GET /api/emergency/:participant_id — get emergency contacts for a child
router.get('/:participant_id', async (req, res) => {
  try {
    await getDb();
    const contacts = query(
      'SELECT * FROM emergency_contacts WHERE participant_id=? ORDER BY id ASC',
      [req.params.participant_id]
    );
    res.json(contacts);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/emergency/:participant_id/with-sms — contacts with pre-built SMS links
router.get('/:participant_id/with-sms', async (req, res) => {
  try {
    await getDb();
    const p = queryOne('SELECT * FROM participants WHERE id=?', [req.params.participant_id]);
    if (!p) return res.status(404).json({ error: 'Participant not found' });
    const childName  = `${p.first_name} ${p.last_name}`;
    const contacts   = query(
      'SELECT * FROM emergency_contacts WHERE participant_id=? ORDER BY id ASC',
      [req.params.participant_id]
    );
    const withLinks = contacts.map(c => ({
      ...c,
      sms_url: smsUrl(c.phone_number, childName, c.notes),
    }));
    res.json(withLinks);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/emergency — add emergency contact
router.post('/', async (req, res) => {
  try {
    await getDb();
    const { participant_id, full_name, phone_number, relationship, notes } = req.body;
    if (!participant_id || !full_name || !phone_number)
      return res.status(400).json({ error: 'participant_id, full_name, phone_number required' });
    const id = insert(
      'INSERT INTO emergency_contacts (participant_id, full_name, phone_number, relationship, notes) VALUES (?,?,?,?,?)',
      [participant_id, full_name, phone_number, relationship || 'Emergency Contact', notes || '']
    );
    res.status(201).json({ id, success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/emergency/:id — update emergency contact
router.put('/:id', async (req, res) => {
  try {
    await getDb();
    const { full_name, phone_number, relationship, notes } = req.body;
    const cur = queryOne('SELECT * FROM emergency_contacts WHERE id=?', [req.params.id]);
    if (!cur) return res.status(404).json({ error: 'Not found' });
    exec(
      'UPDATE emergency_contacts SET full_name=?, phone_number=?, relationship=?, notes=? WHERE id=?',
      [full_name||cur.full_name, phone_number||cur.phone_number,
       relationship||cur.relationship, notes??cur.notes, req.params.id]
    );
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/emergency/:id
router.delete('/:id', async (req, res) => {
  try {
    await getDb();
    exec('DELETE FROM emergency_contacts WHERE id=?', [req.params.id]);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/emergency/bulk-import — import from Google Sheets bulk import
router.post('/bulk-import', async (req, res) => {
  try {
    await getDb();
    const { contacts } = req.body;
    if (!Array.isArray(contacts)) return res.status(400).json({ error: 'contacts array required' });
    let imported = 0;
    for (const c of contacts) {
      if (!c.participant_id || !c.full_name || !c.phone_number) continue;
      insert(
        'INSERT INTO emergency_contacts (participant_id, full_name, phone_number, relationship, notes) VALUES (?,?,?,?,?)',
        [c.participant_id, c.full_name, c.phone_number, c.relationship||'Emergency Contact', c.notes||'']
      );
      imported++;
    }
    res.json({ success: true, imported });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
