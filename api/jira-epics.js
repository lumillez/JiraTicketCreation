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
    let nextPageToken = undefined;
    const maxResults = 100;

    while (true) {
      const payload = {
        jql: `project = ${project} AND issuetype = Epic ORDER BY created DESC`,
        maxResults,
        fields: ['summary']
      };
      if (nextPageToken) payload.nextPageToken = nextPageToken;

      const r = await fetch(
        `${JIRA_URL}/rest/api/3/search/jql`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${auth}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        }
      );
      const data = await r.json();
      if (!r.ok) return res.status(r.status).json(data);

      epics = epics.concat(data.issues || []);
      if (data.isLast || !data.nextPageToken) break;
      nextPageToken = data.nextPageToken;
    }

    return res.status(200).json(epics.map(i => ({
      key: i.key,
      summary: i.fields.summary
    })));
  } catch (e) {
    return res.status(502).json({ error: `Upstream error: ${e.message}` });
  }
};
