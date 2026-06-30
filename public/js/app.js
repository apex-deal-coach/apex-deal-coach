// ════════════════════════════════════════════════════════════════
// Apex Deal Coach v1.0 — app.js
// Simplicity-first rebuild. AI makes salespeople wiser, not replaced.
// ════════════════════════════════════════════════════════════════

function el(id) { return document.getElementById(id); }

function showToast(msg) {
  const t = el('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2400);
}

function initials(n) {
  if (!n) return '?';
  return n.split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
}

// ════════════════════════════════════════════════════════════════
// NAVIGATION
// ════════════════════════════════════════════════════════════════

function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  el('screen-' + name).classList.add('active');
  el('nav-' + name).classList.add('active');
  if (name === 'home')      renderHome();
  if (name === 'customers') renderCustomers();
  if (name === 'insights')  renderInsights();
  if (name === 'settings')  refreshAPIStatusLabel();
  window.scrollTo(0, 0);
}

function goHome()           { showScreen('home'); }
function goLiveNew()        { startNewCustomer(); showScreen('live'); }
function goLiveContinue()   { showScreen('live'); }

// ════════════════════════════════════════════════════════════════
// STORAGE — single source of truth
// ════════════════════════════════════════════════════════════════

const DEALS_KEY   = 'apex_v8';          // saved (finished) deals
const DRAFT_KEY    = 'apex_live_draft';  // current in-progress conversation
const SESSION_KEY  = 'apex_session_v1';  // today's counters
const MEM_KEY       = 'apex_memory_v1';   // learning/insights data

function loadDeals()    { try { return JSON.parse(localStorage.getItem(DEALS_KEY) || '[]'); } catch(e) { return []; } }
function saveDeals(arr) { try { localStorage.setItem(DEALS_KEY, JSON.stringify(arr)); } catch(e) {} }

function loadDraft()    { try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch(e) { return null; } }
function saveDraft(d)   { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch(e) {} }
function clearDraft()   { try { localStorage.removeItem(DRAFT_KEY); } catch(e) {} }

function mem_load()    { try { return JSON.parse(localStorage.getItem(MEM_KEY) || '[]'); } catch(e) { return []; } }
function mem_save(arr) { try { localStorage.setItem(MEM_KEY, JSON.stringify(arr)); } catch(e) {} }

function mem_record(entry) {
  const all = mem_load();
  all.push({ ...entry, id: Date.now().toString(36) + Math.random().toString(36).slice(2), ts: entry.ts || Date.now() });
  mem_save(all);
}

function sessionGetCount() {
  try {
    const raw = JSON.parse(localStorage.getItem(SESSION_KEY) || '{}');
    const today = new Date().toDateString();
    if (raw.date !== today) return 0;
    return raw.count || 0;
  } catch(e) { return 0; }
}
function sessionIncrement() {
  const today = new Date().toDateString();
  const count = sessionGetCount() + 1;
  localStorage.setItem(SESSION_KEY, JSON.stringify({ date: today, count }));
}

// ════════════════════════════════════════════════════════════════
// HOME SCREEN
// ════════════════════════════════════════════════════════════════

function renderHome() {
  const hour = new Date().getHours();
  el('greeting').textContent = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  const draft = loadDraft();
  const cc = el('continue-card');
  if (draft && (draft.name || draft.car || draft.notes)) {
    cc.style.display = '';
    el('continue-name').textContent = draft.name || 'Unnamed customer';
    el('continue-sub').textContent  = draft.car ? 'Interested in ' + draft.car : 'No car noted yet';
  } else {
    cc.style.display = 'none';
  }

  el('home-deals').textContent     = sessionGetCount();
  el('home-customers').textContent = loadDeals().length;
}

// ════════════════════════════════════════════════════════════════
// LIVE SCREEN — single conversation, single source of truth (draft)
// ════════════════════════════════════════════════════════════════

let _liveAnalysis = null; // last AI/local analysis result
let _allNotesThisSession = []; // accumulated notes across all Update taps in this conversation

function startNewCustomer() {
  const draft = loadDraft();
  const hasContent = draft && (draft.notes || draft.name || draft.car) && (draft.notes || '').trim().length > 0;
  if (hasContent) {
    if (!confirm('Discard current conversation?\nThis clears notes and AI suggestions.\nSaved customers are not affected.')) return;
  }
  clearDraft();
  el('live-name').value  = '';
  el('live-car').value   = '';
  el('live-notes').value = '';
  el('live-trust').textContent  = '–';
  el('live-intent').textContent = '–';
  el('live-risk').textContent   = '–';
  el('live-advice').style.display = 'none';
  el('status-row').style.display = 'none';
  el('more-advice').style.display = 'none';
  el('more-toggle').classList.remove('open');
  el('live-title').textContent = 'New customer';
  _liveAnalysis = null;
  _allNotesThisSession = [];
  showToast('Ready for a new customer');
}

