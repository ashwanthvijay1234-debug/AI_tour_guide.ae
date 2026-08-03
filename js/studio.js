/* ═══════════════════════════════════════════════════════════════
   studio.js  —  JavaScript for studio.html ONLY

   WHAT THIS FILE DOES
   This is the brain of the project. It turns the trip settings on
   the left into a day-by-day UAE itinerary, lets you refine that
   itinerary by chatting, draws it on a map, and exports it to PDF.

   TWO WAYS IT CAN BUILD AN ITINERARY
     • Demo mode (no API key)  — the built-in "offline planner"
       picks attractions from a hard-coded list of UAE places.
       This always works, even with no internet and no key, which
       is what makes the project safe to demo in class.
     • AI mode (API key given) — sends the trip details to Google
       Gemini and uses what it returns instead. If the model is
       busy or the key is not enabled, it walks down a list of
       backup models, and finally falls back to the demo planner.

   ROAD MAP (search for these headings, in file order)
     setup controls    sliders, chips, and the API-key box
     tabs              switching between Itinerary / PDF / Map
     prompt            builds the text sent to the AI
     offline planner   the no-key itinerary generator
     Gemini            the API call + the model fallback chain
     chat              sending messages and showing replies
     rendering         turning itinerary data into HTML on screen
     map               plotting each stop on the embedded map
     PDF               drawing the itinerary with jsPDF
     generation        the main "Generate itinerary" button
     floating notes    the draggable sticky-note window

   OUTSIDE CODE THIS FILE NEEDS
     jsPDF — loaded from a CDN by the <script> tag in studio.html.
     If that fails to load, only the PDF tab stops working; the
     rest of the page carries on fine.

   HOW IT IS LOADED
   studio.html loads this with <script defer>, so the HTML exists
   before any of this runs.

   WHY THE WHOLE FILE IS WRAPPED IN (() => { ... })()
   That is an IIFE (Immediately Invoked Function Expression). It
   runs once and keeps every variable inside it private.

   NOTE ON THE API KEY
   The key is only kept in the browser (localStorage) on the
   machine you type it into. It is never committed to this repo.
   ═══════════════════════════════════════════════════════════════ */

