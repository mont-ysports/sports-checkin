// routes/sheets.js — Google Sheets proxy (bypasses CORS)
const express = require('express');
const router  = express.Router();

function toCsvUrl(input) {
  const trimmed = input.trim();
  if (trimmed.includes('/export?')) return trimmed;
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (!match) return null;
  const id = match[1];
  const gidMatch = trimmed.match(/[#&?]gid=(\d+)/);
  const gid = gidMatch ? gidMatch[1] : '0';
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
}

// POST /api/sheets/fetch — server-side fetch of Google Sheet as CSV
router.post('/fetch', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'url is required' });

    const csvUrl = toCsvUrl(url);
    if (!csvUrl) return res.status(400).json({ error: 'Invalid Google Sheets URL. Please copy the full URL from your browser address bar.' });

    const response = await fetch(csvUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'text/csv,text/plain,*/*',
      },
      redirect: 'follow',
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        return res.status(403).json({
          error: 'Sheet is not public. In Google Sheets go to Share → Change → Anyone with the link → Viewer, then try again.'
        });
      }
      if (response.status === 404) {
        return res.status(404).json({ error: 'Sheet not found. Please check the URL is correct.' });
      }
      return res.status(response.status).json({
        error: `Google returned an error (${response.status}). Make sure the sheet is shared as "Anyone with the link can view".`
      });
    }

    const text = await response.text();
    if (!text || text.trim().length === 0) {
      return res.status(400).json({ error: 'Sheet appears to be empty.' });
    }

    // Check we got CSV not an HTML error page
    if (text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html')) {
      return res.status(403).json({
        error: 'Sheet is not publicly accessible. Please set sharing to "Anyone with the link can view" and try again.'
      });
    }

    res.setHeader('Content-Type', 'text/csv');
    res.send(text);
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch sheet: ' + e.message });
  }
});

module.exports = router;
