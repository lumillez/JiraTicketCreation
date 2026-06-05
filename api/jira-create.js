// Vercel serverless function — proxies Jira issue creation to bypass CORS.
// Endpoint: POST /api/jira-create
// Body: { email, fields }
// Reads JIRA_TOKEN from env var. URL is hardcoded.

const JIRA_URL = 'https://cremanskicompany.atlassian.net';

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, fields } = req.body || {};
  if (!email || !fields) {
    return res.status(400).json({ error: 'Missing email or fields' });
  }

  const token = process.env.JIRA_TOKEN;
  if (!token) {
    return res.status(500).json({ error: 'Server missing JIRA_TOKEN env var. Set it in Vercel: Settings → Environment Variables.' });
  }

  const auth = Buffer.from(`${email}:${token}`).toString('base64');

  try {
    const r = await fetch(`${JIRA_URL}/rest/api/3/issue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Basic ${auth}`
      },
      body: JSON.stringify({ fields })
    });
    const text = await r.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
    return res.status(r.status).json(data);
  } catch (e) {
    return res.status(502).json({ error: `Upstream error: ${e.message}` });
  }
}