(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const fmt = n => n.toLocaleString('en-AE');
  const el = (tag, cls, text) => { const n = document.createElement(tag);
    if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };

  /* ── setup controls ────────────────────────────────────── */
  const daysEl = $('#days'), budgetEl = $('#budget'), keyEl = $('#apikey');
  const paintRange = e => e.style.setProperty('--fill', ((e.value - e.min) / (e.max - e.min) * 100) + '%');
  const budgetTier = v =>
    v < 2500 ? ['Budget', 'Hostels and value hotels, street food, free landmarks, public transport.'] :
    v < 8000 ? ['Comfort', 'Good hotels, a mix of paid attractions and free landmarks.'] :
    v < 18000 ? ['Premium', 'Four- and five-star stays, private transfers, signature dining.'] :
                ['Luxury', 'Landmark hotels, private guides, helicopter and yacht options, fine dining.'];
  const syncDays = () => { $('#days-val').textContent = daysEl.value + (daysEl.value === '1' ? ' day' : ' days'); paintRange(daysEl); };
  const syncBudget = () => { const [t, n] = budgetTier(+budgetEl.value);
    $('#budget-val').textContent = 'AED ' + fmt(+budgetEl.value) + ' · ' + t;
    $('#budget-note').textContent = n; paintRange(budgetEl); };
  daysEl.addEventListener('input', syncDays); budgetEl.addEventListener('input', syncBudget);
  syncDays(); syncBudget();

  const KEY_STORE = 'aitourguide.gemini.key';
  try { const k = localStorage.getItem(KEY_STORE); if (k) keyEl.value = k; } catch (e) {}
  const syncMode = () => { const live = !!keyEl.value.trim();
    $('#mode-tag').textContent = live ? 'Gemini live' : 'Demo mode';
    $('#mode-tag').className = 'tag ' + (live ? 'tag-accent' : 'tag-neutral'); };
  keyEl.addEventListener('input', syncMode);
  keyEl.addEventListener('change', () => { try { localStorage.setItem(KEY_STORE, keyEl.value.trim()); } catch (e) {} });
  $('#key-toggle').addEventListener('click', () => { const show = keyEl.type === 'password';
    keyEl.type = show ? 'text' : 'password'; $('#key-toggle').textContent = show ? 'Hide' : 'Show'; });
  syncMode();

  const readPrefs = () => ({
    destination: $('#destination').value, days: +daysEl.value, budget: +budgetEl.value,
    tier: budgetTier(+budgetEl.value)[0],
    interests: $$('#interests input:checked').map(i => i.value)
  });

  /* ── tabs ──────────────────────────────────────────────── */
  const tabs = $$('.tab');
  const selectTab = id => tabs.forEach(t => { const on = t.id === id;
    t.setAttribute('aria-selected', String(on)); $('#' + t.getAttribute('aria-controls')).hidden = !on; });
  tabs.forEach(t => t.addEventListener('click', () => selectTab(t.id)));

  /* ── prompt ────────────────────────────────────────────── */
  const buildPrompt = (p, refinements) => `You are AI_tour_guide.ae, an expert United Arab Emirates travel planner.

Plan a ${p.days}-day trip.
Destination: ${p.destination}
Total budget per person: AED ${fmt(p.budget)} (${p.tier} tier)
Traveller interests: ${p.interests.length ? p.interests.join(', ') : 'general sightseeing'}
${refinements.length ? 'Traveller notes, most recent last — obey these above all:\n- ' + refinements.join('\n- ') + '\n' : ''}
Rules:
- Group each day geographically to minimise travel; name real UAE places.
- Respect UAE realities: summer midday heat, Friday prayer timings, modest dress at mosques, Ramadan hours, drive times between emirates.
- Include Emirati heritage and culture, not only malls and towers.
- 4 to 6 stops per day, each with a time window, a one- or two-sentence reason, and an AED cost ("Free" where free).
- Keep the total within the stated budget.

Return ONLY valid JSON, no markdown fences, exactly:
{"title":"string","summary":"string","days":[{"day":1,"theme":"string","stops":[{"time":"09:00 – 11:00","title":"string","detail":"string","cost":"AED 120"}]}],"tips":["string"],"estimatedTotal":"AED 5,400"}`;

  /* ── offline planner ───────────────────────────────────── */
  const POOL = {
    'Cultural Landmarks': [
      ['Al Fahidi Historical Neighbourhood, Dubai', 'Wind-tower lanes, the coffee museum and the calligraphy houses — the oldest surviving quarter of the city.', 'Free'],
      ['Sheikh Zayed Grand Mosque, Abu Dhabi', 'White marble courtyard and 82 domes; go late afternoon for the light, and cover shoulders and knees.', 'Free'],
      ['Qasr Al Watan, Abu Dhabi', 'The working presidential palace, opened to visitors — the Great Hall and the House of Knowledge.', 'AED 65'],
      ['Sharjah Museum of Islamic Civilization', 'A former souq turned museum: astronomy, manuscripts and a full gallery of Islamic science.', 'AED 10'],
      ['Louvre Abu Dhabi', 'Jean Nouvel\u2019s rain-of-light dome over a museum-city on Saadiyat Island.', 'AED 65']
    ],
    'Desert Adventure': [
      ['Evening desert safari, Al Marmoom', 'Dune drive, camel ride and a Bedouin-style camp dinner under the stars.', 'AED 250'],
      ['Liwa Oasis and Moreeb Dune', 'The edge of the Empty Quarter — a 300m dune and true silence, three hours from Abu Dhabi.', 'AED 400'],
      ['Hatta rock pools and dam', 'Mountain wadis, kayaking on the turquoise dam, and the heritage village.', 'AED 120'],
      ['Sunrise hot-air balloon, Dubai desert', 'Falconry display at first light, then an hour above the dunes.', 'AED 1,150'],
      ['Al Qudra Lakes and Love Lake', 'Man-made desert wetlands with flamingos, oryx and a long cycle track.', 'Free']
    ],
    'Shopping': [
      ['Dubai Mall and the Fountain', 'Twelve hundred stores, the aquarium wall, and the fountain show on the half hour after sunset.', 'Free entry'],
      ['Gold and Spice Souks, Deira', 'Cross by abra for one dirham, then bargain properly — the tag price is an opening offer.', 'AED 1'],
      ['Mall of the Emirates', 'Ski Dubai, the cinema floor, and a calmer alternative to the Dubai Mall crowds.', 'Free entry'],
      ['Souk Madinat Jumeirah', 'Waterway souk with the Burj Al Arab framed behind it — best at golden hour.', 'Free']
    ],
    'Family': [
      ['IMG Worlds of Adventure', 'The world\u2019s largest indoor theme park — a reliable answer to a 45°C afternoon.', 'AED 345'],
      ['Dubai Aquarium and Underwater Zoo', 'The tunnel walk, the king croc, and the penguin encounter.', 'AED 199'],
      ['Yas Waterworld, Abu Dhabi', 'Forty-plus rides built around an Emirati pearl-diving story.', 'AED 300'],
      ['Dubai Frame', 'Old city on one side, new city on the other, glass floor in between.', 'AED 50']
    ],
    'Food & Dining': [
      ['Emirati breakfast at Al Fanar', 'Balaleet, chebab and karak — the local breakfast, served the way it is served at home.', 'AED 95'],
      ['Ravi Restaurant, Satwa', 'A Dubai institution since 1978; dinner costs less than the taxi to reach it.', 'AED 45'],
      ['Old Dubai food walk, Al Ras', 'Iranian bakeries, Afghan bread and cardamom tea through the lanes behind the creek.', 'AED 120'],
      ['Dinner at Pierchic', 'Seafood on a pier over the Gulf with the Burj Al Arab lit behind you.', 'AED 650']
    ],
    'Beaches & Water': [
      ['Kite Beach, Dubai', 'Soft sand, the Burj Al Arab view, and the running track that runs its length.', 'Free'],
      ['Abra ride across Dubai Creek', 'The one-dirham crossing that is still the best view in the city.', 'AED 1'],
      ['Saadiyat Public Beach, Abu Dhabi', 'Protected dunes, turtles in season, and far fewer people than Dubai\u2019s beaches.', 'AED 25'],
      ['Snoopy Island, Fujairah', 'Coral and reef fish on the Indian Ocean coast, ninety minutes from Dubai.', 'AED 150']
    ],
    'Architecture': [
      ['Burj Khalifa, At The Top (Level 124)', 'Book the last slot before sunset and watch the city switch on beneath you.', 'AED 179'],
      ['Museum of the Future, Dubai', 'The calligraphy-clad torus on Sheikh Zayed Road — as much an exhibit as a building.', 'AED 149'],
      ['The View at The Palm', 'The observation deck that finally makes the shape of Palm Jumeirah legible.', 'AED 100'],
      ['Etihad Towers observation deck, Abu Dhabi', 'Level 74, looking down the Corniche and out over the Gulf.', 'AED 95']
    ],
    'Nature & Wildlife': [
      ['Ras Al Khor Wildlife Sanctuary, Dubai', 'Flamingos in a lagoon with the Burj Khalifa behind them; free hides, mornings only.', 'Free'],
      ['Jebel Jais, Ras Al Khaimah', 'The highest peak in the UAE, the viewing-deck road, and the world\u2019s longest zip line.', 'AED 350'],
      ['Mangrove kayaking, Abu Dhabi', 'Quiet channels, herons and rays, minutes from the downtown skyline.', 'AED 180'],
      ['Al Ain Oasis', 'Three thousand hectares of date palms on a UNESCO-listed falaj irrigation system.', 'Free']
    ]
  };
  const GENERAL = POOL['Cultural Landmarks'].concat(POOL['Architecture']);
  const SLOTS = ['08:30 – 10:30', '11:00 – 13:00', '13:30 – 15:00', '15:30 – 17:30', '18:00 – 20:00', '20:30 – 22:00'];
  const THEMES = ['Arrival and old city', 'Heritage and the creek', 'Desert day', 'Modern icons', 'Coast and calm',
    'Abu Dhabi crossing', 'Markets and flavour', 'Mountains and wadis', 'Culture quarter', 'Slow morning, big finish',
    'Island day', 'Northern emirates', 'Favourites and free choice', 'Last light'];

  const demoItinerary = (p, refinements) => {
    const notes = refinements.join(' ').toLowerCase();
    const lighter = /toddler|kid|child|family|slow|light|relax|tired|elderly/.test(notes);
    const cheaper = /cheap|budget|less|afford|save/.test(notes);
    const foodier = /food|eat|dining|restaurant|cuisine/.test(notes);
    let picks = (p.interests.length ? p.interests : ['Cultural Landmarks', 'Architecture'])
      .flatMap(i => POOL[i] || []);
    if (foodier) picks = POOL['Food & Dining'].concat(picks);
    picks = picks.concat(GENERAL);
    const seen = new Set();
    let pool = picks.filter(s => !seen.has(s[0]) && seen.add(s[0]));
    if (cheaper) pool = pool.slice().sort((a, b) =>
      (/free/i.test(a[2]) ? 0 : parseInt(a[2].replace(/\D/g, '') || '0', 10)) -
      (/free/i.test(b[2]) ? 0 : parseInt(b[2].replace(/\D/g, '') || '0', 10)));
    const perDay = p.budget / p.days;
    const stopsPerDay = lighter ? 3 : perDay > 2000 ? 6 : perDay > 700 ? 5 : 4;
    let n = 0;
    const days = Array.from({ length: p.days }, (_, d) => ({
      day: d + 1, theme: THEMES[d % THEMES.length],
      stops: Array.from({ length: stopsPerDay }, (_, s) => {
        const item = pool[n++ % pool.length];
        return { time: SLOTS[s], title: item[0], detail: item[1], cost: item[2] };
      })
    }));
    return {
      title: p.days + '-day ' + p.destination + ' itinerary',
      summary: 'A ' + p.tier.toLowerCase() + '-tier plan for ' + p.destination + ' over ' + p.days +
        (p.days === 1 ? ' day' : ' days') + ', weighted toward ' +
        (p.interests.length ? p.interests.join(', ').toLowerCase() : 'landmarks and architecture') +
        (lighter ? ', paced lightly with fewer stops per day' : '') +
        (cheaper ? ', leading with free and low-cost stops' : '') +
        (foodier ? ', with the food stops brought forward' : '') + '.',
      days,
      tips: [
        'From May to September keep 12:00–16:00 indoors; the midday stops above are air-conditioned or shaded.',
        'Cover shoulders and knees at mosques and heritage sites; carry a scarf for the Grand Mosque.',
        'A Nol card covers the Dubai Metro, tram and buses, and costs a fraction of taxis between downtown stops.',
        'Friday midday prayers pause many attractions for about an hour — plan lunch around them.'
      ],
      estimatedTotal: 'Approx. AED ' + fmt(Math.round(p.budget * (cheaper ? 0.58 : 0.82))) + ' of your AED ' + fmt(p.budget) + ' budget'
    };
  };

  /* ── Gemini ────────────────────────────────────────────── */
  /* Preference order, best first.

     THIS LIST IS ONLY A PREFERENCE, NOT THE TRUTH. Google retires
     model IDs regularly — the previous version of this file had
     gemini-1.5-pro and gemini-2.0-flash hard-coded here long after
     they were shut down, so every single call 404'd and the studio
     silently fell back to the offline planner forever.

     To stop that happening again, buildChain() asks the API which
     models the key can actually call and filters this list down to
     those. A name going stale here can no longer break generation. */
  const MODEL_CHAIN = ['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite',
    'gemini-3.1-flash-lite', 'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-pro'];
  const API_ROOT = 'https://generativelanguage.googleapis.com/v1beta';
  /* a model can be overloaded, rate-limited or simply not enabled on a key —
     all of those are worth trying the next model for, rather than failing */
  const RETRYABLE = new Set([404, 429, 500, 503, 504]);

  /* turn a failed fetch into an Error carrying the HTTP status, using
     Google's own message when it sends one */
  async function httpError(res) {
    let m = res.status + ' ' + res.statusText;
    try { const j = await res.json(); if (j.error && j.error.message) m = j.error.message; } catch (e) {}
    const err = new Error(m); err.status = res.status; return err;
  }

  /* Ask the API which models this key may call, cached per key so the
     round trip is paid once. Returns bare IDs, e.g. "gemini-3.6-flash". */
  let modelCache = { key: null, list: null };
  async function listModels(key) {
    if (modelCache.key === key && modelCache.list) return modelCache.list;
    const res = await fetch(API_ROOT + '/models?pageSize=200&key=' + encodeURIComponent(key));
    if (!res.ok) throw await httpError(res);
    const data = await res.json();
    const raw = data.models || [];
    /* No array at all means the response was not the shape we expect.
       Throw WITHOUT a status so buildChain treats it as "could not
       check" and tries the preference list blind, rather than telling
       the user their key is broken when it may well be fine. */
    if (!raw.length) throw new Error('Model listing returned nothing.');
    const list = raw
      .filter(m => (m.supportedGenerationMethods || []).indexOf('generateContent') > -1)
      .map(m => String(m.name || '').replace(/^models\//, ''));
    modelCache = { key: key, list: list };
    return list;
  }

  /* Decide which models to try, in order. */
  async function buildChain(key, chosen) {
    const prefer = [chosen].concat(MODEL_CHAIN.filter(m => m !== chosen));
    let available = null;
    try {
      available = await listModels(key);
    } catch (err) {
      /* 400 / 403 from the model listing means the KEY is the problem
         (invalid, or the Generative Language API is not enabled on it).
         Say so now rather than trying seven models and blaming the last. */
      if (err.status === 400 || err.status === 403) throw err;
      /* anything else — offline, CORS, a blip — just try blind */
      return prefer;
    }
    if (!available.length) {
      throw new Error('This API key cannot call any text models. In Google AI Studio check that the key is enabled for the Generative Language API.');
    }
    const usable = prefer.filter(m => available.indexOf(m) > -1);
    if (usable.length) return usable;
    /* The key works but none of our preferred names exist any more.
       Use whatever chat-capable models it does expose, newest first,
       so the studio keeps working until this file is updated. */
    const other = available
      .filter(m => /^gemini-/.test(m) && !/embedding|aqa|imagen|veo|tts|live|vision/i.test(m))
      .sort().reverse();
    if (!other.length) throw new Error('This API key exposes no Gemini chat models — only specialised ones.');
    return other;
  }

  async function callGemini(key, model, prompt) {
    const url = API_ROOT + '/models/' +
      encodeURIComponent(model) + ':generateContent?key=' + encodeURIComponent(key);
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.9, responseMimeType: 'application/json' } }) });
    if (!res.ok) throw await httpError(res);
    const data = await res.json();
    const parts = (((data.candidates || [])[0] || {}).content || {}).parts || [];
    const text = parts.map(x => x.text || '').join('').trim();
    if (!text) throw new Error('The model returned an empty response.');
    return text;
  }

  /* try the chosen model, then walk the rest of the chain on overload/quota */
  async function callWithFallback(key, chosen, prompt, onFallback) {
    const chain = await buildChain(key, chosen);
    let first = null;
    for (let i = 0; i < chain.length; i++) {
      try { return { text: await callGemini(key, chain[i], prompt), model: chain[i] }; }
      catch (err) {
        /* Keep the FIRST failure. It came from the model the user
           actually picked, so it is the one worth showing. The old
           code reported the LAST error instead, which is why a bad
           key used to surface as "gemini-1.5-pro is not found" — the
           name of a model nobody had chosen. */
        if (!first) { first = err; first.model = chain[i]; }
        if (!RETRYABLE.has(err.status) || i === chain.length - 1) break;
        onFallback(chain[i], chain[i + 1], err.message);
        await new Promise(r => setTimeout(r, 400));
      }
    }
    if (!first) throw new Error('No model was attempted.');
    const e = new Error(chain.length > 1
      ? first.message + ' (tried ' + chain.length + ' models, starting with ' + first.model + ')'
      : first.message);
    e.status = first.status;
    throw e;
  }
  const parseJSON = text => {
    const clean = text.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    try { return JSON.parse(clean); } catch (e) {}
    const a = clean.indexOf('{'), b = clean.lastIndexOf('}');
    if (a > -1 && b > a) { try { return JSON.parse(clean.slice(a, b + 1)); } catch (e) {} }
    return null;
  };

  /* ── chat ──────────────────────────────────────────────── */
  const log = $('#chat-log'), chatScroll = $('#chat-scroll'), chatEmpty = $('#chat-empty');
  const suggests = $('#suggests'), promptEl = $('#prompt'), sendBtn = $('#send');
  const say = (text, who) => {
    chatEmpty.hidden = true; log.hidden = false;
    const m = el('div', 'msg' + (who ? ' ' + who : ''));
    m.textContent = text; log.append(m);
    chatScroll.scrollTop = chatScroll.scrollHeight;
    return m;
  };
  const enableChat = on => {
    promptEl.disabled = !on; sendBtn.disabled = !on; suggests.hidden = !on;
    promptEl.placeholder = on ? 'Refine the plan — “make day 3 cheaper”…' : 'Generate first, then refine here…';
  };
  suggests.addEventListener('click', e => {
    const b = e.target.closest('.sugg'); if (!b || busy) return;
    generate(b.textContent);
  });
  $('#clear-chat').addEventListener('click', () => {
    log.replaceChildren(); log.hidden = true; chatEmpty.hidden = false;
    refinements.length = 0;
  });

  /* ── rendering ─────────────────────────────────────────── */
  const out = $('#output'), dl = $('#download');
  let current = null;
  const refinements = [];

  function render(plan, prefs, notice) {
    const box = el('div', 'itin');
    if (notice) box.append(notice);
    const sum = el('div', 'trip-summary');
    [['Destination', prefs.destination],
     ['Duration', prefs.days + (prefs.days === 1 ? ' day' : ' days')],
     ['Budget', 'AED ' + fmt(prefs.budget) + ' · ' + prefs.tier],
     ['Interests', prefs.interests.join(', ') || 'General sightseeing']
    ].forEach(([k, v]) => { const c = el('div'); c.append(el('p', 'ts-k', k), el('p', 'ts-v', v)); sum.append(c); });
    box.append(sum);
    if (plan.summary) box.append(el('p', 'plan-summary', plan.summary));

    (plan.days || []).forEach((d, i) => {
      const day = el('div', 'day'), head = el('div', 'day-head');
      head.append(el('span', 'day-num', 'Day ' + (d.day || i + 1)), el('h4', 'day-theme', d.theme || 'Exploring'));
      day.append(head);
      (d.stops || d.activities || []).forEach(s => {
        const row = el('div', 'stop');
        row.append(el('p', 'stop-time', s.time || ''));
        const mid = el('div');
        mid.append(el('p', 'stop-title', s.title || s.name || ''));
        if (s.detail || s.description) mid.append(el('p', 'stop-detail', s.detail || s.description));
        row.append(mid, el('p', 'stop-cost', s.cost || ''));
        day.append(row);
      });
      box.append(day);
    });
    if ((plan.tips || []).length) {
      const t = el('div', 'tips'); t.append(el('h4', null, 'Local tips'));
      const ul = el('ul'); plan.tips.forEach(x => ul.append(el('li', null, x))); t.append(ul); box.append(t);
    }
    if (plan.estimatedTotal) { const e = el('p', 'hint', 'Estimated spend: ' + plan.estimatedTotal);
      e.style.marginTop = 'var(--leading)'; box.append(e); }

    out.replaceChildren(box);
    $('#panel-itin').scrollTop = 0;
    current = { plan, prefs }; dl.disabled = false;
    buildPDF(); buildMap(plan);
  }

  function renderRaw(text, prefs, notice) {
    const box = el('div', 'itin');
    if (notice) box.append(notice);
    box.append(el('div', 'raw', text));
    out.replaceChildren(box);
    current = { plan: { title: prefs.days + '-day ' + prefs.destination + ' itinerary', raw: text }, prefs };
    dl.disabled = false; buildPDF();
  }
  const notice = (kind, text) => el('div', 'notice' + (kind === 'error' ? ' error' : ''), text);

  /* ── map ───────────────────────────────────────────────── */
  const mapFrame = $('#map-frame'), mapStops = $('#map-stops');
  const mapSrc = (q, z) => 'https://www.google.com/maps?q=' + encodeURIComponent(q) + '&z=' + (z || 13) + '&output=embed';
  function buildMap(plan) {
    mapStops.replaceChildren();
    const all = el('button', 'map-stop', 'All UAE');
    all.type = 'button'; all.dataset.q = 'United Arab Emirates'; all.dataset.z = '7';
    all.setAttribute('aria-pressed', 'true'); mapStops.append(all);
    (plan.days || []).forEach((d, i) => (d.stops || []).forEach(s => {
      const name = s.title || s.name; if (!name) return;
      const b = el('button', 'map-stop', 'D' + (d.day || i + 1) + ' · ' + name.split(',')[0]);
      b.type = 'button'; b.dataset.q = name + ', United Arab Emirates'; b.dataset.z = '14';
      b.setAttribute('aria-pressed', 'false'); mapStops.append(b);
    }));
    mapFrame.src = mapSrc('United Arab Emirates', 7);
  }
  mapStops.addEventListener('click', e => {
    const b = e.target.closest('.map-stop'); if (!b) return;
    $$('.map-stop', mapStops).forEach(x => x.setAttribute('aria-pressed', 'false'));
    b.setAttribute('aria-pressed', 'true');
    mapFrame.src = mapSrc(b.dataset.q, +b.dataset.z);
  });

  /* ── PDF ───────────────────────────────────────────────── */
  let pdfURL = null;
  function makeDoc() {
    const Ctor = window.jspdf && window.jspdf.jsPDF;
    if (!Ctor || !current) return null;
    const { plan, prefs } = current;
    const doc = new Ctor({ unit: 'pt', format: 'a4' });
    const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
    const M = 56; let y = M;
    const need = h => { if (y + h > H - M) { doc.addPage(); y = M; } };
    const text = (str, size, style, colour, indent, gap) => {
      doc.setFont('helvetica', style || 'normal'); doc.setFontSize(size);
      doc.setTextColor.apply(doc, colour || [30, 30, 40]);
      doc.splitTextToSize(String(str), W - M * 2 - (indent || 0)).forEach(l => {
        need(size + 4); doc.text(l, M + (indent || 0), y); y += size * 1.35; });
      y += gap || 0;
    };
    doc.setFillColor(22, 24, 38); doc.rect(0, 0, W, 118, 'F');
    doc.setTextColor(233, 233, 237); doc.setFont('helvetica', 'bold'); doc.setFontSize(19);
    doc.text('AI_tour_guide.ae', M, 52);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(180, 175, 220);
    doc.text('Smart UAE AI Tourism Assistant  ·  Created by Ashwanth Vijay, Grade 9-AI', M, 70);
    doc.setFontSize(14); doc.setTextColor(210, 206, 253);
    doc.text(doc.splitTextToSize(plan.title || 'Your UAE itinerary', W - M * 2), M, 96);
    y = 150;
    text('Destination: ' + prefs.destination + '   |   Duration: ' + prefs.days +
      (prefs.days === 1 ? ' day' : ' days') + '   |   Budget: AED ' + fmt(prefs.budget) +
      ' (' + prefs.tier + ')', 10, 'normal', [110, 110, 130], 0, 4);
    text('Interests: ' + (prefs.interests.join(', ') || 'General sightseeing'), 10, 'normal', [110, 110, 130], 0, 14);
    if (plan.raw) { text(plan.raw, 11, 'normal', [40, 40, 55], 0, 0); }
    else {
      if (plan.summary) text(plan.summary, 11, 'normal', [55, 55, 72], 0, 16);
      (plan.days || []).forEach((d, i) => {
        need(60); doc.setDrawColor(145, 132, 217); doc.setLineWidth(1); doc.line(M, y - 10, W - M, y - 10);
        text('DAY ' + (d.day || i + 1) + '  ·  ' + (d.theme || 'Exploring'), 13, 'bold', [70, 58, 106], 0, 6);
        (d.stops || d.activities || []).forEach(s => {
          need(46);
          text((s.time ? s.time + '   ' : '') + (s.title || s.name || '') + (s.cost ? '   [' + s.cost + ']' : ''),
            11, 'bold', [30, 30, 45], 0, 2);
          if (s.detail || s.description) text(s.detail || s.description, 10, 'normal', [95, 95, 115], 14, 6);
        });
        y += 10;
      });
      if ((plan.tips || []).length) { need(60); text('LOCAL TIPS', 11, 'bold', [70, 58, 106], 0, 6);
        plan.tips.forEach(t => text('•  ' + t, 10, 'normal', [80, 80, 100], 0, 4)); }
      if (plan.estimatedTotal) { y += 6; text('Estimated spend: ' + plan.estimatedTotal, 10, 'bold', [70, 58, 106], 0, 0); }
    }
    const pages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(150, 150, 165);
      doc.text('Generated by AI_tour_guide.ae — Smart UAE AI Tourism Assistant', M, H - 28);
      doc.text(i + ' / ' + pages, W - M, H - 28, { align: 'right' });
    }
    return doc;
  }
  function buildPDF() {
    const doc = makeDoc(); if (!doc) return;
    if (pdfURL) URL.revokeObjectURL(pdfURL);
    pdfURL = URL.createObjectURL(doc.output('blob'));
    $('#pdf-empty').hidden = true;
    const f = $('#pdf-frame'); f.hidden = false; f.src = pdfURL + '#view=FitH';
  }
  dl.addEventListener('click', () => {
    const doc = makeDoc();
    if (!doc) { alert('PDF library is still loading — try again in a moment.'); return; }
    const p = current.prefs;
    doc.save('AI_tour_guide-ae-' + p.destination.replace(/\s+/g, '-') + '-' + p.days + '-day-itinerary.pdf');
  });

  /* ── generation ────────────────────────────────────────── */
  const genBtn = $('#generate');
  let busy = false;

  async function generate(userText) {
    if (busy) return; busy = true;
    const prefs = readPrefs(), key = keyEl.value.trim(), model = $('#model').value;
    if (userText) { say(userText, 'me'); refinements.push(userText); }
    else if (!log.children.length) {
      say('Plan ' + prefs.days + ' days in ' + prefs.destination + ', AED ' + fmt(prefs.budget) +
        ', interests: ' + (prefs.interests.join(', ') || 'general sightseeing') + '.', 'me');
    }
    genBtn.disabled = true; sendBtn.disabled = true;
    genBtn.replaceChildren(el('span', 'spinner'), document.createTextNode(key ? 'Thinking' : 'Planning'));
    const thinking = say(key ? 'Asking ' + model + '…' : 'Building your plan…', 'sys');
    try {
      if (!key) {
        await new Promise(r => setTimeout(r, 700));
        render(demoItinerary(prefs, refinements), prefs,
          notice('info', 'Demo mode — built by the offline planner. Add a Gemini API key under “Model & API key” for a fully AI-written itinerary.'));
        thinking.remove();
        say('Done — ' + prefs.days + (prefs.days === 1 ? ' day' : ' days') + ' across ' + prefs.destination +
          '. The PDF and map are updated. Tell me what to change.');
      } else {
        const res = await callWithFallback(key, model, buildPrompt(prefs, refinements),
          (failed, next) => { thinking.textContent = failed + ' is busy — falling back to ' + next + '…'; });
        const text = res.text;
        const plan = parseJSON(text);
        thinking.remove();
        const via = res.model === model ? '' : ' (answered by ' + res.model + ' — ' + model + ' was unavailable)';
        if (plan && plan.days) { render(plan, prefs);
          say((plan.summary || 'Itinerary ready.') + via + ' Say what to change and I will re-plan.'); }
        else { renderRaw(text, prefs, notice('info', 'The model replied in prose rather than structured data — shown as written.'));
          say('The model answered in prose this time' + via + ' — it is on the itinerary tab.'); }
      }
    } catch (err) {
      thinking.remove();
      render(demoItinerary(prefs, refinements), prefs,
        notice('error', 'Every Gemini model failed: ' + err.message + ' — showing the offline plan instead.'));
      say('No Gemini model could be reached (' + err.message + '). I built an offline plan so you are not stuck.');
    } finally {
      busy = false; genBtn.disabled = false;
      genBtn.textContent = 'Regenerate itinerary';
      enableChat(true);
    }
  }

  $('#setup-form').addEventListener('submit', e => { e.preventDefault(); generate(null); });
  $('#composer').addEventListener('submit', e => {
    e.preventDefault();
    const t = promptEl.value.trim(); if (!t) return;
    promptEl.value = ''; generate(t);
  });
  $('#reset').addEventListener('click', () => {
    refinements.length = 0; current = null; dl.disabled = true;
    log.replaceChildren(); log.hidden = true; chatEmpty.hidden = false; enableChat(false);
    genBtn.textContent = 'Generate itinerary';
    const e = el('div', 'empty');
    e.append(el('h4', null, 'Nothing planned yet.'),
      el('p', null, 'Set the trip and press Generate. The itinerary appears here, the PDF renders in the next tab, and every stop plots on the map.'));
    out.replaceChildren(e);
    $('#pdf-empty').hidden = false; const f = $('#pdf-frame'); f.hidden = true; f.removeAttribute('src');
    if (pdfURL) { URL.revokeObjectURL(pdfURL); pdfURL = null; }
    buildMap({ days: [] }); selectTab('tab-itin');
  });

  /* ── floating notes ────────────────────────────────────── */
  const notes = $('#notes'), bar = $('#notes-bar'), notesText = $('#notes-text'), fab = $('#notes-open');
  const N_TEXT = 'aitourguide.notes.text', N_POS = 'aitourguide.notes.pos', N_HID = 'aitourguide.notes.hidden';
  try {
    const t = localStorage.getItem(N_TEXT); if (t) notesText.value = t;
    const pos = JSON.parse(localStorage.getItem(N_POS) || 'null');
    if (pos && typeof pos.x === 'number' && pos.x < innerWidth - 60 && pos.y < innerHeight - 40) {
      notes.style.left = pos.x + 'px'; notes.style.top = pos.y + 'px';
      notes.style.right = 'auto'; notes.style.bottom = 'auto';
    }
    if (localStorage.getItem(N_HID) === '1') { notes.hidden = true; fab.hidden = false; }
  } catch (e) {}
  let saveTimer;
  notesText.addEventListener('input', () => {
    clearTimeout(saveTimer); $('#notes-foot').textContent = 'Saving…';
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(N_TEXT, notesText.value); } catch (e) {}
      $('#notes-foot').textContent = 'Saved locally · drag the bar to move';
    }, 450);
  });
  $('#notes-min').addEventListener('click', () => notes.classList.toggle('min'));
  $('#notes-close').addEventListener('click', () => {
    notes.hidden = true; fab.hidden = false;
    try { localStorage.setItem(N_HID, '1'); } catch (e) {}
  });
  fab.addEventListener('click', () => {
    notes.hidden = false; fab.hidden = true;
    try { localStorage.setItem(N_HID, '0'); } catch (e) {}
    notesText.focus();
  });
  let drag = null;
  bar.addEventListener('pointerdown', e => {
    if (e.target.closest('.icon-btn')) return;
    const r = notes.getBoundingClientRect();
    drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    notes.style.left = r.left + 'px'; notes.style.top = r.top + 'px';
    notes.style.right = 'auto'; notes.style.bottom = 'auto';
    bar.setPointerCapture(e.pointerId);
  });
  bar.addEventListener('pointermove', e => {
    if (!drag) return;
    const x = Math.min(Math.max(6, e.clientX - drag.dx), innerWidth - notes.offsetWidth - 6);
    const y = Math.min(Math.max(6, e.clientY - drag.dy), innerHeight - 44);
    notes.style.left = x + 'px'; notes.style.top = y + 'px';
  });
  const endDrag = () => { if (!drag) return; drag = null;
    try { localStorage.setItem(N_POS, JSON.stringify({ x: parseFloat(notes.style.left), y: parseFloat(notes.style.top) })); } catch (e) {} };
  bar.addEventListener('pointerup', endDrag);
  bar.addEventListener('pointercancel', endDrag);
})();