function liveLoadIntoForm() {
  const draft = loadDraft();
  if (!draft) return;
  el('live-name').value  = draft.name  || '';
  el('live-car').value   = draft.car   || '';
  el('live-notes').value = draft.notes || '';
  el('live-title').textContent = draft.name ? draft.name : 'Customer';
  _allNotesThisSession = draft.allNotes || [];
  if (draft.lastAnalysis) {
    _liveAnalysis = draft.lastAnalysis;
    applyLiveAnalysis(draft.lastAnalysis, true);
  }
}

function liveSaveDraft() {
  const draft = {
    name:  el('live-name').value,
    car:   el('live-car').value,
    notes: el('live-notes').value,
    lastAnalysis: _liveAnalysis,
    allNotes: _allNotesThisSession,
    ts: Date.now()
  };
  saveDraft(draft);
  el('live-title').textContent = draft.name ? draft.name : 'New customer';
}

function liveUpdate() {
  const notes = el('live-notes').value.trim();
  if (!notes) { showToast('Type some notes first'); return; }

  const btn = el('live-update-btn');
  btn.innerHTML = '<div class="spinner"></div> Updating...';

  const name = el('live-name').value, car = el('live-car').value;
  const previousNotes = _allNotesThisSession.join(' ');

  apexAI('live_copilot', { notes, name, car }, { previousNotes }).then(result => {
    const analysis = result || localAnalyse(previousNotes + ' ' + notes);
    _liveAnalysis = analysis;
    _allNotesThisSession.push(notes);
    applyLiveAnalysis(analysis, false);
    liveSaveDraft();
    btn.innerHTML = 'Update';
  });
}

function applyLiveAnalysis(a, silent) {
  el('live-trust').textContent  = a.trust  || '–';
  el('live-intent').textContent = (a.intent != null ? a.intent + '%' : '–');
  el('live-risk').textContent   = a.risk   || '–';
  el('status-row').style.display = '';

  el('advice-question').textContent = a.bestQuestion || a.question || '—';
  el('advice-say').textContent      = a.say    || '—';
  el('advice-warn').textContent     = a.warn   || '—';
  el('advice-action').textContent   = a.action || '—';
  el('live-advice').style.display = '';

  if (!silent) showToast('Updated');
}

function toggleMoreAdvice() {
  const m = el('more-advice');
  const t = el('more-toggle');
  const open = m.style.display !== 'none';
  m.style.display = open ? 'none' : '';
  t.classList.toggle('open', !open);
}

// ── Finish Deal ──
function openFinishSheet() {
  const name  = el('live-name').value.trim();
  const car   = el('live-car').value.trim();
  const notes = el('live-notes').value.trim();
  if (!name && !car && !notes) { showToast('Nothing to save yet'); return; }
  el('finish-modal').classList.add('open');
}

function closeFinishSheet() { el('finish-modal').classList.remove('open'); }

function finishDeal(outcome) {
  closeFinishSheet();

  const name  = el('live-name').value.trim();
  const car   = el('live-car').value.trim();
  const notes = el('live-notes').value.trim();

  const a = _liveAnalysis || {};
  const objectionText = detectObjection(notes);

  const dealRecord = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2),
    ts: Date.now(),
    input: { name, car, notes },
    result: {
      profile: { type: '', stage: a.stage || '', trust: a.trust || '', prob: a.intent || 0 },
      risk: a.risk || 'Medium',
      whatsapp: '',
      bestQuestion: a.bestQuestion || a.question || '',
      objection: objectionText,
      mistakeFlag: detectMistake(notes, a)
    },
    outcome: outcome,
    nextFollowUp: null
  };

  const all = loadDeals();
  all.push(dealRecord);
  saveDeals(all);

  mem_record({
    customerType: '', vehicle: car, budget: 0,
    stage: a.stage || '', objection: objectionText, trust: a.trust || '',
    intent: a.intent || 0, closingProb: a.intent || 0,
    result: outcome, src: 'live'
  });

  sessionIncrement();
  showToast('\u2705 Deal saved to Apex Memory');

  clearDraft();
  setTimeout(() => { startNewCustomer(); showScreen('home'); }, 600);
}

