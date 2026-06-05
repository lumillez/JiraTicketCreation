// === DOM ===
const JIRA_URL = 'https://cremanskicompany.atlassian.net';
const ISSUE_TYPE = 'Story';

const jiraProject = document.getElementById('jiraProject');
const jiraEpic = document.getElementById('jiraEpic');
const pasteInput = document.getElementById('paste');
const parseBtn = document.getElementById('parseBtn');
const clearBtn = document.getElementById('clearBtn');
const parseStatus = document.getElementById('parseStatus');
const ticketsSection = document.getElementById('ticketsSection');
const ticketsContainer = document.getElementById('ticketsContainer');
const createSection = document.getElementById('createSection');
const createBtn = document.getElementById('createBtn');
const ticketCountEl = document.getElementById('ticketCount');
const addTicketBtn = document.getElementById('addTicketBtn');
const modal = document.getElementById('modal');
const modalBody = document.getElementById('modalBody');
const modalClose = document.getElementById('modalClose');

let tickets = [];
let idCounter = 0;

// === Persist Jira config ===
const cfgFields = { jiraProject, jiraEpic };
for (const [key, el] of Object.entries(cfgFields)) {
  const saved = localStorage.getItem(`jira_${key}`);
  if (saved) el.value = saved;
  el.addEventListener('input', () => localStorage.setItem(`jira_${key}`, el.value));
}

// === Parser ===
const SEP_RE = /^\s*[━─\-=]{3,}\s*$/;
const TICKET_NR_RE = /^\s*TICKET\s+NR\.?\s*\**\s*\d+\s*\**\s*$/i;

function parseTickets(text) {
  if (!text || !text.trim()) return { tickets: [], warning: '' };
  const lines = text.split('\n');

  // Primary format: blocks starting with "TICKET NR. **N**"
  const boundaries = [];
  for (let i = 0; i < lines.length; i++) {
    if (TICKET_NR_RE.test(lines[i])) boundaries.push(i);
  }

  if (boundaries.length > 0) {
    const out = [];
    for (let b = 0; b < boundaries.length; b++) {
      const start = boundaries[b] + 1;
      const end = b + 1 < boundaries.length ? boundaries[b + 1] : lines.length;
      const block = lines.slice(start, end);

      // Find first non-empty, non-separator line ⇒ title
      let i = 0;
      while (i < block.length && (block[i].trim() === '' || SEP_RE.test(block[i]))) i++;
      if (i >= block.length) continue;
      const title = cleanTitle(block[i]);

      // Body: lines after the title, trim leading/trailing empty + separator lines
      const bodyLines = block.slice(i + 1);
      while (bodyLines.length && (bodyLines[0].trim() === '' || SEP_RE.test(bodyLines[0]))) bodyLines.shift();
      while (bodyLines.length && (bodyLines[bodyLines.length - 1].trim() === '' || SEP_RE.test(bodyLines[bodyLines.length - 1]))) bodyLines.pop();

      out.push({ title, body: bodyLines.join('\n').trim() });
    }
    return { tickets: out, warning: '' };
  }

  // Fallback: legacy ━━━ separator format
  const hasSeparator = lines.some(l => SEP_RE.test(l));
  if (!hasSeparator) {
    return { tickets: [], warning: 'No "TICKET NR." markers found. Paste the full ticket list from your Claude Project.' };
  }

  const blocks = [];
  let current = [];
  for (const line of lines) {
    if (SEP_RE.test(line)) {
      const joined = current.join('\n').trim();
      if (joined) blocks.push(joined);
      current = [];
    } else {
      current.push(line);
    }
  }
  const tail = current.join('\n').trim();
  if (tail) blocks.push(tail);
  if (blocks.length === 0) return { tickets: [], warning: 'No content between separators.' };

  const out = [];
  if (blocks.length % 2 === 0) {
    for (let i = 0; i < blocks.length; i += 2) {
      out.push({ title: cleanTitle(blocks[i]), body: blocks[i + 1] });
    }
  } else {
    for (const block of blocks) {
      const blines = block.split('\n');
      out.push({ title: cleanTitle(blines[0]), body: blines.slice(1).join('\n').trim() });
    }
  }
  return { tickets: out, warning: '' };
}

