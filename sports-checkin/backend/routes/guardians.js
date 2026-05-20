// routes/guardians.js
const express = require('express');
const router  = express.Router();
const { getDb, query, insert, exec } = require('../db/init');

router.get('/:participant_id', async (req, res) => {
  try { await getDb(); res.json(query('SELECT * FROM guardians WHERE participant_id=?', [req.params.participant_id])); }
  catch(e) { res.status(500).json({error:e.message}); }
});

router.post('/', async (req, res) => {
  try {
    await getDb();
    const { participant_id, full_name, relationship, phone_number, wa_verified } = req.body;
    if (!participant_id||!full_name||!phone_number) return res.status(400).json({error:'participant_id, full_name, phone_number required'});
    const id = insert('INSERT INTO guardians (participant_id,full_name,relationship,phone_number,wa_verified) VALUES (?,?,?,?,?)',
      [participant_id, full_name, relationship||'Guardian', phone_number, wa_verified?1:0]);
    res.status(201).json({id});
  } catch(e) { res.status(500).json({error:e.message}); }
});

router.patch('/:id/verify', async (req, res) => {
  try { await getDb(); exec('UPDATE guardians SET wa_verified=1 WHERE id=?', [req.params.id]); res.json({success:true}); }
  catch(e) { res.status(500).json({error:e.message}); }
});

router.put('/:id', async (req, res) => {
  try {
    await getDb();
    const { full_name, relationship, phone_number, sms_enabled } = req.body;
    const cur = require('../db/init').queryOne('SELECT * FROM guardians WHERE id=?', [req.params.id]);
    if (!cur) return res.status(404).json({error:'Not found'});
    exec('UPDATE guardians SET full_name=?,relationship=?,phone_number=?,sms_enabled=? WHERE id=?',
      [full_name||cur.full_name, relationship||cur.relationship, phone_number||cur.phone_number, sms_enabled??cur.sms_enabled, req.params.id]);
    res.json({success:true});
  } catch(e) { res.status(500).json({error:e.message}); }
});

router.delete('/:id', async (req, res) => {
  try { await getDb(); exec('DELETE FROM guardians WHERE id=?', [req.params.id]); res.json({success:true}); }
  catch(e) { res.status(500).json({error:e.message}); }
});

module.exports = router;