// ════════════════════════════════════════════════════════════════
// LOCAL FALLBACK ANALYSIS — used if GPT API is unavailable
// ════════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════════
// REAL SIGNAL DETECTION — replaces any hardcoded/fake insight data
// ════════════════════════════════════════════════════════════════

function detectObjection(notesRaw) {
  const n = (notesRaw || '').toLowerCase();
  if (n.includes('expensive') || n.includes('too high') || n.includes('price'))     return 'Price too high';
  if (n.includes('think') || n.includes('not sure'))                                 return 'Needs time to think';
  if (n.includes('wife') || n.includes('spouse') || n.includes('husband'))           return 'Needs partner approval';
  if (n.includes('compar') || n.includes('other dealer'))                            return 'Comparing other dealers';
  if (n.includes('loan') || n.includes('reject'))                                    return 'Financing concern';
  if (n.includes('trade'))                                                           return 'Trade-in valuation concern';
  return '';
}

function detectMistake(notesRaw, analysis) {
  const n = (notesRaw || '').toLowerCase();
  if ((n.includes('expensive') || n.includes('price')) && n.includes('discount'))    return 'Offered a discount too early';
  if (analysis && analysis.risk === 'High' && !n.includes('listen'))                 return 'Talked more than listened';
  if (!n.includes('next') && !n.includes('follow') && !n.includes('book'))           return 'No clear next step locked in';
  return '';
}

function localAnalyse(notesRaw) {
  const n = notesRaw.toLowerCase();

  let intent = 40;
  ['like','love','interested','yes','agree','book','test drive','confirm'].forEach(w => { if (n.includes(w)) intent += 8; });
  ['no','not sure','think','expensive','high','compare','later','maybe'].forEach(w => { if (n.includes(w)) intent -= 6; });
  intent = Math.max(5, Math.min(95, intent));

  let trust = 'Medium';
  if (n.includes('trust') || n.includes('recommend') || intent >= 70) trust = 'High';
  if (n.includes('worried') || n.includes('not sure about') || intent <= 30) trust = 'Low';

  let risk = 'Medium';
  if (['wife','spouse','expensive','compare','thinking','not ready'].some(w => n.includes(w))) risk = 'High';
  if (['test drive','book','deposit','confirm'].some(w => n.includes(w)) && risk !== 'High') risk = 'Low';

  let stage = 'Discovery';
  if (n.includes('sign') || n.includes('deposit') || n.includes('confirm')) stage = 'Closing';
  else if (n.includes('expensive') || n.includes('think') || n.includes('wife')) stage = 'Objection';
  else if (n.includes('compar')) stage = 'Comparing';
  else if (intent >= 60) stage = 'Trust Building';

  let bestQuestion = 'What would need to be true for you to feel completely comfortable deciding today?';
  if (stage === 'Discovery')      bestQuestion = 'What is the one thing your current car does not give you that you are looking for now?';
  if (stage === 'Trust Building') bestQuestion = 'What would make you feel fully confident this is the right decision?';
  if (stage === 'Comparing')      bestQuestion = 'Out of everything you have seen, what is still missing?';
  if (stage === 'Objection')      bestQuestion = n.includes('wife') ? 'What would your partner need to see to feel comfortable?' : 'What specifically would need to change here?';
  if (stage === 'Closing')        bestQuestion = 'Is there anything that would stop you from moving forward today?';

  let say = 'Tell me more about what matters most to you here.';
  if (n.includes('monthly') || n.includes('expensive')) say = 'Let me show you a few finance options side by side.';
  if (n.includes('wife') || n.includes('spouse'))        say = 'Would it help if you both came in together?';

  let warn = "Don't fill the silence — let them think.";
  if (n.includes('monthly') || n.includes('expensive')) warn = "Don't cut the price first — try restructuring the loan.";
  if (n.includes('compar'))                              warn = "Don't criticise competitors.";

  let action = 'Listen actively for the next two minutes.';
  if (n.includes('test drive') || intent >= 65) action = 'Book the test drive now.';
  if (n.includes('wife'))                        action = 'Offer a joint visit this weekend.';

  return { mood: 'Neutral', moodIcon: '😐', intent, trust, risk, stage, bestQuestion, say, warn, action, emotions: [] };
}