function cleanTitle(raw) {
  return String(raw || '')
    .replace(/\*\*/g, '')
    .replace(/^\s*\[/, '')
    .replace(/\]\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// === Render ===
function render() {
  ticketsContainer.innerHTML = '';
  tickets.forEach(renderTicketCard);
  ticketCountEl.textContent = tickets.length;
  const has = tickets.length > 0;
  ticketsSection.classList.toggle('hidden', !has);
  createSection.classList.toggle('hidden', !has);
  createBtn.disabled = !has;
}

function renderTicketCard(ticket) {
  const tpl = document.getElementById('ticketCardTemplate');
  const node = tpl.content.firstElementChild.cloneNode(true);
  node.dataset.ticketId = ticket.id;

  const titleI = node.querySelector('.ticket-title');
  const epicI = node.querySelector('.ticket-epic');
  const bodyI = node.querySelector('.ticket-body');
  const previewEl = node.querySelector('.ticket-preview');

  titleI.value = ticket.title;
  epicI.value = ticket.epic || '';
  epicI.placeholder = jiraEpic.value ? `default: ${jiraEpic.value}` : 'PROJ-123';
  bodyI.value = ticket.body;
  previewEl.innerHTML = marked.parse(ticket.body || '');

  titleI.addEventListener('input', () => { ticket.title = titleI.value; });
  epicI.addEventListener('input', () => { ticket.epic = epicI.value; });
  bodyI.addEventListener('input', () => {
    ticket.body = bodyI.value;
    previewEl.innerHTML = marked.parse(ticket.body || '');
  });
  node.querySelector('.remove-ticket').addEventListener('click', () => {
    tickets = tickets.filter(t => t.id !== ticket.id);
    render();
  });

  ticketsContainer.appendChild(node);
}

// === Wire ===
function doParse() {
  const { tickets: parsed, warning } = parseTickets(pasteInput.value);
  tickets = parsed.map(t => ({ id: ++idCounter, ...t }));
  render();
  if (parsed.length) {
    parseStatus.innerHTML = `<span class="text-emerald-700">Parsed ${parsed.length} ticket${parsed.length !== 1 ? 's' : ''}.</span>`;
  } else if (warning) {
    parseStatus.innerHTML = `<span class="text-amber-700">${escapeHtml(warning)}</span>`;
  } else {
    parseStatus.textContent = '';
  }
}

parseBtn.addEventListener('click', doParse);

clearBtn.addEventListener('click', () => {
  pasteInput.value = '';
  tickets = [];
  render();
  parseStatus.textContent = '';
});

pasteInput.addEventListener('paste', () => {
  setTimeout(doParse, 0);
});

pasteInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    doParse();
  }
});

addTicketBtn.addEventListener('click', () => {
  tickets.push({ id: ++idCounter, title: '', body: '' });
  render();
});

createBtn.addEventListener('click', createInJira);

async function createInJira() {
  const project = jiraProject.value.trim();
  const defaultEpic = jiraEpic.value.trim();

  const missing = [];
  if (!project) missing.push('Product code');
  if (missing.length) {
    showModal('Missing fields', `<p>Fill in Step 1: <strong>${missing.join(', ')}</strong>.</p>`);
    return;
  }

  createBtn.disabled = true;
  const originalLabel = createBtn.innerHTML;
  createBtn.innerHTML = `Creating... 0/${tickets.length}`;

  const results = [];
  for (let i = 0; i < tickets.length; i++) {
    const t = tickets[i];
    if (!t.title.trim()) { results.push({ success: false, ticket: t, error: 'Missing title' }); continue; }
    const epic = (t.epic && t.epic.trim()) || defaultEpic;
    const fields = {
      project: { key: project },
      summary: t.title.trim(),
      description: markdownToAdf(t.body || ''),
      issuetype: { name: ISSUE_TYPE }
    };
    if (epic) fields.parent = { key: epic };

    try {
      const r = await fetch('/api/jira-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields })
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok && data.key) {
        results.push({ success: true, ticket: t, key: data.key, link: `${JIRA_URL}/browse/${data.key}` });
      } else {
        const errMsg = data.error || (data.errorMessages && data.errorMessages.join('; ')) || (data.errors && JSON.stringify(data.errors)) || `HTTP ${r.status}`;
        results.push({ success: false, ticket: t, error: errMsg });
      }
    } catch (e) {
      results.push({ success: false, ticket: t, error: e.message });
    }
    createBtn.innerHTML = `Creating... ${i + 1}/${tickets.length}`;
  }

  createBtn.disabled = false;
  createBtn.innerHTML = originalLabel;
  ticketCountEl.textContent = tickets.length;
  showResults(results);
}

