// ============================================================
// Apex Deal Coach — Secure Backend API Route
// File: api/apex-ai.js
//
// HOW IT WORKS:
//   1. Browser sends customer data / notes to /api/apex-ai
//   2. This function (Vercel server) reads OPENAI_API_KEY
//   3. Calls OpenAI — key never reaches the browser
//   4. Returns structured JSON to the frontend
//
// Uses module.exports (CommonJS) — required for Vercel .js functions.
// ============================================================

// ── APEX CONSTITUTION ──────────────────────────────────────
// Embedded into every system prompt. Shapes how GPT reasons.
//
//  1. Trust before expertise.
//  2. Understand before recommending.
//  3. Ask before advising.
//  4. AI increases human capability — does not replace it.
//  5. Every conversation makes the next one better.
//  6. Measure success by user improvement, not AI output volume.
//  7. Recommend questions before recommendations.
// ──────────────────────────────────────────────────────────

var CONSTITUTION =
  'You operate under the Apex Constitution. These seven principles are non-negotiable:\n' +
  '1. Trust before expertise: help the salesperson build trust before showcasing product knowledge.\n' +
  '2. Understand before recommending: never recommend what has not yet been understood about this customer.\n' +
  '3. Ask before advising: always prioritise a powerful question over a direct recommendation.\n' +
  '4. AI increases human capability, not replaces it: coach the salesperson — do not sell for them.\n' +
  '5. Every conversation makes the next better: each output should increase the salesperson understanding of this customer.\n' +
  '6. Measure success by user improvement: a good output makes the salesperson more capable, not more dependent on AI.\n' +
  '7. Recommend questions before recommendations: when uncertain, give a question. The right question reveals more than the right answer.\n';