// ════════════════════════════════════════════════════════════════
// APEX AI BRIDGE — calls /api/apex-ai, falls back to local logic
// ════════════════════════════════════════════════════════════════

async function apexAI(moduleName, input, context) {
  try {
    const resp = await fetch('/api/apex-ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ module: moduleName, input, context: context || null })
    });
    const data = await resp.json();
    if (!resp.ok || !data.ok) {
      console.warn('[ApexAI]', data.error || ('HTTP ' + resp.status));
      _lastAPIError = data.error || ('HTTP ' + resp.status);
      return null;
    }
    _lastAPIError = null;
    return data.result;
  } catch (err) {
    console.warn('[ApexAI] network error', err.message);
    _lastAPIError = err.message;
    return null;
  }
}

let _lastAPIError = null;

function testAPIStatus() {
  const val = el('api-status-val');
  val.textContent = 'Testing...';
  fetch('/api/apex-ai', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ module: 'live_copilot', input: { notes: 'connectivity test' } })
  }).then(r => r.json().then(d => ({ status: r.status, data: d })))
    .then(p => {
      if (p.status === 200 && p.data.ok) { val.textContent = 'Connected'; val.style.color = 'var(--green)'; }
      else { val.textContent = p.data.error || 'Error'; val.style.color = 'var(--red)'; }
    })
    .catch(err => { val.textContent = 'Offline'; val.style.color = 'var(--red)'; });
}

function refreshAPIStatusLabel() {
  el('api-status-val').textContent = 'Tap test below';
  el('api-status-val').style.color = 'var(--muted)';
}

// ════════════════════════════════════════════════════════════════
// CUSTOMERS SCREEN
// ════════════════════════════════════════════════════════════════

function renderCustomers() {
  const q = (el('cust-search').value || '').toLowerCase();
  const all = loadDeals();
  const filtered = q ? all.filter(c =>
    (c.input.name || '').toLowerCase().includes(q) ||
    (c.input.car  || '').toLowerCase().includes(q)
  ) : all;

  el('customers-empty').style.display = all.length === 0 ? '' : 'none';
  const wrap = el('customers-list');

  if (filtered.length === 0) {
    wrap.innerHTML = all.length > 0 ? '<div class="empty-state"><p>No results match your search.</p></div>' : '';
    return;
  }

  wrap.innerHTML = filtered.slice().reverse().map(c => {
    const inp = c.input || {}, res = c.result || {}, prof = res.profile || {};
    const trust = (prof.trust || 'Medium').toLowerCase();
    const dateStr = new Date(c.ts).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' });
    const note = (inp.notes || '').substring(0, 60);
    return `<div class="cust-card" onclick="openCustomerDetail('${c.id}')">
      <div class="cust-top">
        <div class="cust-avatar">${initials(inp.name)}</div>
        <div><div class="cust-name">${inp.name || 'Unnamed'}</div><div class="cust-car">${inp.car || 'No car noted'}</div></div>
        <div class="cust-trust ${trust}">${prof.trust || 'Medium'}</div>
      </div>
      <div class="cust-grid">
        <div class="cust-grid-item">Stage: <b>${prof.stage || '—'}</b></div>
        <div class="cust-grid-item">Outcome: <b>${c.outcome || 'Pending'}</b></div>
        <div class="cust-grid-item">Saved: <b>${dateStr}</b></div>
        <div class="cust-grid-item">Closing: <b>${prof.prob != null ? prof.prob + '%' : '—'}</b></div>
      </div>
      ${note ? `<div class="cust-note">"${note}${(inp.notes||'').length>60?'…':''}"</div>` : ''}
    </div>`;
  }).join('');
}