function showResults(results) {
  const ok = results.filter(r => r.success);
  const fail = results.filter(r => !r.success);
  const parts = [];

  if (ok.length) {
    parts.push(`<p class="text-emerald-700 font-semibold mb-2">Created ${ok.length} ticket${ok.length !== 1 ? 's' : ''}:</p>`);
    parts.push('<ul class="list-disc ml-5 space-y-1 mb-3">');
    for (const r of ok) {
      parts.push(`<li><a href="${escapeHtml(r.link)}" target="_blank" class="gold-text underline font-mono">${escapeHtml(r.key)}</a> ${escapeHtml(r.ticket.title)}</li>`);
    }
    parts.push('</ul>');
  }
  if (fail.length) {
    parts.push(`<p class="text-red-700 font-semibold mb-2">Failed ${fail.length} ticket${fail.length !== 1 ? 's' : ''}:</p>`);
    parts.push('<ul class="list-disc ml-5 space-y-2">');
    for (const r of fail) {
      parts.push(`<li><strong>${escapeHtml(r.ticket.title || '(untitled)')}</strong><br><span class="text-xs text-red-700 font-mono">${escapeHtml(r.error)}</span></li>`);
    }
    parts.push('</ul>');
  }
  if (!ok.length && !fail.length) {
    parts.push('<p>No tickets to create.</p>');
  }
  showModal(ok.length && !fail.length ? 'All tickets created' : fail.length && !ok.length ? 'Creation failed' : 'Partial success', parts.join(''));
}

function showModal(title, html) {
  document.querySelector('#modal h3').textContent = title;
  modalBody.innerHTML = html;
  modal.classList.remove('hidden');
}

// === Markdown to Atlassian Document Format (ADF) ===
function markdownToAdf(text) {
  const blocks = [];
  const lines = (text || '').split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) { i++; continue; }
    const boldOnly = /^\*\*(.+?)\*\*\s*$/.exec(trimmed);
    if (boldOnly) {
      blocks.push({ type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: boldOnly[1] }] });
      i++;
      continue;
    }
    if (/^[-*+]\s/.test(trimmed)) {
      const items = [];
      while (i < lines.length && /^[-*+]\s/.test(lines[i].trim())) {
        const itemText = lines[i].trim().replace(/^[-*+]\s+/, '');
        items.push({ type: 'listItem', content: [{ type: 'paragraph', content: parseInlineMd(itemText) }] });
        i++;
      }
      blocks.push({ type: 'bulletList', content: items });
      continue;
    }
    if (/^\d+\.\s/.test(trimmed)) {
      const items = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i].trim())) {
        const itemText = lines[i].trim().replace(/^\d+\.\s+/, '');
        items.push({ type: 'listItem', content: [{ type: 'paragraph', content: parseInlineMd(itemText) }] });
        i++;
      }
      blocks.push({ type: 'orderedList', content: items });
      continue;
    }
    // Collect consecutive paragraph lines
    const paraLines = [];
    while (i < lines.length && lines[i].trim() && !/^\*\*.+?\*\*\s*$/.test(lines[i].trim()) && !/^[-*+]\s/.test(lines[i].trim()) && !/^\d+\.\s/.test(lines[i].trim())) {
      paraLines.push(lines[i].trim());
      i++;
    }
    if (paraLines.length) {
      blocks.push({ type: 'paragraph', content: parseInlineMd(paraLines.join(' ')) });
    }
  }
  return {
    version: 1,
    type: 'doc',
    content: blocks.length ? blocks : [{ type: 'paragraph', content: [{ type: 'text', text: ' ' }] }]
  };
}

function parseInlineMd(text) {
  const out = [];
  let rest = text;
  while (rest.length > 0) {
    const m = /\*\*(.+?)\*\*/.exec(rest);
    if (!m) { out.push({ type: 'text', text: rest }); break; }
    if (m.index > 0) out.push({ type: 'text', text: rest.slice(0, m.index) });
    out.push({ type: 'text', text: m[1], marks: [{ type: 'strong' }] });
    rest = rest.slice(m.index + m[0].length);
  }
  return out.length ? out : [{ type: 'text', text: text }];
}

modalClose.addEventListener('click', () => modal.classList.add('hidden'));
modal.addEventListener('click', (e) => {
  if (e.target === modal) modal.classList.add('hidden');
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !modal.classList.contains('hidden')) modal.classList.add('hidden');
});

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// init
render();
