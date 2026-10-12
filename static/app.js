const $ = (s) => document.querySelector(s);
const documents = $('#documents'), statusEl = $('#upload-status'), conversation = $('#conversation');
const suggestedPanel = $('#suggested-panel'), suggestedList = $('#suggested-list'), uploadLog = $('#upload-log');

async function api(url, options = {}) {
  const response = await fetch(url, options);
  let data;
  try {
    data = await response.json();
  } catch {
    const text = await response.text();
    throw new Error(text.startsWith('<!') ? 'Server returned HTML instead of JSON. Is python app.py running?' : text.slice(0, 200));
  }
  if (!response.ok && response.status !== 207) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function ext(name) { return name.split('.').pop().toUpperCase().slice(0,4); }

const STOP = new Set('a an the is are was were be been being do does did can could would should what which when where how who whom why to of in on at by for from with about into after before during and or but if then than this that these those i me my we our you your it its they their he she as per have has had'.split(' '));

function termsFromQuestion(question) {
  return [...new Set(String(question).toLowerCase().match(/[a-z0-9][a-z0-9'-]*/g) || [])]
    .filter(w => w.length > 2 && !STOP.has(w));
}

function highlightExcerpt(text, question, answer) {
  const terms = [...new Set([...termsFromQuestion(question), ...termsFromQuestion(answer)])];
  let html = escapeHtml(text);
  terms.sort((a, b) => b.length - a.length);
  for (const term of terms.slice(0, 12)) {
    const re = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    html = html.replace(re, '<mark>$1</mark>');
  }
  return html;
}

let activeSuggestionDoc = null;
let lastSuggestionsStore = {};
const dismissedSuggestions = new Set(
  JSON.parse(sessionStorage.getItem('dismissedSuggestions') || '[]')
);

function persistDismissed() {
  sessionStorage.setItem('dismissedSuggestions', JSON.stringify([...dismissedSuggestions]));
}

function dismissSuggestedDoc(name) {
  dismissedSuggestions.add(name);
  persistDismissed();
  if (activeSuggestionDoc === name) activeSuggestionDoc = null;
  renderSuggestedPanel(lastSuggestionsStore);
}

function readSuggestionsStoreFromDom() {
  const store = {};
  suggestedList.querySelectorAll('details.suggested-doc').forEach(el => {
    const doc = el.dataset.doc;
    store[doc] = [...el.querySelectorAll('.suggestions button')].map(b => b.textContent);
  });
  return store;
}

function renderSuggestedPanel(allSuggestions) {
  lastSuggestionsStore = { ...(allSuggestions || {}) };
  suggestedList.innerHTML = '';
  const entries = Object.entries(lastSuggestionsStore).filter(
    ([name, qs]) => qs?.length && !dismissedSuggestions.has(name)
  );
  $('#suggested-empty').hidden = entries.length > 0;
  if (!entries.length) activeSuggestionDoc = null;

  for (const [name, questions] of entries) {
    const details = document.createElement('details');
    details.className = 'suggested-doc';
    details.dataset.doc = name;
    const shouldOpen = activeSuggestionDoc
      ? name === activeSuggestionDoc
      : entries.length === 1;
    details.open = shouldOpen;

    const summary = document.createElement('summary');
    summary.className = 'suggested-doc-head';
    summary.innerHTML = `
      <span class="suggested-doc-title" title="${escapeHtml(name)}">${escapeHtml(name)}</span>
      <span class="suggested-count">${questions.length}</span>
      <button type="button" class="suggested-close" aria-label="Hide these questions">×</button>`;
    summary.querySelector('.suggested-close').addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dismissSuggestedDoc(name);
    });
    details.addEventListener('toggle', () => {
      if (details.open) activeSuggestionDoc = name;
    });

    const row = document.createElement('div');
    row.className = 'suggestions';
    questions.forEach(q => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = q;
      b.addEventListener('click', () => { $('#question').value = q; syncAskButton(); $('#question').focus(); });
      row.append(b);
    });
    details.append(summary, row);
    suggestedList.append(details);
  }
}

function upsertSuggestedDoc(name, questions) {
  dismissedSuggestions.delete(name);
  persistDismissed();
  activeSuggestionDoc = name;
  const store = { ...lastSuggestionsStore, ...readSuggestionsStoreFromDom(), [name]: questions };
  renderSuggestedPanel(store);
}

let pendingDelete = null;

function confirmDeleteDocument(name) {
  return new Promise((resolve) => {
    pendingDelete = { resolve };
    $('#confirm-delete-name').textContent = name;
    $('#confirm-delete-dialog').showModal();
  });
}

function finishDeleteConfirm(confirmed) {
  const pending = pendingDelete;
  pendingDelete = null;
  $('#confirm-delete-dialog').close();
  pending?.resolve(confirmed);
}

$('#confirm-delete-cancel').addEventListener('click', () => finishDeleteConfirm(false));
$('#confirm-delete-close').addEventListener('click', () => finishDeleteConfirm(false));
$('#confirm-delete-ok').addEventListener('click', () => finishDeleteConfirm(true));
$('#confirm-delete-dialog').addEventListener('click', (e) => {
  if (e.target === $('#confirm-delete-dialog')) finishDeleteConfirm(false);
});
$('#confirm-delete-dialog').addEventListener('cancel', (e) => {
  e.preventDefault();
  finishDeleteConfirm(false);
});

async function loadCachedSuggestions() {
  try {
    const data = await api('/api/suggestions');
    renderSuggestedPanel(data.suggestions || {});
  } catch { /* ignore on first load */ }
}

function renderSources(turn, sources, question, answer) {
  const list = sources || [];
  const block = document.createElement('div');
  block.className = 'source-block';
  block.innerHTML = `<div class="source-title">Where this answer comes from <span>${list.length} passage${list.length === 1 ? '' : 's'}</span></div>`;
  list.forEach(s => {
    const card = document.createElement('article');
    card.className = 'source-chunk';
    const loc = s.chunk_number
      ? `Passage ${s.chunk_number} of ${s.chunk_total} in this file`
      : 'Retrieved passage';
    const rank = s.rank || 0;
    card.innerHTML = `
      <div class="source-head">
        <span class="source-rank">#${rank}</span>
        <div class="source-meta">
          <strong>${escapeHtml(s.name)}</strong>
          <span>${escapeHtml(loc)} · chunk <code>${escapeHtml(s.chunk_id)}</code></span>
        </div>
        <span class="source-score" title="Similarity score">${Math.round((s.score || 0) * 100)}% match</span>
      </div>
      <p class="source-label">Relevant excerpt <em>(highlighted terms overlap your question or answer)</em></p>
      <div class="source-excerpt"></div>
      <button type="button" class="source-open">View in full document</button>`;
    card.querySelector('.source-excerpt').innerHTML = highlightExcerpt(s.text, question, answer);
    card.querySelector('.source-open').addEventListener('click', () => openAtPassage(s.name, s.text));
    block.append(card);
  });
  turn.append(block);
  if (list.length) {
    const details = document.createElement('details');
    details.className = 'retrieval-debug';
    details.innerHTML = '<summary>Technical debug (JSON)</summary><pre></pre>';
    details.querySelector('pre').textContent = JSON.stringify(list, null, 2);
    turn.append(details);
  }
}

async function openAtPassage(name, chunkText) {
  const d = await api(`/api/documents/${encodeURIComponent(name)}/text`);
  const dialog = $('#text-dialog');
  $('#dialog-title').textContent = d.name;
  const pre = $('#dialog-text');
  const full = d.text || '';
  const idx = full.indexOf(chunkText.slice(0, 80));
  if (idx >= 0) {
    const start = Math.max(0, idx - 400);
    const end = Math.min(full.length, idx + chunkText.length + 400);
    const before = escapeHtml(full.slice(start, idx));
    const mid = highlightExcerpt(full.slice(idx, idx + chunkText.length), $('#question').value, '');
    const after = escapeHtml(full.slice(idx + chunkText.length, end));
    pre.innerHTML = (start > 0 ? '…' : '') + before + mid + after + (end < full.length ? '…' : '');
  } else {
    pre.textContent = chunkText + '\n\n—\n\n(Could not locate this passage in the stored extract; showing chunk only.)';
  }
  dialog.showModal();
}

async function refresh() {
  const s = await api('/api/status');
  const n = s.documents.length;
  $('#doc-count').textContent = n;
  const summaryCount = $('#doc-count-summary');
  if (summaryCount) summaryCount.textContent = n;
  $('#corpus-stats').textContent = s.chunks
    ? `${s.estimated_pages} pg · ${s.chunks} chunks · ${s.retrieval}`
    : 'Upload or run reindex_corpus.py';
  $('#connection').className = `connection ${s.groq_configured ? 'ready' : 'error'}`;
  $('#connection').innerHTML = `<i></i>${s.groq_configured ? 'Groq connected' : 'API key not set'}`;
  if (!s.documents.length) {
    documents.innerHTML = '<div class="empty-docs">Your uploaded handbooks<br>will appear here.</div>';
    return;
  }
  documents.innerHTML = s.documents.map(name => `<article class="doc-card"><div class="file-icon">${escapeHtml(ext(name))}</div><div class="doc-info"><strong title="${escapeHtml(name)}">${escapeHtml(name)}</strong><small>In your library</small></div><div class="doc-actions"><button data-suggest="${escapeHtml(name)}" title="Generate suggested questions">?</button><button data-view="${escapeHtml(name)}" title="View extracted text">⌕</button><button data-delete="${escapeHtml(name)}" title="Remove document">×</button></div></article>`).join('');
  await loadCachedSuggestions();
}

$('#file-input').addEventListener('change', async e => {
  const files = e.target.files; if (!files.length) return;
  const form = new FormData(); [...files].forEach(f => form.append('files', f));
  statusEl.textContent = 'Extracting text and suggesting questions…';
  try {
    const data = await api('/api/upload', {method:'POST', body:form});
    for (const p of data.previews || []) {
      const box = document.createElement('details');
      box.className = 'upload-preview';
      box.innerHTML = `<summary>${escapeHtml(p.name)} · ${p.characters.toLocaleString()} chars</summary><pre></pre>`;
      box.querySelector('pre').textContent = p.preview + (p.truncated ? '\n\n… truncated' : '');
      uploadLog.prepend(box);
    }
    for (const item of data.added || []) {
      upsertSuggestedDoc(item.name, item.suggested_questions || []);
    }
    const added = (data.added || []).map(x => {
      const q = (x.suggested_questions || []).length;
      return `${x.name} (${x.chunks} chunks${q ? `, ${q} questions` : ''})`;
    }).join(', ');
    statusEl.textContent = `${added ? `Added ${added}. ` : ''}${(data.errors || []).join(' ')}` || 'Upload complete.';
    await refresh();
  } catch (err) { statusEl.textContent = err.message; }
  e.target.value = '';
});

documents.addEventListener('click', async e => {
  const suggest = e.target.closest('[data-suggest]')?.dataset.suggest;
  const view = e.target.closest('[data-view]')?.dataset.view;
  const del = e.target.closest('[data-delete]')?.dataset.delete;
  if (suggest) {
    statusEl.textContent = `Generating questions for ${suggest}…`;
    try {
      const d = await api(`/api/documents/${encodeURIComponent(suggest)}/suggestions`, {method:'POST'});
      upsertSuggestedDoc(d.name, d.questions || []);
      suggestedPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      statusEl.textContent = `Suggested ${(d.questions || []).length} questions for ${d.name}. Click the heading to collapse, or × to hide.`;
    } catch (err) { statusEl.textContent = err.message; }
  }
  if (view) {
    try {
      const d = await api(`/api/documents/${encodeURIComponent(view)}/text`);
      $('#dialog-title').textContent = d.name;
      $('#dialog-text').textContent = d.text;
      $('#text-dialog').showModal();
    } catch (err) { statusEl.textContent = err.message; }
  }
  if (del && await confirmDeleteDocument(del)) {
    try {
      await api(`/api/documents/${encodeURIComponent(del)}`, {method:'DELETE'});
      dismissedSuggestions.delete(del);
      persistDismissed();
      await loadCachedSuggestions();
      await refresh();
      statusEl.textContent = `Removed ${del}.`;
    } catch (err) { statusEl.textContent = err.message; }
  }
});

$('#close-dialog').onclick = () => $('#text-dialog').close();
$('#text-dialog').addEventListener('click', e => { if (e.target === $('#text-dialog')) $('#text-dialog').close(); });

function syncAskButton() {
  const hasText = $('#question').value.trim().length > 0;
  $('#ask-button').disabled = !hasText;
}

$('#question').addEventListener('input', syncAskButton);
document.querySelectorAll('#starter-questions button').forEach(b => b.addEventListener('click', () => {
  $('#question').value = b.textContent;
  syncAskButton();
  $('#question').focus();
}));

$('#ask-form').addEventListener('submit', async e => {
  e.preventDefault();
  const question = $('#question').value.trim();
  if (!question) return;
  $('#welcome').hidden = true;
  $('#question').value = '';
  syncAskButton();
  $('#ask-button').disabled = true;
  const turn = document.createElement('article');
  turn.className = 'turn';
  turn.innerHTML = `<div class="user-question">${escapeHtml(question)}</div><div class="answer-label">HANDBOOK ASSISTANT</div><div class="answer">Retrieving passages…</div>`;
  conversation.appendChild(turn);
  turn.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  try {
    const data = await api('/api/ask', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({question})});
    if (data.error) {
      turn.querySelector('.answer').innerHTML = `<div class="error">${escapeHtml(data.error)}</div>`;
    } else {
      turn.querySelector('.answer').textContent = data.answer;
    }
    renderSources(turn, data.sources, question, data.answer || '');
  } catch (err) {
    turn.querySelector('.answer').innerHTML = `<div class="error">${escapeHtml(err.message)}</div>`;
  } finally {
    syncAskButton();
    turn.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
});

syncAskButton();

function initMobileLayout() {
  const library = $('#library-collapsible');
  if (!library || !window.matchMedia('(max-width: 750px)').matches) return;
  library.removeAttribute('open');
}

initMobileLayout();
refresh().catch(err => { $('#connection').className='connection error'; $('#connection').innerHTML=`<i></i>${escapeHtml(err.message)}`; });