function openCustomerDetail(id) {
  const c = loadDeals().find(x => x.id === id);
  if (!c) return;
  const inp = c.input || {}, res = c.result || {};
  const dateStr = new Date(c.ts).toLocaleString('en-SG', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  el('detail-content').innerHTML = `
    <div class="modal-title">${inp.name || 'Unnamed customer'}</div>
    <div class="coach-block"><div class="coach-block-lbl">Car</div><div class="coach-block-txt">${inp.car || '—'}</div></div>
    <div class="coach-block"><div class="coach-block-lbl">Saved</div><div class="coach-block-txt">${dateStr}</div></div>
    <div class="coach-block"><div class="coach-block-lbl">Outcome</div><div class="coach-block-txt">${c.outcome || 'Pending'}</div></div>
    ${res.bestQuestion ? `<div class="coach-block"><div class="coach-block-lbl">Best question identified</div><div class="coach-block-txt">${res.bestQuestion}</div></div>` : ''}
    <div class="coach-block"><div class="coach-block-lbl">Notes</div><div class="coach-block-txt">${inp.notes || 'No notes recorded.'}</div></div>
    <button class="big-btn ghost" style="margin-top:1rem" onclick="deleteCustomer('${c.id}')">Delete this record</button>
  `;
  el('detail-modal').classList.add('open');
}

function closeDetail() { el('detail-modal').classList.remove('open'); }

function deleteCustomer(id) {
  if (!confirm('Delete this customer record? This cannot be undone.')) return;
  saveDeals(loadDeals().filter(c => c.id !== id));
  closeDetail();
  showToast('Deleted');
  renderCustomers();
}

// ════════════════════════════════════════════════════════════════
// COACH ME MODAL
// ════════════════════════════════════════════════════════════════

const COACH_CONTENT = {
  question: {
    why: 'A great question builds trust faster than any answer. It shows the customer you are listening, not selling — and customers who feel heard close at a far higher rate than customers who are just talked at.',
    mistake: 'Jumping straight to a recommendation before understanding the real need behind the question.',
    betterQ: 'If this question does not land, try: "What would the ideal outcome look like for you?"'
  },
  say: {
    why: 'What you say next either builds momentum or creates doubt. Keep it to one clear sentence — long explanations dilute confidence, short and direct builds it.',
    mistake: 'Over-explaining or stacking multiple points at once, which makes the customer feel pressured.',
    betterQ: 'Pair this statement with: "Does that make sense for where you are right now?"'
  },
  warn: {
    why: 'Avoiding the wrong move is sometimes more valuable than making the right one — some words can\'t be unsaid, and the trust you have already built is what closes deals.',
    mistake: 'Reacting to pressure by talking more, when the better move is almost always to slow down.',
    betterQ: 'Instead, try asking: "What\'s the most important thing for you to feel good about this?"'
  },
  action: {
    why: 'A specific next action keeps the deal moving without forcing it. Vague plans lose momentum — concrete, time-bound actions create commitment on both sides.',
    mistake: 'Letting the conversation end without a clear next step — this is the #1 reason deals go cold.',
    betterQ: 'Confirm the action with: "Does that work for you, or is there a better time?"'
  }
};

function openCoachMe(type) {
  const c = COACH_CONTENT[type] || COACH_CONTENT.question;
  el('coach-why').textContent      = c.why;
  el('coach-mistake').textContent  = c.mistake;
  el('coach-better-q').textContent = c.betterQ;
  el('coach-more').style.display = 'none';
  el('coach-more-toggle').classList.remove('open');
  el('coach-modal').classList.add('open');
}

function toggleCoachMore() {
  const m = el('coach-more');
  const t = el('coach-more-toggle');
  const open = m.style.display !== 'none';
  m.style.display = open ? 'none' : '';
  t.classList.toggle('open', !open);
}

function closeCoachMe() { el('coach-modal').classList.remove('open'); }


// ════════════════════════════════════════════════════════════════
// INSIGHTS SCREEN
// ════════════════════════════════════════════════════════════════

function mem_freq(arr) {
  const freq = {};
  arr.forEach(v => { if (v) freq[v] = (freq[v] || 0) + 1; });
  return Object.entries(freq).sort((a,b) => b[1] - a[1]);
}
function mem_mode(arr) {
  const f = mem_freq(arr);
  return f.length ? f[0][0] : null;
}

function renderInsights() {
  const all = loadDeals();
  const todayStr = new Date().toDateString();
  const todayCount = all.filter(c => new Date(c.ts).toDateString() === todayStr).length;

  el('ins-today').textContent = todayCount;
  el('ins-saved').textContent = all.length;

  const objections = all.map(c => c.result && c.result.objection).filter(Boolean);
  el('ins-objection').textContent = mem_mode(objections) || 'No data yet';

  const mistakes = all.map(c => c.result && c.result.mistakeFlag).filter(Boolean);
  el('ins-mistake').textContent = mem_mode(mistakes) || 'No data yet';

  const questions = all.map(c => c.result && c.result.bestQuestion).filter(Boolean);
  el('ins-question').textContent = questions.length ? questions[questions.length - 1] : 'No data yet';

  const lost = all.filter(c => c.outcome === 'Lost').length;
  const won  = all.filter(c => c.outcome === 'Won').length;
  let improvement = 'Complete a few more deals to unlock your first tip.';
  if (all.length >= 3) {
    if (lost > won) improvement = 'You\'ve had more lost deals than won recently — try leading with a trust-building question before any price talk tomorrow.';
    else if (won > 0) improvement = 'Good momentum — keep asking your best question before offering any recommendation tomorrow.';
    else improvement = 'Try closing tomorrow\'s first conversation with one clear next action, even if small.';
  }
  el('ins-improve').textContent = improvement;
}

// ── Stat drilldown ──
function openStatDrill(type) {
  const all = loadDeals();
  let title = '', items = [];

  if (type === 'today') {
    const todayStr = new Date().toDateString();
    items = all.filter(c => new Date(c.ts).toDateString() === todayStr);
    title = "Today's customers";
  } else if (type === 'saved') {
    items = all;
    title = 'Deals saved';
  } else if (type === 'objection') {
    const topObjection = el('ins-objection').textContent;
    items = (topObjection && topObjection !== 'No data yet')
      ? all.filter(c => c.result && c.result.objection === topObjection)
      : [];
    title = topObjection && topObjection !== 'No data yet' ? '"' + topObjection + '"' : 'Customers with an objection';
  } else if (type === 'mistake') {
    const topMistake = el('ins-mistake').textContent;
    items = (topMistake && topMistake !== 'No data yet')
      ? all.filter(c => c.result && c.result.mistakeFlag === topMistake)
      : [];
    title = topMistake && topMistake !== 'No data yet' ? '"' + topMistake + '"' : 'Deals with a flagged mistake';
  } else if (type === 'question') {
    const topQuestion = el('ins-question').textContent;
    items = (topQuestion && topQuestion !== 'No data yet')
      ? all.filter(c => c.result && c.result.bestQuestion === topQuestion)
      : [];
    title = 'Where this question was used';
  }

  el('stat-modal-title').textContent = title + ' (' + items.length + ')';
  if (items.length === 0) {
    el('stat-modal-list').innerHTML = '<p style="color:var(--muted);font-size:14px">No deals match this yet.</p>';
  } else {
    el('stat-modal-list').innerHTML = items.slice().reverse().map(c => {
      const inp = c.input || {};
      const dateStr = new Date(c.ts).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' });
      return `<div class="cust-card" onclick="closeStatDrill();openCustomerDetail('${c.id}')">
        <div class="cust-top"><div class="cust-avatar">${initials(inp.name)}</div>
        <div><div class="cust-name">${inp.name || 'Unnamed'}</div><div class="cust-car">${inp.car || ''} · ${dateStr}</div></div></div>
      </div>`;
    }).join('');
  }
  el('stat-modal').classList.add('open');
}
function closeStatDrill() { el('stat-modal').classList.remove('open'); }

// ════════════════════════════════════════════════════════════════
// SETTINGS — Backup / Restore / Clear
// ════════════════════════════════════════════════════════════════

function mem_export() {
  const deals = loadDeals();
  const mem   = mem_load();
  if (!deals.length && !mem.length) { showToast('Nothing to backup yet'); return; }
  const blob = new Blob([JSON.stringify({ exported: new Date().toISOString(), deals, memory: mem }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'apex_backup_' + new Date().toISOString().slice(0,10) + '.json';
  a.click();
  showToast('Backup downloaded');
}

function mem_import(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      const incomingDeals = data.deals  || [];
      const incomingMem   = data.memory || [];

      const existingDeals = loadDeals();
      const existingIds = new Set(existingDeals.map(d => d.id));
      const freshDeals = incomingDeals.filter(d => !existingIds.has(d.id));
      saveDeals([...existingDeals, ...freshDeals]);

      const existingMem = mem_load();
      const existingMemIds = new Set(existingMem.map(m => m.id));
      const freshMem = incomingMem.filter(m => !existingMemIds.has(m.id));
      mem_save([...existingMem, ...freshMem]);

      showToast('Restored ' + freshDeals.length + ' customer(s)');
      renderCustomers(); renderHome();
    } catch(err) { showToast('Restore failed — invalid file'); }
  };
  reader.readAsText(file);
  input.value = '';
}

function mem_reset() {
  if (!confirm('Clear Apex Memory?\nThis removes learning data only — your saved customers are kept.')) return;
  localStorage.removeItem(MEM_KEY);
  showToast('Memory cleared');
}

// ════════════════════════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════════════════════════

(function init() {
  const draft = loadDraft();
  if (draft) liveLoadIntoForm();
  renderHome();
})();
