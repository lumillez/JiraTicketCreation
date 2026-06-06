// GET /api/jira-epics?project=KEY
// Returns all epics for a given project key

const JIRA_URL = 'https://cremanskicompany.atlassian.net';
const EMAIL = 'luca@cremanski.com';

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const project = req.query.project;
  if (!project) {
    return res.status(400).json({ error: 'Missing project query param' });
  }

  const token = process.env.JIRA_TOKEN;
  if (!token) {
    return res.status(500).json({ error: 'Server missing JIRA_TOKEN env var.' });
  }

  const auth = Buffer.from(`${EMAIL}:${token}`).toString('base64');

  try {
    let epics = [];
    let startAt = 0;
    const maxResults = 50;

    while (true) {
      const jql = encodeURIComponent(`project = ${project} AND issuetype = Epic ORDER BY created DESC`);
      const r = await fetch(
        `${JIRA_URL}/rest/api/3/search?jql=${jql}&maxResults=${maxResults}&startAt=${startAt}&fields=summary,key`,
        {
          headers: {
            'Authorization': `Basic ${auth}`,
            'Accept': 'application/json'
          }
        }
      );
      const data = await r.json();
      if (!r.ok) return res.status(r.status).json(data);

      epics = epics.concat(data.issues || []);
      if (epics.length >= data.total || (data.issues || []).length === 0) break;
      startAt += maxResults;
    }

    return res.status(200).json(epics.map(i => ({
      key: i.key,
      summary: i.fields.summary
    })));
  } catch (e) {
    return res.status(502).json({ error: `Upstream error: ${e.message}` });
  }
};
