// routes/staff.js
const express = require('express');
const router  = express.Router();
const { getDb, query, queryOne, insert } = require('../db/init');

router.post('/login', async (req, res) => {
  try {
    await getDb();
    const { pin } = req.body;
    if (!pin) return res.status(400).json({error:'PIN required'});
    const staff = queryOne('SELECT * FROM staff WHERE pin=? AND active=1', [pin]);
    if (!staff) return res.status(401).json({error:'Invalid PIN'});
    res.json({ id:staff.id, name:staff.name, role:staff.role });
  } catch(e) { res.status(500).json({error:e.message}); }
});

router.get('/', async (req, res) => {
  try {
    await getDb();
    res.json(query('SELECT id,name,role,active,created_at FROM staff'));
  } catch(e) { res.status(500).json({error:e.message}); }
});

router.post('/', async (req, res) => {
  try {
    await getDb();
    const { name, pin, role } = req.body;
    if (!name||!pin) return res.status(400).json({error:'name and pin required'});
    const id = insert('INSERT INTO staff (name,pin,role) VALUES (?,?,?)', [name, pin, role||'staff']);
    res.status(201).json({id});
  } catch(e) { res.status(500).json({error:e.message}); }
});

module.exports = router;
