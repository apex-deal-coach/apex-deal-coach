// ============================================================
// Apex Deal Coach — Secure OpenAI API Route
// File: api/apex-ai.js
//
// IMPORTANT: Uses CommonJS (module.exports) — NOT ES modules.
// This is required for Vercel serverless functions without
// "type":"module" in package.json.
//
// The API key lives ONLY in Vercel Environment Variables.
// It is never sent to the browser.
// ============================================================

module.exports = async function handler(req, res) {

  // ── CORS ──
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── Only POST ──
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Use POST, not ' + req.method });
  }

  // ── Read API key from Vercel Environment Variables ──
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      ok: false,
      error: 'OPENAI_API_KEY is not set.',
      fix: 'Vercel → Project → Settings → Environment Variables → Add OPENAI_API_KEY'
    });
  }

  // ── Parse body ──
  const body = req.body || {};
  const mod     = body.module;
  const input   = body.input;
  const context = body.context || {};

  if (!mod)   return res.status(400).json({ ok: false, error: 'Missing field: module' });
  if (!input) return res.status(400).json({ ok: false, error: 'Missing field: input'  });

  // ── System prompt per module ──
  const SYSTEMS = {
    coach:
      'You are Apex Deal Coach, an expert Singapore car sales coaching AI. ' +
      'Analyse customer profiles and generate structured, actionable coaching. ' +
      'You understand: COE, LTV rules, ARF, PARF, EV incentives, HDB parking, Singapore buyer psychology. ' +
      'Respond with ONLY valid JSON. No markdown fences. No explanation outside the JSON.',

    followup:
      'You are Apex Follow-Up Engine for Singapore car sales. ' +
      'Write WhatsApp messages that are natural, warm, and Singapore-appropriate. Never pushy or generic. ' +
      'Respond with ONLY valid JSON. No markdown fences.',

    objection:
      'You are Apex Objection Brain for Singapore car sales psychology. ' +
      'Decode what customers REALLY mean, considering: family approval, HDB parking, COE anxiety, loan rules. ' +
      'Respond with ONLY valid JSON. No markdown fences.',

    match:
      'You are Apex Vehicle Match Engine. Expert in Singapore car models, pricing, COE, and depreciation. ' +
      'Match customers to vehicles using Singapore-specific knowledge. ' +
      'Respond with ONLY valid JSON. No markdown fences.',

    copilot:
      'You are Apex Live Sales Copilot. The salesperson is with a customer RIGHT NOW in Singapore. ' +
      'Give SHORT, instantly actionable coaching — one sentence per field. ' +
      'Understand Singapore buyer psychology: family decisions, monthly instalment focus, COE concerns. ' +
      'Respond with ONLY valid JSON. No markdown fences.',

    live_copilot:
      'You are Apex Live Sales Copilot. The salesperson is with a customer RIGHT NOW in Singapore. ' +
      'Give SHORT, instantly actionable coaching — one sentence per field. ' +
      'Understand Singapore buyer psychology: family decisions, monthly instalment focus, COE concerns. ' +
      'Respond with ONLY valid JSON. No markdown fences.'
  };

  const systemPrompt = SYSTEMS[mod];
  if (!systemPrompt) {
    return res.status(400).json({
      ok: false,
      error: 'Unknown module: ' + mod + '. Valid: ' + Object.keys(SYSTEMS).join(', ')
    });
  }

  // ── Build user prompt (string concat only — no template literals with newlines) ──
  let userPrompt = '';

  if (mod === 'coach') {
    userPrompt =
      'Analyse this Singapore car customer and return coaching.\n\n' +
      'Customer:\n' + JSON.stringify(input, null, 2) + '\n\n' +
      'Return ONLY this JSON:\n' +
      '{\n' +
      '  "profile": { "type":"Family Buyer", "typeIcon":"emoji", "stage":"Browsing|Comparing|Negotiating|Ready to buy", "stageIcon":"emoji", "trust":"Low|Medium|High", "trustIcon":"emoji", "urgency":"Low|Moderate|High|Very high", "prob":65, "probColor":"var(--green)" },\n' +
      '  "concerns": [{ "text":"hidden concern", "sub":"why this matters", "dot":"#378ADD" }],\n' +
      '  "questions": ["question 1", "question 2", "question 3"],\n' +
      '  "warnings": [{ "main":"Do not...", "why":"reason" }],\n' +
      '  "strategy": [{ "t":"Step title", "d":"Step detail" }],\n' +
      '  "concern": "paragraph about the real concern",\n' +
      '  "resp": "suggested response sentence",\n' +
      '  "trust": ["trust point 1", "trust point 2"],\n' +
      '  "discount": "discount handling advice",\n' +
      '  "finance": "finance explanation",\n' +
      '  "risk": "Low|Medium|High",\n' +
      '  "riskReason": "one sentence",\n' +
      '  "whatsapp": "full WhatsApp follow-up message"\n' +
      '}';
  }

  else if (mod === 'followup') {
    userPrompt =
      'Generate WhatsApp follow-up messages for this Singapore car sales situation.\n\n' +
      'Situation:\n' + JSON.stringify(input, null, 2) + '\n\n' +
      'Return ONLY this JSON:\n' +
      '{\n' +
      '  "mainMsg": "full WhatsApp message",\n' +
      '  "shortMsg": "shorter 3-4 sentence version",\n' +
      '  "strongMsg": "stronger closing version",\n' +
      '  "strategy": ["step 1", "step 2", "step 3"],\n' +
      '  "bestTime": "specific send time recommendation",\n' +
      '  "donts": ["dont 1", "dont 2", "dont 3"]\n' +
      '}';
  }

  else if (mod === 'objection') {
    const objText = (typeof input === 'string') ? input : (input.objection || JSON.stringify(input));
    userPrompt =
      'Analyse this Singapore car sales objection.\n\n' +
      'Objection: "' + objText + '"\n' +
      'Context: ' + (Object.keys(context).length ? JSON.stringify(context) : 'none') + '\n\n' +
      'Return ONLY this JSON:\n' +
      '{\n' +
      '  "real": [{ "label":"hidden concern", "pct":72 }, { "label":"second concern", "pct":45 }],\n' +
      '  "psych": "psychology explanation for Singapore context",\n' +
      '  "question": "the single best question to ask right now",\n' +
      '  "donts": [{ "x":"❌", "text":"specific dont", "why":"reason" }],\n' +
      '  "strategy": [{ "t":"Step title", "d":"Step detail" }],\n' +
      '  "closing": 55,\n' +
      '  "closeNote": "one sentence about closing probability"\n' +
      '}';
  }

  else if (mod === 'match') {
    userPrompt =
      'Recommend top 5 vehicles for this Singapore car buyer.\n\n' +
      'Profile:\n' + JSON.stringify(input, null, 2) + '\n\n' +
      'Return ONLY this JSON:\n' +
      '{\n' +
      '  "recommendations": [{\n' +
      '    "name":"Toyota Corolla Cross Hybrid", "score":88, "segment":"Compact SUV", "type":"SUV",\n' +
      '    "reasons":["reason 1","reason 2","reason 3"],\n' +
      '    "pros":["pro 1","pro 2","pro 3"], "cons":["con 1","con 2"],\n' +
      '    "ideal":"ideal buyer description", "avoid":"who should not buy this",\n' +
      '    "depr":8500, "monthlyEst":1480, "priceMin":115000, "priceMax":148000,\n' +
      '    "objections":["objection 1","objection 2"]\n' +
      '  }],\n' +
      '  "alternatives": [{ "name":"Alternative car", "why":"reason" }],\n' +
      '  "talkingPoints": ["point 1","point 2","point 3","point 4","point 5"]\n' +
      '}';
  }

  else if (mod === 'copilot' || mod === 'live_copilot') {
    const liveNotes = (typeof input === 'string') ? input : (input.notes || input.liveNotes || JSON.stringify(input));
    const prevNotes = context.previousNotes || '';
    const dealCtx   = context.dealContext   || '';

    userPrompt =
      'Singapore car salesperson is with a customer RIGHT NOW.\n' +
      'Analyse these live notes and give instant coaching.\n\n' +
      'Live notes:\n' + liveNotes + '\n' +
      (prevNotes ? ('Earlier notes: ' + prevNotes + '\n') : '') +
      (dealCtx   ? ('Deal context: '  + dealCtx   + '\n') : '') +
      '\nReturn ONLY this JSON (one sentence per say/warn/action):\n' +
      '{\n' +
      '  "mood": "Positive|Neutral|Concerned|Frustrated|Excited",\n' +
      '  "moodIcon": "😊",\n' +
      '  "intent": 65,\n' +
      '  "trust": "Low|Medium|High",\n' +
      '  "risk": "Low|Medium|High",\n' +
      '  "emotions": [{ "label":"Price Sensitive", "color":"var(--red)", "bg":"var(--rbg)" }],\n' +
      '  "say": "one sentence to say to customer right now",\n' +
      '  "warn": "one thing to avoid saying right now",\n' +
      '  "action": "one specific next action to take"\n' +
      '}';
  }

  // ── Call OpenAI ──
  let openAIResp;
  try {
    openAIResp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.4,
        max_tokens: 1800,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userPrompt   }
        ]
      })
    });
  } catch (netErr) {
    console.error('[ApexAI] Network error:', netErr.message);
    return res.status(503).json({ ok: false, error: 'Cannot reach OpenAI: ' + netErr.message });
  }

  // ── Handle OpenAI HTTP errors ──
  if (!openAIResp.ok) {
    let body = '';
    try { body = await openAIResp.text(); } catch(e) {}
    console.error('[ApexAI] OpenAI HTTP', openAIResp.status, body);

    const msgs = {
      401: 'Invalid API key — check OPENAI_API_KEY in Vercel Environment Variables.',
      429: 'OpenAI rate limit or quota exceeded — check platform.openai.com/usage.',
      500: 'OpenAI server error — try again.',
      503: 'OpenAI temporarily unavailable — try again.'
    };
    return res.status(502).json({
      ok: false,
      error: msgs[openAIResp.status] || ('OpenAI error HTTP ' + openAIResp.status),
      detail: body.substring(0, 300)
    });
  }

  // ── Parse response ──
  let oaiData;
  try { oaiData = await openAIResp.json(); }
  catch(e) { return res.status(502).json({ ok: false, error: 'OpenAI response not JSON.' }); }

  const rawText = oaiData.choices && oaiData.choices[0] && oaiData.choices[0].message && oaiData.choices[0].message.content;
  if (!rawText) {
    console.error('[ApexAI] Empty content:', JSON.stringify(oaiData).substring(0, 200));
    return res.status(502).json({ ok: false, error: 'OpenAI returned empty content.' });
  }

  let parsed;
  try { parsed = JSON.parse(rawText); }
  catch(e) {
    console.error('[ApexAI] JSON parse failed:', rawText.substring(0, 200));
    return res.status(502).json({ ok: false, error: 'GPT returned invalid JSON.', preview: rawText.substring(0, 150) });
  }

  console.log('[ApexAI] OK module=' + mod + ' tokens=' + (oaiData.usage ? oaiData.usage.total_tokens : '?'));
  return res.status(200).json({ ok: true, module: mod, result: parsed, tokens: oaiData.usage ? oaiData.usage.total_tokens : 0 });
};
