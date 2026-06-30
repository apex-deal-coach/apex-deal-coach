// ============================================================
// Apex Deal Coach — Secure Backend API Route
// File: api/apex-ai.js
// Version: v1.5 — Sales Brain Edition
//
// HOW IT WORKS:
//   1. Browser sends data to POST /api/apex-ai
//   2. This function (on Vercel servers) reads OPENAI_API_KEY
//   3. Calls OpenAI — the key never reaches the browser
//   4. Returns structured JSON to the app
//
// IMPORTANT: Uses module.exports (CommonJS).
// Do NOT change to "export default" — Vercel will break.
// ============================================================

// ── APEX CONSTITUTION ──────────────────────────────────────
// Nine principles. Non-negotiable. Every response.
//
//  1. Trust before expertise.
//  2. Understand before recommending.
//  3. Ask before advising.
//  4. AI increases human capability — does not replace it.
//  5. Every conversation makes the next one better.
//  6. Measure success by salesperson improvement, not AI output.
//  7. Recommend questions before recommendations.
//  8. Apex never teaches scripts. Apex teaches judgment.
//  9. Apex reduces cognitive load, not increases it.
// ──────────────────────────────────────────────────────────

var CONSTITUTION =
  'You operate under the Apex Constitution. These nine principles are non-negotiable and must shape every response:\n' +
  '1. Trust before expertise: help the salesperson build trust before showcasing product knowledge.\n' +
  '2. Understand before recommending: never recommend what has not yet been fully understood about this customer.\n' +
  '3. Ask before advising: always prioritise a powerful question over a direct recommendation.\n' +
  '4. AI increases human capability, not replaces it: coach the salesperson — do not sell for them.\n' +
  '5. Every conversation makes the next better: each output should increase the salesperson understanding of this specific customer.\n' +
  '6. Measure success by user improvement: a good output makes the salesperson more capable, not more dependent on AI.\n' +
  '7. Recommend questions before recommendations: when uncertain, give a question. The right question reveals more than the right answer.\n' +
  '8. Apex never teaches scripts. Apex teaches judgment. Never produce a generic line to recite — produce reasoning specific to this customer that builds the salesperson\'s own skill over time.\n' +
  '9. Apex reduces cognitive load, not increases it. Every output must make the next decision easier, not add more for the salesperson to process. One question. One objective. One thing to avoid. Never a list of options.\n';