module.exports = async function handler(req, res) {

  // ── CORS ──
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Use POST.' });
  }

  // ── API key — lives only in Vercel, never in browser ──
  var apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      ok:    false,
      error: 'OPENAI_API_KEY is not configured.',
      fix:   'Vercel -> Project -> Settings -> Environment Variables -> Add OPENAI_API_KEY'
    });
  }

  // ── Parse request ──
  var body    = req.body || {};
  var mod     = body.module;
  var input   = body.input;
  var context = body.context || {};

  if (!mod)   return res.status(400).json({ ok: false, error: 'Missing: module' });
  if (!input) return res.status(400).json({ ok: false, error: 'Missing: input'  });

  // ── System prompts — Constitution woven into every module ──
  var SYSTEMS = {

    coach:
      CONSTITUTION +
      'You are Apex Deal Coach for Singapore car sales.\n' +
      'Analyse customer profiles through the Apex Constitution lens.\n' +
      'Priority: (1) find what you do NOT yet know about this customer, ' +
      '(2) recommend questions that build trust first, ' +
      '(3) then suggest tactics.\n' +
      'Singapore context: COE, LTV, ARF, PARF, EV incentives, HDB parking, ' +
      'instalment-first budgeting, multi-generational family decisions.\n' +
      'Respond with ONLY valid JSON. No markdown. No explanation outside the JSON.',

    followup:
      CONSTITUTION +
      'You are Apex Follow-Up Engine for Singapore car sales.\n' +
      'Per the Constitution: the goal of follow-up is to deepen understanding, ' +
      'not to push toward a close. Every message must contain at least one question ' +
      'that helps the salesperson learn something new about the customer.\n' +
      'Tone: warm, natural, Singapore-appropriate. Never pushy.\n' +
      'Respond with ONLY valid JSON. No markdown. No explanation outside the JSON.',

    objection:
      CONSTITUTION +
      'You are Apex Objection Brain for Singapore car sales psychology.\n' +
      'Per the Constitution (principle 3): your first output is always the single best ' +
      'QUESTION to ask — not a counter-argument, not a tactic.\n' +
      'Decode real concerns: family approval, HDB parking, COE anxiety, loan eligibility, ' +
      'cultural face-saving.\n' +
      'Strategy steps must begin with listening and questioning, not with selling.\n' +
      'Respond with ONLY valid JSON. No markdown. No explanation outside the JSON.',

    match:
      CONSTITUTION +
      'You are Apex Vehicle Match Engine for Singapore.\n' +
      'Per the Constitution (principle 2): understand before recommending. ' +
      'If the profile has gaps, talkingPoints must include questions ' +
      'the salesperson should ask before recommending.\n' +
      'You know: COE categories, depreciation, LTV rules, Singapore market pricing.\n' +
      'Respond with ONLY valid JSON. No markdown. No explanation outside the JSON.',

    live_copilot:
      CONSTITUTION +
      'You are Apex Live Sales Copilot. The salesperson is with a customer RIGHT NOW in Singapore.\n' +
      'Per the Constitution principles 3 and 7:\n' +
      'Your PRIMARY output is bestQuestion: the single most trust-building or ' +
      'intent-revealing question the salesperson can ask right now.\n' +
      'Then whyQuestion: one sentence explaining why this question matters.\n' +
      'Then identify the conversation stage.\n' +
      'Then say, warn, action — one sentence each.\n' +
      'You coach. The salesperson closes.\n' +
      'Respond with ONLY valid JSON. No markdown. No explanation outside the JSON.',

    copilot:
      CONSTITUTION +
      'You are Apex Live Sales Copilot. The salesperson is with a customer RIGHT NOW in Singapore.\n' +
      'Per the Constitution principles 3 and 7:\n' +
      'Your PRIMARY output is bestQuestion: the single most trust-building or ' +
      'intent-revealing question the salesperson can ask right now.\n' +
      'Then whyQuestion: one sentence explaining why this question matters.\n' +
      'Then identify the conversation stage.\n' +
      'Then say, warn, action — one sentence each.\n' +
      'You coach. The salesperson closes.\n' +
      'Respond with ONLY valid JSON. No markdown. No explanation outside the JSON.'
  };

  var systemPrompt = SYSTEMS[mod];
  if (!systemPrompt) {
    return res.status(400).json({
      ok: false,
      error: 'Unknown module: "' + mod + '"',
      validModules: Object.keys(SYSTEMS)
    });
  }

  // ── User prompts ─────────────────────────────────────────
  var userPrompt = '';

  // ─── Deal Coach ──────────────────────────────────────────
  if (mod === 'coach') {
    userPrompt =
      'Analyse this Singapore car customer. Apply the Apex Constitution.\n\n' +
      'Customer data:\n' + JSON.stringify(input, null, 2) + '\n\n' +
      'IMPORTANT:\n' +
      '- questions[] must build trust and uncover situation — not generic sales questions.\n' +
      '- The first question should be the single most trust-building question.\n' +
      '- resp should be a question or empathetic statement, not a pitch.\n' +
      '- whatsapp message must end with a question.\n\n' +
      'Return ONLY this JSON:\n' +
      '{\n' +
      '  "profile": {\n' +
      '    "type": "e.g. Family Buyer",\n' +
      '    "typeIcon": "emoji",\n' +
      '    "stage": "Browsing | Comparing | Negotiating | Ready to buy",\n' +
      '    "stageIcon": "emoji",\n' +
      '    "trust": "Low | Medium | High",\n' +
      '    "trustIcon": "emoji",\n' +
      '    "urgency": "Low | Moderate | High | Very high",\n' +
      '    "prob": 65,\n' +
      '    "probColor": "var(--green) | var(--amb) | var(--red)"\n' +
      '  },\n' +
      '  "concerns": [{ "text": "specific hidden concern", "sub": "why this matters", "dot": "#378ADD" }],\n' +
      '  "questions": [\n' +
      '    "most important trust-building question",\n' +
      '    "question that uncovers buying intent",\n' +
      '    "question that surfaces hidden concerns"\n' +
      '  ],\n' +
      '  "warnings": [{ "main": "Do not [action]", "why": "reason" }],\n' +
      '  "strategy": [{ "t": "Step title", "d": "Step detail" }],\n' +
      '  "concern": "paragraph about the real underlying concern",\n' +
      '  "resp": "opening sentence — a question or empathetic statement, not a pitch",\n' +
      '  "trust": ["trust-building point 1", "trust-building point 2", "trust-building point 3"],\n' +
      '  "discount": "discount handling advice",\n' +
      '  "finance": "finance explanation using their specific numbers if provided",\n' +
      '  "risk": "Low | Medium | High",\n' +
      '  "riskReason": "one sentence",\n' +
      '  "whatsapp": "complete WhatsApp message — must end with a question"\n' +
      '}';
  }

  // ─── Follow-Up Engine ────────────────────────────────────
  else if (mod === 'followup') {
    userPrompt =
      'Generate WhatsApp follow-up messages for this Singapore car sales situation.\n' +
      'Apply the Apex Constitution: each message must contain at least one question.\n\n' +
      'Situation:\n' + JSON.stringify(input, null, 2) + '\n\n' +
      'Return ONLY this JSON:\n' +
      '{\n' +
      '  "mainMsg": "warm WhatsApp message that ends with a question",\n' +
      '  "shortMsg": "3-4 sentence version, also ends with a question",\n' +
      '  "strongMsg": "more direct version — still asks a question",\n' +
      '  "strategy": ["step 1", "step 2", "step 3"],\n' +
      '  "bestTime": "specific day and time to send",\n' +
      '  "donts": ["thing to avoid 1", "thing to avoid 2", "thing to avoid 3"]\n' +
      '}';
  }

  // ─── Objection Brain ─────────────────────────────────────
  else if (mod === 'objection') {
    var objText = (typeof input === 'string') ? input : (input.objection || JSON.stringify(input));
    var ctxStr  = (Object.keys(context).length > 0) ? JSON.stringify(context) : 'none';
    userPrompt =
      'Analyse this Singapore car sales objection. Apply the Apex Constitution.\n' +
      'question field must be the single most trust-building question — not a counter-argument.\n\n' +
      'Objection: "' + objText + '"\n' +
      'Context: ' + ctxStr + '\n\n' +
      'Return ONLY this JSON:\n' +
      '{\n' +
      '  "real": [\n' +
      '    { "label": "most likely real hidden concern", "pct": 72 },\n' +
      '    { "label": "second possible concern", "pct": 50 },\n' +
      '    { "label": "third possible concern", "pct": 35 }\n' +
      '  ],\n' +
      '  "psych": "psychology explanation in Singapore context",\n' +
      '  "question": "single best trust-building question to ask right now",\n' +
      '  "donts": [\n' +
      '    { "x": "❌", "text": "thing not to say", "why": "why it hurts" },\n' +
      '    { "x": "❌", "text": "second thing to avoid", "why": "why" }\n' +
      '  ],\n' +
      '  "strategy": [\n' +
      '    { "t": "Step 1 — listen and question", "d": "detail" },\n' +
      '    { "t": "Step 2 — understand the real concern", "d": "detail" },\n' +
      '    { "t": "Step 3 — only then respond", "d": "detail" }\n' +
      '  ],\n' +
      '  "closing": 58,\n' +
      '  "closeNote": "one sentence on what this probability means"\n' +
      '}';
  }

  // ─── Vehicle Match ───────────────────────────────────────
  else if (mod === 'match') {
    userPrompt =
      'Recommend top 5 vehicles for this Singapore buyer. Apply the Apex Constitution.\n' +
      'If profile has gaps, include questions in talkingPoints the salesperson should ask first.\n\n' +
      'Customer profile:\n' + JSON.stringify(input, null, 2) + '\n\n' +
      'Return ONLY this JSON:\n' +
      '{\n' +
      '  "recommendations": [{\n' +
      '    "name": "Full vehicle name",\n' +
      '    "score": 88,\n' +
      '    "segment": "e.g. Compact SUV",\n' +
      '    "type": "Sedan | SUV | Hatchback | MPV | Sports | Luxury",\n' +
      '    "reasons": ["reason 1 for this buyer", "reason 2", "reason 3"],\n' +
      '    "pros": ["pro 1", "pro 2", "pro 3", "pro 4"],\n' +
      '    "cons": ["con 1", "con 2", "con 3"],\n' +
      '    "ideal": "who this car is ideal for",\n' +
      '    "avoid": "who should not buy this",\n' +
      '    "depr": 8500,\n' +
      '    "monthlyEst": 1480,\n' +
      '    "priceMin": 115000,\n' +
      '    "priceMax": 148000,\n' +
      '    "objections": ["likely objection 1", "likely objection 2"]\n' +
      '  }],\n' +
      '  "alternatives": [{ "name": "Alternative", "why": "reason" }],\n' +
      '  "talkingPoints": [\n' +
      '    "question to ask if profile is incomplete",\n' +
      '    "talking point 2 specific to this buyer",\n' +
      '    "talking point 3",\n' +
      '    "talking point 4",\n' +
      '    "talking point 5"\n' +
      '  ]\n' +
      '}';
  }

  // ─── Live Sales Copilot (enhanced with Constitution) ─────
  else if (mod === 'live_copilot' || mod === 'copilot') {
    var liveNotes = (typeof input === 'string') ? input : (input.notes || input.liveNotes || JSON.stringify(input));
    var prevNotes = context.previousNotes || '';
    var dealCtx   = context.dealContext   || '';

    userPrompt =
      'A Singapore car salesperson is with a customer RIGHT NOW.\n' +
      'Apply the Apex Constitution — especially principles 3 and 7.\n\n' +
      'Your PRIMARY outputs are:\n' +
      '1. stage: identify which stage the conversation is at\n' +
      '2. bestQuestion: the single most trust-building or intent-revealing question to ask now\n' +
      '3. whyQuestion: ONE sentence — why this question matters at this stage\n' +
      'Then: say, warn, action (one sentence each).\n\n' +
      'Current notes:\n' + liveNotes + '\n' +
      (prevNotes ? ('Earlier in conversation: ' + prevNotes + '\n') : '') +
      (dealCtx   ? ('Deal context: ' + dealCtx + '\n') : '') +
      '\nReturn ONLY this JSON:\n' +
      '{\n' +
      '  "stage": "Discovery | Trust Building | Comparing | Objection | Closing | Follow-up",\n' +
      '  "mood": "Positive | Neutral | Concerned | Frustrated | Excited",\n' +
      '  "moodIcon": "single emoji",\n' +
      '  "intent": 65,\n' +
      '  "trust": "Low | Medium | High",\n' +
      '  "risk": "Low | Medium | High",\n' +
      '  "emotions": [{ "label": "e.g. Price Sensitive", "color": "var(--red)", "bg": "var(--rbg)" }],\n' +
      '  "bestQuestion": "the single best question to ask the customer right now",\n' +
      '  "whyQuestion": "one sentence — why this question builds trust or reveals intent",\n' +
      '  "say": "ONE sentence — what to say immediately after asking the question",\n' +
      '  "warn": "ONE sentence — the one thing to avoid saying right now and why",\n' +
      '  "action": "ONE sentence — the single most important action to take next"\n' +
      '}';
  }

  // ── Call OpenAI ───────────────────────────────────────────
  var openAIResp;
  try {
    openAIResp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': 'Bearer ' + apiKey
      },
      body: JSON.stringify({
        model:           'gpt-4o-mini',
        temperature:     0.35,
        max_tokens:      2000,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userPrompt   }
        ]
      })
    });
  } catch (netErr) {
    console.error('[ApexAI] Network error:', netErr.message);
    return res.status(503).json({ ok: false, error: 'Cannot reach OpenAI.', detail: netErr.message });
  }

  if (!openAIResp.ok) {
    var errText = '';
    try { errText = await openAIResp.text(); } catch(e) {}
    console.error('[ApexAI] OpenAI HTTP', openAIResp.status, errText.substring(0, 200));
    var friendlyError = {
      401: 'Invalid API key — check OPENAI_API_KEY in Vercel Environment Variables.',
      429: 'OpenAI rate limit or quota exceeded — check platform.openai.com/usage.',
      500: 'OpenAI internal server error — try again.',
      503: 'OpenAI temporarily unavailable — try again.'
    }[openAIResp.status] || ('OpenAI returned HTTP ' + openAIResp.status);
    return res.status(502).json({ ok: false, error: friendlyError, status: openAIResp.status, detail: errText.substring(0, 300) });
  }

  var oaiData;
  try { oaiData = await openAIResp.json(); }
  catch(e) { return res.status(502).json({ ok: false, error: 'OpenAI response not JSON.' }); }

  var rawText = oaiData.choices && oaiData.choices[0] && oaiData.choices[0].message && oaiData.choices[0].message.content;
  if (!rawText) {
    console.error('[ApexAI] Empty content');
    return res.status(502).json({ ok: false, error: 'OpenAI returned empty content.' });
  }

  var parsed;
  try { parsed = JSON.parse(rawText); }
  catch(jsonErr) {
    console.error('[ApexAI] Invalid JSON:', rawText.substring(0, 200));
    return res.status(502).json({ ok: false, error: 'GPT returned invalid JSON.', preview: rawText.substring(0, 150) });
  }

  console.log('[ApexAI] OK module=' + mod + ' tokens=' + (oaiData.usage ? oaiData.usage.total_tokens : '?'));
  return res.status(200).json({ ok: true, module: mod, result: parsed, tokens: oaiData.usage ? oaiData.usage.total_tokens : 0 });
};
