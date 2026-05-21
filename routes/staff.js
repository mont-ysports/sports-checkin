// routes/staff.js
const express = require('express');
const router  = express.Router();
const { getDb, query, queryOne, insert, exec } = require('../db/init');

// POST /api/staff/login
router.post('/login', async (req, res) => {
  try {
    await getDb();
    const { pin } = req.body;
    if (!pin) return res.status(400).json({ error: 'PIN required' });
    const staff = queryOne('SELECT * FROM staff WHERE pin=? AND active=1', [pin]);
    if (!staff) return res.status(401).json({ error: 'Invalid PIN' });
    res.json({
      id:          staff.id,
      name:        staff.name,
      role:        staff.role,
      sport_group: staff.sport_group || null,
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/staff — list all staff
router.get('/', async (req, res) => {
  try {
    await getDb();
    res.json(query('SELECT id,name,role,sport_group,active,created_at FROM staff ORDER BY role,name'));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/staff — create staff member
router.post('/', async (req, res) => {
  try {
    await getDb();
    const { name, pin, role, sport_group, phone_number } = req.body;
    if (!name || !pin) return res.status(400).json({ error: 'name and pin required' });
    const validRoles = ['admin','coordinator','coach','checkin_staff'];
    const r = validRoles.includes(role) ? role : 'checkin_staff';
    // Coach must have a sport_group
    if (r === 'coach' && !sport_group)
      return res.status(400).json({ error: 'sport_group required for coach role' });
    // Check PIN uniqueness
    const existing = queryOne('SELECT id FROM staff WHERE pin=?', [pin]);
    if (existing) return res.status(409).json({ error: 'PIN already in use' });
    const id = insert(
      'INSERT INTO staff (name,pin,role,sport_group,phone_number) VALUES (?,?,?,?,?)',
      [name, pin, r, sport_group || null, phone_number || null]
    );
    res.status(201).json({ id, name, role: r, sport_group: sport_group || null });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/staff/:id — update staff member
router.put('/:id', async (req, res) => {
  try {
    await getDb();
    const { name, pin, role, sport_group, active } = req.body;
    const cur = queryOne('SELECT * FROM staff WHERE id=?', [req.params.id]);
    if (!cur) return res.status(404).json({ error: 'Not found' });
    if (pin && pin !== cur.pin) {
      const conflict = queryOne('SELECT id FROM staff WHERE pin=? AND id!=?', [pin, req.params.id]);
      if (conflict) return res.status(409).json({ error: 'PIN already in use' });
    }
    const { name: n2, pin: p2, role: r2, sport_group: sg2, phone_number: ph2, active: a2 } = req.body;
    exec(
      'UPDATE staff SET name=?,pin=?,role=?,sport_group=?,phone_number=?,active=? WHERE id=?',
      [n2||cur.name, p2||cur.pin, r2||cur.role, sg2||cur.sport_group, ph2||cur.phone_number, a2??cur.active, req.params.id]
    );
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/staff/:id — deactivate
router.delete('/:id', async (req, res) => {
  try {
    await getDb();
    // Prevent deleting the last admin
    const admins = query("SELECT id FROM staff WHERE role='admin' AND active=1");
    const target = queryOne('SELECT * FROM staff WHERE id=?', [req.params.id]);
    if (target?.role === 'admin' && admins.length <= 1)
      return res.status(400).json({ error: 'Cannot remove the last admin' });
    exec('UPDATE staff SET active=0 WHERE id=?', [req.params.id]);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
