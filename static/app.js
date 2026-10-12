const $ = (s) => document.querySelector(s);
const documents = $('#documents'), statusEl = $('#upload-status'), conversation = $('#conversation');
// Conversation history lives only in this browser tab and is sent to Groq for context.
const chatHistory = [];

async function api(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok && response.status !== 207) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function ext(name) { return name.split('.').pop().toUpperCase().slice(0,4); }
async function refresh() {
  const s = await api('/api/status');
  $('#doc-count').textContent = s.documents.length;
  $('#connection').className = `connection ${s.groq_configured ? 'ready' : 'error'}`;
  $('#connection').innerHTML = `<i></i>${s.groq_configured ? 'Groq connected' : 'API key not set'}`;
  if (!s.documents.length) { documents.innerHTML = '<div class="empty-docs">Your uploaded handbooks<br>will appear here.</div>'; return; }
  documents.innerHTML = s.documents.map(name => `<article class="doc-card"><div class="file-icon">${escapeHtml(ext(name))}</div><div class="doc-info"><strong title="${escapeHtml(name)}">${escapeHtml(name)}</strong><small>In your library</small></div><div class="doc-actions"><button data-view="${escapeHtml(name)}" title="View extracted text">⌕</button><button data-delete="${escapeHtml(name)}" title="Remove document">×</button></div></article>`).join('');
}
$('#file-input').addEventListener('change', async e => {
  const files = e.target.files; if (!files.length) return;
  const form = new FormData(); [...files].forEach(f => form.append('files', f));
  statusEl.textContent = 'Extracting text…';
  try {
    const data = await api('/api/upload', {method:'POST', body:form});
    // Show extraction preview before reporting indexing success, as a check against bad PDF extraction.
    for (const p of data.previews || []) {
      const box = document.createElement('details'); box.className = 'retrieval-debug';
      box.innerHTML = `<summary>Extracted text preview · ${escapeHtml(p.name)} · ${p.characters.toLocaleString()} characters</summary><pre></pre>`;
      box.querySelector('pre').textContent = p.preview + (p.truncated ? '\n\n… preview truncated; open the document to inspect all extracted text.' : '');
      conversation.prepend(box);
    }
    const added = (data.added || []).map(x => `${x.name} (${x.chunks} chunks)`).join(', ');
    statusEl.textContent = `${added ? `Added ${added}. ` : ''}${(data.errors || []).join(' ')}` || 'Upload complete.';
    await refresh();
  } catch (err) { statusEl.textContent = err.message; }
  e.target.value = '';
});
documents.addEventListener('click', async e => {
  const view = e.target.closest('[data-view]')?.dataset.view;
  const del = e.target.closest('[data-delete]')?.dataset.delete;
  if (view) {
    try { const d = await api(`/api/documents/${encodeURIComponent(view)}/text`); $('#dialog-title').textContent = d.name; $('#dialog-text').textContent = d.text; $('#text-dialog').showModal(); }
    catch (err) { statusEl.textContent = err.message; }
  }
  if (del && confirm(`Remove “${del}” from this assistant?`)) {
    try { await api(`/api/documents/${encodeURIComponent(del)}`, {method:'DELETE'}); await refresh(); }
    catch (err) { statusEl.textContent = err.message; }
  }
});
$('#close-dialog').onclick = () => $('#text-dialog').close();
$('#text-dialog').addEventListener('click', e => { if (e.target === $('#text-dialog')) $('#text-dialog').close(); });
document.querySelectorAll('.suggestions button').forEach(b => b.addEventListener('click', () => { $('#question').value = b.textContent; $('#question').focus(); }));
$('#ask-form').addEventListener('submit', async e => {
  e.preventDefault(); const question = $('#question').value.trim(); if (!question) return;
  $('#welcome').hidden = true; $('#question').value = ''; $('#ask-button').disabled = true;
  chatHistory.push({role:'user', content:question});
  const turn = document.createElement('div'); turn.className = 'turn';
  turn.innerHTML = `<div class="user-question">${escapeHtml(question)}</div><div class="answer-label">HANDBOOK ASSISTANT</div><div class="answer">Thinking…</div>`;
  conversation.append(turn); turn.scrollIntoView({behavior:'smooth', block:'end'});
  try {
    const data = await api('/api/chat', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({messages:chatHistory.slice(-12)})});
    if (data.error) {
      turn.querySelector('.answer').innerHTML = `<div class="error">${escapeHtml(data.error)}</div>`;
      if (data.retrieved?.length) addDebug(turn, data.retrieved);
    } else {
      turn.querySelector('.answer').textContent = data.answer;
      chatHistory.push({role:'assistant', content:data.answer});
      if (data.sources?.length) {
        const block = document.createElement('div'); block.className = 'source-block';
        block.innerHTML = `<div class="source-title">Sources <span>${data.sources.length} passages</span></div>` + data.sources.map(s => `<div class="source-chunk"><strong>${escapeHtml(s.name)} · ${escapeHtml(s.chunk_id)} · match ${s.score}</strong>${escapeHtml(s.text)}</div>`).join('');
        turn.append(block);
        addDebug(turn, data.retrieved);
      }
    }
  } catch (err) { turn.querySelector('.answer').innerHTML = `<div class="error">${escapeHtml(err.message)}</div>`; }
  finally { $('#ask-button').disabled = false; turn.scrollIntoView({behavior:'smooth', block:'end'}); }
});
function addDebug(turn, chunks) {
  const details = document.createElement('details'); details.className = 'retrieval-debug';
  details.innerHTML = '<summary>Debug: all retrieved chunks</summary><pre></pre>';
  details.querySelector('pre').textContent = JSON.stringify(chunks, null, 2); turn.append(details);
}
refresh().catch(err => { $('#connection').className='connection error'; $('#connection').innerHTML=`<i></i>${escapeHtml(err.message)}`; });