module.exports = async function handler(req, res) {

  // ── CORS ──────────────────────────────────────────────────
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Use POST.' });
  }

  // ── API key — lives only in Vercel, never in browser ──────
  var apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      ok:    false,
      error: 'OPENAI_API_KEY is not set in Vercel Environment Variables.',
      fix:   'Vercel -> Project -> Settings -> Environment Variables -> Add OPENAI_API_KEY'
    });
  }

  // ── Parse request body ────────────────────────────────────
  var body    = req.body || {};
  var mod     = body.module;
  var input   = body.input;
  var context = body.context || {};

  if (!mod)   return res.status(400).json({ ok: false, error: 'Missing field: module' });
  if (!input) return res.status(400).json({ ok: false, error: 'Missing field: input'  });

  // ── System prompts — Constitution embedded in all ─────────
  var SYSTEMS = {

    // ── Deal Coach ───────────────────────────────────────────
    coach:
      CONSTITUTION +
      'You are Apex Deal Coach for Singapore car sales.\n' +
      'Analyse customer profiles through the Apex Constitution lens.\n' +
      'Priority order: (1) identify what you do NOT yet know about this customer, ' +
      '(2) generate questions that build trust, ' +
      '(3) only then suggest sales tactics.\n' +
      'Singapore market context: COE, LTV rules, ARF, PARF, EV incentives, ' +
      'HDB parking constraints, instalment-first budgeting, multi-generational family decisions.\n' +
      'Respond with ONLY valid JSON. No markdown. No text outside the JSON object.',

    // ── Follow-Up Engine ─────────────────────────────────────
    followup:
      CONSTITUTION +
      'You are Apex Follow-Up Engine for Singapore car sales.\n' +
      'Per the Constitution: the goal of follow-up is to deepen understanding of the customer, ' +
      'not to push toward a close. Every generated message must contain at least one question ' +
      'that helps the salesperson learn something new.\n' +
      'Tone: warm, natural, Singapore-appropriate. Never pushy or generic.\n' +
      'Respond with ONLY valid JSON. No markdown. No text outside the JSON object.',

    // ── Objection Brain ──────────────────────────────────────
    objection:
      CONSTITUTION +
      'You are Apex Objection Brain for Singapore car sales psychology.\n' +
      'Per the Constitution (principle 3): your first and most important output is always ' +
      'the single best QUESTION to ask — not a counter-argument, not a closing tactic.\n' +
      'Decode real concerns considering: family approval dynamics, HDB parking concerns, ' +
      'COE anxiety, loan eligibility rules, cultural face-saving in Singapore.\n' +
      'Strategy steps must begin with listening and questioning, not with selling.\n' +
      'Respond with ONLY valid JSON. No markdown. No text outside the JSON object.',

    // ── Vehicle Match ────────────────────────────────────────
    match:
      CONSTITUTION +
      'You are Apex Vehicle Match Engine for Singapore.\n' +
      'Per the Constitution (principle 2): understand before recommending. ' +
      'If the customer profile has gaps, talkingPoints must include questions ' +
      'the salesperson should ask to fill those gaps before recommending.\n' +
      'You know Singapore-specific context: COE categories, depreciation, LTV rules, ' +
      'current market pricing, popular models and their trade-off profiles.\n' +
      'Respond with ONLY valid JSON. No markdown. No text outside the JSON object.',

    // ── Apex Sales Brain ─────────────────────────────────────
    live_copilot:
      CONSTITUTION +
      'You are Apex Sales Brain. The salesperson is with a customer RIGHT NOW in Singapore.\n' +
      'You must reason through exactly five steps, in this order, every time:\n' +
      '  1. What is the customer feeling? (e.g. Curious, Defensive, Excited, Confused, Hesitating)\n' +
      '  2. Why are they feeling this? (e.g. Budget, Family, Trust, Comparison, Previous bad experience)\n' +
      '  3. What is the salesperson trying to achieve right now? (e.g. Build trust, Discover motivation, ' +
      '     Reduce price sensitivity, Handle objection, Create urgency, Close)\n' +
      '  4. What is the single best next question? Exactly ONE question. Never offer alternatives or a list.\n' +
      '  5. What should the salesperson NEVER do next? A specific, situational thing to avoid -- not generic advice.\n' +
      'Only after these five steps do you produce: say, action, and the conversation stage.\n' +
      'Conversation stage is always exactly one of: Exploring, Interested, Comparing, Deciding, Committing.\n' +
      'You coach. The salesperson closes. Apex never teaches scripts -- Apex teaches judgment.\n' +
      'Apex reduces cognitive load, not increases it: one question, one objective, one thing to avoid.\n' +
      'If customerMemory is provided in context, treat it as established fact -- never contradict or re-ask ' +
      'something already known. Build on it.\n' +
      'Singapore context: monthly instalment anxiety, family decision-making, ' +
      'COE uncertainty, trade-in concerns, loan approval worries.\n' +
      'Respond with ONLY valid JSON. No markdown. No text outside the JSON object.',

    copilot:  // alias -- identical to live_copilot
      CONSTITUTION +
      'You are Apex Sales Brain. The salesperson is with a customer RIGHT NOW in Singapore.\n' +
      'You must reason through exactly five steps, in this order, every time:\n' +
      '  1. What is the customer feeling? (e.g. Curious, Defensive, Excited, Confused, Hesitating)\n' +
      '  2. Why are they feeling this? (e.g. Budget, Family, Trust, Comparison, Previous bad experience)\n' +
      '  3. What is the salesperson trying to achieve right now? (e.g. Build trust, Discover motivation, ' +
      '     Reduce price sensitivity, Handle objection, Create urgency, Close)\n' +
      '  4. What is the single best next question? Exactly ONE question. Never offer alternatives or a list.\n' +
      '  5. What should the salesperson NEVER do next? A specific, situational thing to avoid -- not generic advice.\n' +
      'Only after these five steps do you produce: say, action, and the conversation stage.\n' +
      'Conversation stage is always exactly one of: Exploring, Interested, Comparing, Deciding, Committing.\n' +
      'You coach. The salesperson closes. Apex never teaches scripts -- Apex teaches judgment.\n' +
      'Apex reduces cognitive load, not increases it: one question, one objective, one thing to avoid.\n' +
      'If customerMemory is provided in context, treat it as established fact -- never contradict or re-ask ' +
      'something already known. Build on it.\n' +
      'Singapore context: monthly instalment anxiety, family decision-making, ' +
      'COE uncertainty, trade-in concerns, loan approval worries.\n' +
      'Respond with ONLY valid JSON. No markdown. No text outside the JSON object.'
  };

  var systemPrompt = SYSTEMS[mod];
  if (!systemPrompt) {
    return res.status(400).json({
      ok:           false,
      error:        'Unknown module: "' + mod + '"',
      validModules: Object.keys(SYSTEMS)
    });
  }

  // ── User prompts ──────────────────────────────────────────
  var userPrompt = '';

  // ─── Deal Coach ──────────────────────────────────────────
  if (mod === 'coach') {
    userPrompt =
      'Analyse this Singapore car customer. Apply every principle of the Apex Constitution.\n\n' +
      'Customer data:\n' + JSON.stringify(input, null, 2) + '\n\n' +
      'Requirements:\n' +
      '- questions[] must build trust and uncover real situation — not generic openers.\n' +
      '- First question must be the single most trust-building question available.\n' +
      '- resp must be a question or empathetic statement, never a pitch.\n' +
      '- whatsapp message must end with a question.\n\n' +
      'Return ONLY this JSON (real values, not placeholder text):\n' +
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
      '    "question that surfaces the hidden concern"\n' +
      '  ],\n' +
      '  "warnings": [{ "main": "Do not [specific action]", "why": "specific reason" }],\n' +
      '  "strategy": [{ "t": "Step title", "d": "Step detail specific to this customer" }],\n' +
      '  "concern": "paragraph about the real underlying concern",\n' +
      '  "resp": "opening sentence — a question or empathetic statement, never a pitch",\n' +
      '  "trust": ["trust-building point 1", "trust-building point 2", "trust-building point 3"],\n' +
      '  "discount": "discount handling advice for this situation",\n' +
      '  "finance": "finance explanation referencing their specific numbers if provided",\n' +
      '  "risk": "Low | Medium | High",\n' +
      '  "riskReason": "one sentence explaining this risk level",\n' +
      '  "whatsapp": "complete WhatsApp follow-up message — must end with a question"\n' +
      '}';
  }

  // ─── Follow-Up Engine ────────────────────────────────────
  else if (mod === 'followup') {
    userPrompt =
      'Generate WhatsApp follow-up messages for this Singapore car sales situation.\n' +
      'Apply the Apex Constitution: every message must contain at least one question ' +
      'that helps the salesperson learn more about the customer.\n\n' +
      'Situation:\n' + JSON.stringify(input, null, 2) + '\n\n' +
      'Return ONLY this JSON:\n' +
      '{\n' +
      '  "mainMsg": "warm WhatsApp message, Singapore-appropriate, ends with a question",\n' +
      '  "shortMsg": "3-4 sentence version, also ends with a question",\n' +
      '  "strongMsg": "more direct version — still includes a question",\n' +
      '  "strategy": ["step 1", "step 2", "step 3"],\n' +
      '  "bestTime": "specific day and time window to send",\n' +
      '  "donts": ["specific thing to avoid 1", "specific thing to avoid 2", "specific thing to avoid 3"]\n' +
      '}';
  }

  // ─── Objection Brain ─────────────────────────────────────
  else if (mod === 'objection') {
    var objText = (typeof input === 'string') ? input : (input.objection || JSON.stringify(input));
    var ctxStr  = (Object.keys(context).length > 0) ? JSON.stringify(context) : 'none';

    userPrompt =
      'Analyse this Singapore car sales objection. Apply the Apex Constitution.\n' +
      'The "question" field must be the single most trust-building question — not a counter-argument.\n\n' +
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
      '  "question": "the single best trust-building question to ask right now",\n' +
      '  "donts": [\n' +
      '    { "x": "❌", "text": "thing not to say", "why": "why it hurts the sale" },\n' +
      '    { "x": "❌", "text": "second thing to avoid", "why": "why" }\n' +
      '  ],\n' +
      '  "strategy": [\n' +
      '    { "t": "Step 1 — listen and question", "d": "specific detail" },\n' +
      '    { "t": "Step 2 — understand the real concern", "d": "specific detail" },\n' +
      '    { "t": "Step 3 — only then respond", "d": "specific detail" }\n' +
      '  ],\n' +
      '  "closing": 58,\n' +
      '  "closeNote": "one sentence on what this probability means in practice"\n' +
      '}';
  }

  // ─── Vehicle Match ───────────────────────────────────────
  else if (mod === 'match') {
    userPrompt =
      'Recommend top 5 vehicles for this Singapore car buyer. Apply the Apex Constitution.\n' +
      'If the profile has gaps, include questions in talkingPoints the salesperson should ask first.\n\n' +
      'Customer profile:\n' + JSON.stringify(input, null, 2) + '\n\n' +
      'Return ONLY this JSON:\n' +
      '{\n' +
      '  "recommendations": [{\n' +
      '    "name": "Full vehicle name e.g. Toyota Corolla Cross Hybrid",\n' +
      '    "score": 88,\n' +
      '    "segment": "e.g. Compact SUV",\n' +
      '    "type": "Sedan | SUV | Hatchback | MPV | Sports | Luxury",\n' +
      '    "reasons": ["reason 1 specific to this buyer", "reason 2", "reason 3"],\n' +
      '    "pros": ["pro 1", "pro 2", "pro 3", "pro 4"],\n' +
      '    "cons": ["con 1", "con 2", "con 3"],\n' +
      '    "ideal": "description of who this car is ideal for",\n' +
      '    "avoid": "who should NOT buy this car and why",\n' +
      '    "depr": 8500,\n' +
      '    "monthlyEst": 1480,\n' +
      '    "priceMin": 115000,\n' +
      '    "priceMax": 148000,\n' +
      '    "objections": ["likely objection 1", "likely objection 2"]\n' +
      '  }],\n' +
      '  "alternatives": [{ "name": "Alternative vehicle", "why": "reason" }],\n' +
      '  "talkingPoints": [\n' +
      '    "question to ask if profile is incomplete",\n' +
      '    "talking point 2 specific to this buyer",\n' +
      '    "talking point 3",\n' +
      '    "talking point 4",\n' +
      '    "talking point 5"\n' +
      '  ]\n' +
      '}';
  }

  // ─── Apex Sales Brain (live conversation) ────────────────
  else if (mod === 'live_copilot' || mod === 'copilot') {
    var liveNotes = (typeof input === 'string') ? input : (input.notes || input.liveNotes || JSON.stringify(input));
    var prevNotes = context.previousNotes || '';
    var dealCtx   = context.dealContext   || '';
    var custMem   = context.customerMemory ? JSON.stringify(context.customerMemory) : '';

    userPrompt =
      'A Singapore car salesperson is with a customer RIGHT NOW.\n' +
      'Apply the Apex Constitution -- especially principles 3, 7, 8, and 9.\n\n' +
      'Work through the five reasoning steps internally (feeling, why, objective, question, avoid) ' +
      'and return the result -- but also surface stage, say, and action as defined below.\n\n' +
      'Current notes:\n' + liveNotes + '\n' +
      (prevNotes ? ('Earlier in this conversation:\n' + prevNotes + '\n') : '') +
      (custMem   ? ('Known facts about this customer (do not contradict or re-ask these):\n' + custMem + '\n') : '') +
      (dealCtx   ? ('Deal context: ' + dealCtx + '\n') : '') +
      '\nReturn ONLY this JSON:\n' +
      '{\n' +
      '  "feeling": "Curious | Hesitating | Excited | Defensive | Confused",\n' +
      '  "why": "Budget | Family | Trust | Comparison | Previous bad experience | other short label",\n' +
      '  "objective": "Build trust | Discover motivation | Reduce price sensitivity | Handle objection | Create urgency | Ask for commitment | Close",\n' +
      '  "stage": "Exploring | Interested | Comparing | Deciding | Committing",\n' +
      '  "mood": "Positive | Neutral | Concerned | Frustrated | Excited",\n' +
      '  "moodIcon": "single emoji matching the mood",\n' +
      '  "intent": 65,\n' +
      '  "trust": "Low | Medium | High",\n' +
      '  "risk": "Low | Medium | High",\n' +
      '  "emotions": [\n' +
      '    { "label": "e.g. Price Sensitive", "color": "var(--red)", "bg": "var(--rbg)" }\n' +
      '  ],\n' +
      '  "bestQuestion": "the single best question to ask the customer right now -- exactly one, never a list",\n' +
      '  "whyQuestion": "one sentence -- why this specific question matters right now",\n' +
      '  "say": "ONE sentence -- what to say to the customer right now",\n' +
      '  "avoid": "ONE sentence -- the single most important thing the salesperson should NEVER do next, and why",\n' +
      '  "warn": "same content as avoid -- kept for backward compatibility",\n' +
      '  "action": "ONE sentence -- the single most important action to take next"\n' +
      '}';
  }

  // ── Call OpenAI ───────────────────────────────────────────
  var openAIResp;
  try {
    openAIResp = await fetch('https://api.openai.com/v1/chat/completions', {
      method:  'POST',
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
    return res.status(503).json({
      ok:     false,
      error:  'Cannot reach OpenAI.',
      detail: netErr.message
    });
  }

  // ── Handle OpenAI error responses ────────────────────────
  if (!openAIResp.ok) {
    var errText = '';
    try { errText = await openAIResp.text(); } catch (e) {}
    console.error('[ApexAI] OpenAI HTTP ' + openAIResp.status, errText.substring(0, 200));

    var friendlyError = {
      401: 'Invalid API key — check OPENAI_API_KEY in Vercel Environment Variables.',
      429: 'OpenAI rate limit or quota exceeded — check platform.openai.com/usage.',
      500: 'OpenAI internal server error — try again in a moment.',
      503: 'OpenAI temporarily unavailable — try again shortly.'
    }[openAIResp.status] || ('OpenAI returned HTTP ' + openAIResp.status);

    return res.status(502).json({
      ok:     false,
      error:  friendlyError,
      status: openAIResp.status,
      detail: errText.substring(0, 300)
    });
  }

  // ── Parse OpenAI response ─────────────────────────────────
  var oaiData;
  try {
    oaiData = await openAIResp.json();
  } catch (e) {
    return res.status(502).json({ ok: false, error: 'OpenAI response was not valid JSON.' });
  }

  var rawText = oaiData.choices
    && oaiData.choices[0]
    && oaiData.choices[0].message
    && oaiData.choices[0].message.content;

  if (!rawText) {
    console.error('[ApexAI] Empty content from OpenAI');
    return res.status(502).json({ ok: false, error: 'OpenAI returned empty content.' });
  }

  var parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch (jsonErr) {
    console.error('[ApexAI] GPT returned invalid JSON:', rawText.substring(0, 200));
    return res.status(502).json({
      ok:      false,
      error:   'GPT returned invalid JSON.',
      preview: rawText.substring(0, 150)
    });
  }

  // ── Return result to browser ──────────────────────────────
  console.log('[ApexAI] OK module=' + mod + ' tokens=' + (oaiData.usage ? oaiData.usage.total_tokens : '?'));
  return res.status(200).json({
    ok:     true,
    module: mod,
    result: parsed,
    tokens: oaiData.usage ? oaiData.usage.total_tokens : 0
  });
};
