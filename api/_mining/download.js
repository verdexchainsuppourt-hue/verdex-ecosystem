const fs = require('fs');
const path = require('path');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const qIndex = req.url.indexOf('?');
    const params = {};
    if (qIndex >= 0) {
      req.url.slice(qIndex + 1).split('&').forEach(p => {
        const [k, v] = p.split('=');
        params[decodeURIComponent(k)] = decodeURIComponent(v || '');
      });
    }
    const os = params.os || '';
    if (!os || !['linux', 'windows'].includes(os)) {
      return res.status(400).json({ error: 'Invalid OS. Use ?os=linux or ?os=windows' });
    }

    const downloadsDir = path.join(process.cwd(), 'assets', 'downloads');
    const fileMap = {
      windows: { name: 'verdex-windows-amd64.zip', type: 'application/zip' },
      linux: { name: 'verdex-linux-amd64.tar.gz', type: 'application/gzip' }
    };
    const info = fileMap[os];
    const filePath = path.join(downloadsDir, info.name);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Binary not yet available' });
    }

    const stat = fs.statSync(filePath);
    const stream = fs.createReadStream(filePath);
    res.setHeader('Content-Type', info.type);
    res.setHeader('Content-Disposition', 'attachment; filename="' + info.name + '"');
    res.setHeader('Content-Length', stat.size);
    stream.pipe(res);
  } catch (err) {
    console.error('download error:', err.message);
    res.status(200).json({ success: false, error: 'Download temporarily unavailable. Try again.' });
  }
};