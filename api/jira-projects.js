// GET /api/jira-projects
// Returns all Jira projects where category != "Closed"

const JIRA_URL = 'https://cremanskicompany.atlassian.net';
const EMAIL = 'luca@cremanski.com';

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = process.env.JIRA_TOKEN;
  if (!token) {
    return res.status(500).json({ error: 'Server missing JIRA_TOKEN env var.' });
  }

  const auth = Buffer.from(`${EMAIL}:${token}`).toString('base64');

  try {
    let projects = [];
    let startAt = 0;
    const maxResults = 50;

    while (true) {
      const r = await fetch(
        `${JIRA_URL}/rest/api/3/project/search?maxResults=${maxResults}&startAt=${startAt}&expand=projectKeys`,
        {
          headers: {
            'Authorization': `Basic ${auth}`,
            'Accept': 'application/json'
          }
        }
      );
      const data = await r.json();
      if (!r.ok) return res.status(r.status).json(data);

      const batch = (data.values || []).filter(p => {
        const cat = (p.projectCategory && p.projectCategory.name) || '';
        return cat.toLowerCase() !== 'closed';
      });
      projects = projects.concat(batch);

      if (data.isLast || projects.length >= data.total) break;
      startAt += maxResults;
    }

    return res.status(200).json(projects.map(p => ({
      key: p.key,
      name: p.name,
      category: (p.projectCategory && p.projectCategory.name) || ''
    })));
  } catch (e) {
    return res.status(502).json({ error: `Upstream error: ${e.message}` });
  }
};
