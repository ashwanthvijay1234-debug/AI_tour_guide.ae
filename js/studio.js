/* ============================================================================
   studio.js — planning, AI, chat, map, PDF and notes for AI_tour_guide.ae
   ----------------------------------------------------------------------------
   WHAT THIS IS
   The whole application. studio.html is structure, css/studio.css is paint;
   every behaviour in the studio is in this file.

   THE TWO MODES, AND WHY THERE ARE TWO
     Demo mode  — no API key. A built-in offline planner writes the itinerary
                  from a hard-coded pool of real UAE places. It always works,
                  with no internet and no key, because a demo that depends on
                  working WiFi is a demo that fails on the one morning you need
                  it to work: in front of a class, on school wifi, at 9am.
     AI mode    — a Gemini key is present. Google Gemini writes the plan. If a
                  model is retired, busy or unavailable, the call walks down a
                  chain of models the key has been confirmed to support, and
                  only if every one of them fails does it fall back to the
                  offline planner — saying so, out loud, in the chat.

   MAP OF THE FILE
     1  helpers, storage, state
     2  the place pool, time slots, day themes, budget tiers
     3  seeded shuffle
     4  the offline planner
     5  the prompt
     6  the Gemini layer  (listModels / buildChain / callWithFallback / parse)
     7  rendering the plan
     8  the map panel
     9  the PDF
     10 chat: bubbles, thinking dots, typing animation
     11 the generating veil
     12 the generation flow
     13 controls, tabs and the key panel
     14 the floating notes window
     15 boot

   PRIVACY
   The API key lives in this browser's localStorage and nowhere else. It is
   sent only to Google's endpoint, directly from this machine. There is no
   backend in this project at all. Never commit a key.
   ========================================================================== */

(function () {
  'use strict';

  /* ======================================================================
     1 — helpers, storage, state
     ==================================================================== */

  var $ = function (id) { return document.getElementById(id); };

  /* Every element in the output is built with createElement + textContent and
     never innerHTML. The content comes from a language model, and a model that
     emits "<img onerror=...>" as a stop title must produce a badly-named stop,
     not a script. */
  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  /* Checked at call time rather than cached at load: the OS setting can be
     changed while the page is open, and a cached answer would keep animating
     at somebody who has just asked it to stop. */
  function reduced() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /* localStorage throws in private mode and under file:// in some browsers.
     None of what this app stores is important enough to break a page over, so
     every read and write goes through these two and failure is simply a
     no-op. */
  var KEYS = {
    key: 'aitourguide.gemini.key',
    notesText: 'aitourguide.notes.text',
    notesPos: 'aitourguide.notes.pos',
    notesHidden: 'aitourguide.notes.hidden',
    /* The offline run counter is persisted for one specific reason: it seeds
       the shuffle, and a counter that resets to zero on every page load means
       the first plan after a reload is byte-identical to the first plan after
       the last reload. Users reload far more than you expect, so the planner
       looked completely deterministic even though it was varying properly
       within a session. */
    runs: 'aitourguide.offline.runs'
  };

  function load(name, fallback) {
    try {
      var raw = window.localStorage.getItem(name);
      return raw === null ? fallback : raw;
    } catch (err) { return fallback; }
  }

  function save(name, value) {
    try { window.localStorage.setItem(name, value); } catch (err) { /* ignore */ }
  }

  function drop(name) {
    try { window.localStorage.removeItem(name); } catch (err) { /* ignore */ }
  }

  function aed(n) {
    return 'AED ' + Math.round(n).toLocaleString('en-US');
  }

  function sleep(ms) {
    return new Promise(function (resolve) { window.setTimeout(resolve, ms); });
  }

  var state = {
    plan: null,             /* the parsed itinerary currently on screen       */
    refinements: [],        /* chat notes, oldest first — sent with the prompt */
    busy: false,            /* re-entry guard for generate()                   */
    offlineRuns: 0,         /* seeds the offline shuffle so runs differ        */
    aiAttempts: 0,          /* nudges the prompt so regeneration differs       */
    pdfUrl: null,           /* current blob URL; revoked before each rebuild   */
    pdfDoc: null,
    typeToken: null,        /* cancels an in-flight typing animation           */
    modelCache: {}          /* key → the models that key can actually call     */
  };

  /* DOM handles, gathered once. */
  var dom = {};

  /* ======================================================================
     2 — the place pool, time slots, day themes, budget tiers
     ----------------------------------------------------------------------
     Real UAE places, keyed by the eight interest chips, each one a
     [name, why it is worth the slot, cost in AED] triple. 0 means free.
     The descriptions are written with actual local knowledge on purpose: a
     planner that says "visit the famous souk" reads like a template, and the
     whole claim of the project is that it does not.
     ==================================================================== */

  var PLACES = {
    culture: [
      ['Al Fahidi Historical Neighbourhood', 'Wind-tower lanes from the 1890s, before the oil money. Go early — the coral-and-gypsum walls hold the cool and the courtyard cafés open at eight.', 0],
      ['Sheikh Zayed Grand Mosque', 'Forty-three domes and the largest hand-knotted carpet in the world. Entry is free, but book the timed slot online and carry a scarf: shoulders and knees covered, no exceptions.', 0],
      ['Qasr Al Watan', 'A working presidential palace that opens its Great Hall and its library to visitors. Stay for the evening light show thrown across the façade.', 65],
      ['Sharjah Museum of Islamic Civilization', 'A restored souk building holding a thousand years of astronomy, medicine and manuscript art. The gold zodiac dome in the ceiling is worth the ticket on its own.', 10],
      ['Louvre Abu Dhabi', 'Jean Nouvel’s "rain of light" dome over galleries that hang a Chinese Buddha beside a Roman bust. Arrive two hours before closing for the quiet.', 63],
      ['Etihad Museum', 'Built on the spot where the union was signed in 1971. The constitution room explains the seven-emirate deal better than any textbook.', 25],
      ['Al Ain Palace Museum', 'Sheikh Zayed’s family home, kept as it was — majlis, date store, wind-cooled rooms. Free, and rarely crowded.', 0],
      ['Jumeirah Mosque', 'The one Dubai mosque open to non-Muslims, through the "Open Doors, Open Minds" tour. Ask anything — that is the entire point of it.', 40],
      ['Al Jahili Fort, Al Ain', 'A 19th-century mud-brick fort holding a permanent exhibition on Wilfred Thesiger’s crossings of the Empty Quarter. Free, and gloriously cool inside.', 0],
      ['Heart of Sharjah', 'A whole restored quarter of pre-oil Gulf town — courtyard houses, a calligraphy museum and the old market, all walkable in an afternoon.', 0],
      ['Al Bidya Mosque, Fujairah', 'The oldest mosque in the country, built around 1446 from mud and stone, four domes balanced on a single pillar. Tiny, and still in use.', 0],
      ['Qasr Al Hosn, Abu Dhabi', 'The city’s oldest stone building — a 1760s watchtower that grew into a fort. The museum inside traces Abu Dhabi back to a fishing village.', 30],
      ['Al Shindagha Museum', 'Perfume house, pearl-diving galleries and the ruler’s old home on the creek. The clearest explanation anywhere of where the money came from before oil.', 50],
      ['Sharjah Art Foundation', 'Contemporary galleries threaded through restored courtyard houses. Free, and the calmest hour of any Sharjah day.', 0]
    ],
    desert: [
      ['Al Marmoom evening safari', 'Dune drive, camels and a Bedouin camp dinner under a sky with no city glow. Pickup is late afternoon so the drive lands at golden hour.', 250],
      ['Liwa Oasis and Moreeb Dune', 'Three hours south into the Empty Quarter for a 300-metre wall of sand. This is the desert the postcards are imitating.', 320],
      ['Hatta rock pools', 'Mountain wadi water in the Hajar range, cool enough to swim in even in May. Kayaks on the dam and a heritage village on the way back.', 60],
      ['Sunrise hot-air balloon', 'Up at four, airborne by six, oryx and gazelle below as the light turns the sand orange. The only genuinely quiet hour in the country.', 1150],
      ['Al Qudra Lakes', 'Man-made lakes in open desert with flamingos, cycling tracks and a sunset that empties the car park. Bring your own food — there is nothing out there.', 0],
      ['Al Badayer dunes', 'The "Big Red" sands between Dubai and Sharjah: quad bikes and sandboarding, an hour from the city and back by dinner.', 180],
      ['Al Ain camel market', 'The last traditional camel souk in the country. Loud, dusty and entirely real — go early, and expect to be offered tea before a price.', 0],
      ['Fossil Dune, Al Wathba', 'Wind-sculpted rock formations three million years old, lit after dark, twenty minutes outside Abu Dhabi. Free.', 0],
      ['Mleiha Archaeological Centre', 'Bronze Age tombs and desert fossils under a striking modern centre, with stargazing and dune drives leaving from the door.', 65],
      ['Dune bashing at Lahbab', 'Red dunes, a Land Cruiser and a driver who knows exactly how far to lean it. Book the afternoon run so it finishes at sunset.', 200],
      ['Bab Al Shams desert dinner', 'Falconry, oud and a courtyard grill inside a fort-shaped resort in open desert, an hour from the city and a world away from it.', 420],
      ['Camel trekking, Al Marmoom', 'An hour on a camel at walking pace across the reserve. Slower than a 4x4, and far closer to how this country was actually crossed.', 150],
      ['Al Faya desert retreat', 'A former petrol station turned desert lodge near Mleiha, with the darkest skies within reach of Dubai. Stay for the stars, not the pool.', 0]
    ],
    shopping: [
      ['Dubai Mall and the Fountain', '1,200 shops, but the best part is free and outside — the fountain runs every half hour after six, and the plaza fills twenty minutes before.', 0],
      ['Gold and Spice Souks, Deira', 'Cross by abra for one dirham, then bargain properly — the tag price is an opening offer, and walking away is part of the conversation.', 1],
      ['Mall of the Emirates', 'An indoor ski slope, real penguins, and a mall that doubles as an air-conditioned midday shelter from May to September.', 0],
      ['Souk Madinat Jumeirah', 'A built-for-visitors souk and honest about it — but the waterways, the lanterns and the Burj Al Arab view at dusk earn the hour.', 0],
      ['Global Village', 'Ninety countries in pavilions, open October to April only. Go on a weekday evening; weekends are shoulder to shoulder.', 25],
      ['Blue Souk, Sharjah', 'Two barrel-vaulted halls of carpets, silver and antiques, at prices a third below Dubai’s.', 0],
      ['Naif Souk, Deira', 'A late-opening textile and perfume market where the city itself shops. Bargaining expected, tourist pricing rare.', 0],
      ['Perfume Souk, Deira', 'Oud, amber and custom blends measured out by the tola. Ask to smell the oud burning before you talk about price.', 0],
      ['Al Seef, Dubai Creek', 'A modern waterfront built to look like 1950s Dubai, with craft stalls and its own abra dock. Touristy, and genuinely lovely after dark.', 0],
      ['City Walk, Dubai', 'An open-air street of boutiques and pavement cafés that comes into its own on a winter evening, when a mall feels like the wrong answer.', 0],
      ['Ripe Market', 'A weekend farmers’ and makers’ market on the grass, October to April — Emirati honey, local dates and food trucks.', 0],
      ['Dubai Hills Mall', 'Newer, calmer and far less crowded than the big two, with an easier car park and a rooftop for the evening.', 0]
    ],
    family: [
      ['IMG Worlds of Adventure', 'The largest indoor theme park on earth — Marvel, Cartoon Network and a dinosaur zone, all at 22 °C whatever July is doing outside.', 345],
      ['Dubai Aquarium and Underwater Zoo', 'A ten-million-litre tank with a walk-through tunnel, inside Dubai Mall, so it slots into a shopping afternoon without another drive.', 140],
      ['Yas Waterworld', 'Forty-three rides built around a pearl-diving legend. Book the day before to skip the queue at the gate.', 260],
      ['Dubai Frame', 'A 150-metre gold picture frame: old Dubai through one side, new Dubai through the other, and a glass floor between them.', 50],
      ['Ferrari World Abu Dhabi', 'Formula Rossa does 0–240 km/h in under five seconds; the rest of the park stays calm enough for younger children.', 345],
      ['Aquaventure at Atlantis', 'Waterslides through a shark lagoon plus a private beach, which buys back the afternoon once the children are done.', 355],
      ['Legoland Dubai', 'Built for two to twelve-year-olds specifically, with a water park next door. The only park here genuinely aimed at small children.', 330],
      ['The Green Planet', 'An indoor bio-dome holding 3,000 plants and animals in a tropical rainforest, sloths included. One cool hour, start to finish.', 130],
      ['Wild Wadi Waterpark', 'Compact, well-shaded and directly under the Burj Al Arab, so it works as a half-day rather than swallowing a whole one.', 249],
      ['Dubai Miracle Garden', '150 million flowers arranged over, among other things, a full-size Airbus A380. Open November to May, and unapologetically strange.', 95],
      ['Motiongate Dubai', 'Film-studio rides across the DreamWorks, Sony and Lionsgate lots. Noticeably quieter midweek than IMG.', 295],
      ['SeaWorld Abu Dhabi', 'An indoor marine park on Yas Island built around a 25-million-litre aquarium, air-conditioned end to end.', 375],
      ['Children’s City, Creek Park', 'A hands-on science museum for under-twelves inside a park, at a fraction of theme-park money.', 15]
    ],
    food: [
      ['Al Fanar, Emirati breakfast', 'Balaleet, chebab pancakes and karak in a room built as 1960s Dubai. The most straightforwardly Emirati meal in the city.', 95],
      ['Ravi in Satwa', 'A Pakistani institution running since 1978 — plastic chairs, AED 20 plates and a queue of taxi drivers, which is the only review that matters.', 35],
      ['Al Ras food walk, Deira', 'Samosas, Iranian bread straight off a wall oven, fresh juice and Yemeni honey, on foot, for less than the taxi there.', 60],
      ['Pierchic', 'A seafood room at the end of a wooden pier with the Burj Al Arab behind it. Book the sunset seating weeks ahead.', 520],
      ['Arabian Tea House, Al Fahidi', 'A courtyard of white wicker and turquoise benches; the mezze platter and the saffron tea are worth waiting for a table.', 110],
      ['Bu Qtair, Umm Suqeim', 'Fried fish in a spiced batter, served from a shack near the beach on paper plates. Come at six or join the queue.', 60],
      ['Logma, Boxpark', 'Modern Emirati small plates — chebab, balaleet sliders and karak on tap. The easiest possible introduction to the local kitchen.', 120],
      ['Aseelah, Deira', 'Emirati fine dining done properly: machboos, harees and thareed, with the creek outside the window.', 220],
      ['Al Mallah, Satwa', 'Shawarma and fresh juice at pavement tables since 1979. Order the mixed grill and a mint-lemon and watch Satwa go past.', 40],
      ['Al Ustad Special Kebab', 'A 1978 Iranian kebab house papered floor to ceiling with photographs of everyone who has eaten there. Cash only, no bookings.', 50],
      ['Sind Punjab, Bur Dubai', 'Forty years of North Indian cooking on Al Fahidi Street. Cheap, busy and consistently better than it needs to be.', 45],
      ['Time Out Market, Souk Al Bahar', 'Seventeen of the city’s best kitchens under one roof, which settles the argument when a group has five opinions.', 90],
      ['Friday brunch at a hotel', 'The UAE’s own invention: three hours, unlimited food, booked weeks ahead. Pick one and write off the rest of the afternoon.', 350]
    ],
    beach: [
      ['Kite Beach', 'Soft sand, a running track and the Burj Al Arab in the frame. Free showers, and the food trucks stay open late.', 0],
      ['Dubai Creek abra crossing', 'One dirham, five minutes, a wooden boat across the water old Dubai was built on — the best-value experience in the country.', 1],
      ['Saadiyat Public Beach', 'Protected hawksbill turtle nesting sand next door to the museum district, with dolphins offshore early in the morning.', 25],
      ['Snoopy Island, Fujairah', 'Snorkel straight off the beach over live coral and reef sharks on the Indian Ocean side — a completely different sea.', 0],
      ['Al Mamzar Beach Park', 'Five sheltered lagoons, barbecue pits and lawns, on a Sharjah-facing spit most visitors never find.', 5],
      ['JBR, The Beach', 'A promenade of cafés, an open-air cinema in winter and calm swimming water — the easiest sunset in Dubai.', 0],
      ['Khor Fakkan Beach', 'A crescent bay on the east coast backed by mountains, with an amphitheatre and a waterfall lit after dark.', 0],
      ['Al Aqah Beach, Fujairah', 'Calm Indian Ocean water under the Hajar mountains, and the best diving in the country a short boat ride out.', 0],
      ['Corniche Beach, Abu Dhabi', 'Blue Flag sand running eight kilometres along the city, with a cycle path the whole way and showers every few hundred metres.', 10],
      ['La Mer, Jumeirah', 'A painted beachfront of food shacks and swimming water, with a small waterpark at one end for the children.', 0],
      ['Jumeirah Public Beach', 'Free, central, and the source of the classic Burj Al Arab photograph taken from the water’s edge.', 0],
      ['Yas Beach', 'A quiet stretch on Yas Island with loungers and shade, ten minutes from the theme parks and nothing like as loud.', 80]
    ],
    architecture: [
      ['Burj Khalifa, At The Top', '828 metres. Book the last slot before sunset and watch the city switch on beneath you — the price doubles for that hour and it is still the right choice.', 179],
      ['Museum of the Future', 'A steel torus wrapped in Arabic calligraphy that is also the building’s structure. Inside is an exhibition set in 2071 — the same year this project’s vision points at.', 149],
      ['The View at The Palm', 'Level 52 of The Palm Tower, looking down on the whole fronds-and-trunk shape you simply cannot read from the ground.', 100],
      ['Etihad Towers observation deck', 'Level 74 over the Corniche with the Emirates Palace gardens laid out below. The ticket is redeemable against coffee.', 95],
      ['Dubai Opera', 'A dhow-shaped hall that converts from a theatre to a flat-floor venue in a day. Worth a show, or just the lobby at night.', 250],
      ['Al Bahar Towers', 'A façade of a thousand folding mashrabiya panels that open and close with the sun — traditional shading, solved with computers. Photograph it from outside.', 0],
      ['Burj Al Arab', 'A sail on a man-made island, and still the building the city is known by. Afternoon tea is the cheapest way to get inside it.', 650],
      ['Palm Jumeirah boardwalk', 'Eleven kilometres of boardwalk around the frond tips, the Atlantis at one end and the whole skyline at the other. Free.', 0],
      ['Dubai Marina walk', 'A canyon of towers around a man-made canal, best seen at dusk from the water on a AED 3 ferry rather than from the pavement.', 3],
      ['Capital Gate, Abu Dhabi', 'The leaning tower of Abu Dhabi, inclined eighteen degrees — four times Pisa. Photograph it from the exhibition centre side.', 0],
      ['The Opus by Zaha Hadid', 'A cube with a void carved out of its middle, in Business Bay. Come after dark, when the void is lit from inside.', 0],
      ['Jumeirah Emirates Towers', 'Two triangular towers from 2000 that set the template for everything built after them on Sheikh Zayed Road.', 0],
      ['Sheikh Zayed Desert Learning Centre', 'A Platinum-rated sustainable building half-buried in the desert at Al Ain — a working lesson in building for this climate.', 15]
    ],
    nature: [
      ['Ras Al Khor flamingo hides', 'A wetland reserve inside the city, wedged up against the skyline. Free bird hides with mounted scopes — go before nine.', 0],
      ['Jebel Jais', 'The highest peak in the UAE at 1,934 m, with a switchback road, a viewing deck and air ten degrees cooler than the coast.', 0],
      ['Abu Dhabi mangrove kayaking', 'Paddle silent channels through the mangroves at high tide — herons, crabs, and the skyline standing behind the trees.', 145],
      ['Al Ain Oasis', '147,000 date palms watered by a 3,000-year-old falaj channel system that still runs. A UNESCO site you can walk through for free.', 0],
      ['Sir Bani Yas Island', 'A wildlife reserve with free-roaming cheetah, giraffe and 13,000 animals, reached by ferry from the Western Region.', 420],
      ['Wadi Shawka', 'A marked hiking loop through the Hajar foothills with pools after rain — proof that the UAE is not all sand.', 0],
      ['Al Wathba Wetland Reserve', 'Abu Dhabi’s flamingo lake, a protected reserve with hides and marked trails. Open October to April, and free.', 0],
      ['Jubail Mangrove Park', 'Boardwalks out over tidal mangrove channels with interpretive signs the whole way. Free, and best at dawn before the heat.', 0],
      ['Jebel Hafeet', 'A twelve-kilometre mountain road climbing 1,240 m above Al Ain, with hot springs and Bronze Age tombs at the bottom.', 0],
      ['Hatta Dam kayaking', 'Turquoise water held between bare mountains, with kayaks and pedal boats for hire at the dam wall.', 60],
      ['Khor Kalba mangrove reserve', 'The oldest mangroves in Arabia, with a kayak centre and the rare white-collared kingfisher if you are patient.', 25],
      ['Wadi Wurayah, Fujairah', 'The country’s first mountain protected area, with waterfalls and freshwater pools that run after rain.', 0],
      ['Dubai Safari Park', 'Three thousand animals in open habitats arranged by region, open October to May. Far better done early.', 50]
    ]
  };

  var INTEREST_LABELS = {
    culture: 'Cultural landmarks',
    desert: 'Desert adventure',
    shopping: 'Shopping',
    family: 'Family',
    food: 'Food & dining',
    beach: 'Beaches & water',
    architecture: 'Architecture',
    nature: 'Nature & wildlife'
  };

  var SLOTS = [
    '08:30 – 10:30',
    '11:00 – 12:30',
    '13:00 – 14:30',
    '15:00 – 17:00',
    '17:30 – 19:30',
    '20:30 – 22:00'
  ];

  var THEMES = [
    'Arrival and old city',
    'Heritage and the creek',
    'Desert day',
    'Modern icons',
    'Coast and calm',
    'Abu Dhabi crossing',
    'Markets and flavour',
    'Mountains and wadis',
    'Museums and mosques',
    'Island and open water',
    'Skyline and sunset',
    'Souks and side streets',
    'Oasis and open road',
    'Last look and lift-off'
  ];

  var TIPS = [
    'May to September, keep 12:00–16:00 indoors — malls, museums and aquariums exist for exactly this reason.',
    'Cover shoulders and knees at mosques, and carry a scarf for the Grand Mosque; abayas are lent at the entrance but the queue is long.',
    'A Nol card beats taxis across Dubai — the Metro Red Line runs the length of Sheikh Zayed Road for a few dirhams.',
    'Friday midday prayers pause many attractions for about an hour; plan lunch around 12:15 rather than a ticket queue.'
  ];

  var TIERS = [
    [2500, 'Budget', 'Hostels and budget hotels, street food, free landmarks, public transport.'],
    [8000, 'Comfort', 'Good hotels, a mix of paid attractions and free ones.'],
    [18000, 'Premium', 'Four- and five-star stays, private transfers and signature dining.'],
    [Infinity, 'Luxury', 'Landmark hotels, private guides, helicopter and yacht time, fine dining.']
  ];

  function tierFor(budget) {
    for (var i = 0; i < TIERS.length; i++) {
      if (budget < TIERS[i][0]) return { name: TIERS[i][1], note: TIERS[i][2] };
    }
    return { name: 'Luxury', note: TIERS[3][2] };
  }

  /* ======================================================================
     3 — seeded shuffle
     ----------------------------------------------------------------------
     WHY THIS EXISTS AT ALL
     The offline planner is a pure function of the four settings, so pressing
     Generate twice at the same settings returned a byte-identical plan. That
     reads to a user as "the AI is broken" — and in demo mode there is no AI to
     blame for it. A session run counter feeds this shuffle, so every press
     reorders the pool and shifts the day themes.

     WHY SEEDED RATHER THAN Math.random()
     One seed always produces one ordering. That keeps the planner
     reproducible and testable: the same run number gives the same plan, which
     matters when you are trying to work out whether a change to the planner
     did anything.
     ==================================================================== */

  function seeded(seed) {
    /* Knuth multiplicative hash to spread small consecutive seeds (1, 2, 3…)
       across the whole 32-bit range, then a plain LCG to step through it.
       Without the hash, runs 1 and 2 produce near-identical first draws. */
    var s = (Math.imul(seed ^ 0x9e3779b9, 2654435761) >>> 0) || 1;
    return function () {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function shuffled(list, rnd) {
    var a = list.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }

  /* ======================================================================
     4 — the offline planner
     ==================================================================== */

  /* The planner cannot read English, so it reacts to the chat by pattern.
     This is crude on purpose and the app says so in the chat afterwards —
     claiming comprehension the code does not have would be the one genuinely
     dishonest thing this project could do. */
  var RX_LIGHTER = /toddler|kid|child|family|slow|light|relax|tired|elderly/i;
  var RX_CHEAPER = /cheap|budget|less|afford|save/i;
  var RX_FOOD = /food|eat|dining|restaurant|cuisine/i;

  function offlinePlan(cfg, notes) {
    state.offlineRuns += 1;
    save(KEYS.runs, String(state.offlineRuns));

    var joined = notes.join(' ');
    var lighter = RX_LIGHTER.test(joined);
    var cheaper = RX_CHEAPER.test(joined);
    var foodFirst = RX_FOOD.test(joined);

    var rnd = seeded(state.offlineRuns * 7919 + cfg.days * 31 + cfg.budget);

    /* Build the candidate pool out of the chosen interests. */
    var interests = cfg.interests.length ? cfg.interests : ['culture', 'architecture'];
    var pool = [];
    interests.forEach(function (key) {
      (PLACES[key] || []).forEach(function (place) {
        pool.push({ name: place[0], detail: place[1], cost: place[2], tag: key });
      });
    });

    pool = shuffled(pool, rnd);

    if (foodFirst) {
      /* Bring every food entry to the front so the day-filling loop below
         reaches them first. */
      var meals = pool.filter(function (p) { return p.tag === 'food'; });
      var rest = pool.filter(function (p) { return p.tag !== 'food'; });
      if (!meals.length) {
        meals = shuffled(PLACES.food, rnd).map(function (place) {
          return { name: place[0], detail: place[1], cost: place[2], tag: 'food' };
        });
      }
      pool = meals.concat(rest);
    }

    /* Stops per day scale with the money available per day, then get cut if
       the traveller has asked for a lighter pace. */
    var perDay = cfg.budget / cfg.days;
    var perDayStops = perDay > 2000 ? 6 : (perDay > 700 ? 5 : 4);
    if (lighter) perDayStops = 3;

    /* The general fill pool covers interests the traveller did not tick: a
       plan built only of desert stops still needs something to do on day four.
       Culture + Architecture is the safe default — it is what a visitor with
       no stated preference should be shown. */
    var general = shuffled(PLACES.culture.concat(PLACES.architecture), rnd)
      .map(function (place) {
        return { name: place[0], detail: place[1], cost: place[2], tag: 'culture' };
      });

    /* Fold the general pool INTO the interest pool rather than appending it
       after.

       Why: a 5-day trip needs 25 distinct places, and two ticked interests
       only offer about 27. Appending meant the fill loop took the first 25 of
       those 27 every single time — so two runs shared 92% of their stops and
       the only thing that actually changed was the order. That is precisely
       what "it gives me the same plan every time" looks like from the outside.

       One general place after every third interest place widens the draw to
       roughly 54 candidates for the same 25 slots, which cuts the overlap
       between consecutive runs to around half, while still keeping the
       traveller's own interests as the clear majority of every day. */
    var candidates = [];
    var generalAt = 0;

    pool.forEach(function (place, index) {
      candidates.push(place);
      if (index % 3 === 2 && generalAt < general.length) {
        candidates.push(general[generalAt++]);
      }
    });

    while (generalAt < general.length) candidates.push(general[generalAt++]);

    if (cheaper) {
      /* Cheap-first, but deliberately not a plain sort on cost.

         A plain ascending sort is perfectly stable — and that is the problem.
         Selecting the first 25 of a cost-sorted list gives the SAME 25 places
         on every run, so asking for a cheaper trip pinned the plan to one
         fixed answer and every regeneration came back identical. Stability
         only preserves the shuffle among items of exactly equal cost, which
         does not help decide which items make the cut at all.

         So each candidate gets a seeded jitter of roughly ±40% applied to its
         price. Cheap places still come first the overwhelming majority of the
         time, but which of the cheap ones make the cut moves between runs. The
         +40 floor stops every free entry collapsing to a single tied value. */
      var jitter = {};
      candidates.forEach(function (place) { jitter[place.name] = 0.5 + rnd() * 1.9; });
      candidates.sort(function (a, b) {
        return (a.cost + 40) * jitter[a.name] - (b.cost + 40) * jitter[b.name];
      });
    }

    var used = {};
    var cursor = 0;

    /* A day can never hold more distinct places than exist. Without this cap
       the fill loop below would spin forever looking for a stop it can never
       find, because recycling refuses to repeat a place within one day. */
    if (perDayStops > candidates.length) perDayStops = Math.max(1, candidates.length);

    /* Fourteen days at six stops is 84 slots, and the pool does not hold 84
       distinct places. Rather than emit empty days — which is what an earlier
       version did, and it looked exactly like a crash — the cursor wraps and
       the de-duplication set is cleared, so long trips revisit places instead
       of running out. Real two-week trips do go back to the creek. */
    function nextPlace() {
      for (var tries = 0; tries < 2; tries++) {
        while (cursor < candidates.length) {
          var candidate = candidates[cursor++];
          if (!used[candidate.name]) return candidate;
        }
        used = {};
        cursor = 0;
      }
      return null;      /* only reachable if the pool itself is empty */
    }

    var themeOffset = Math.floor(rnd() * THEMES.length);
    var days = [];

    for (var d = 0; d < cfg.days; d++) {
      var stops = [];
      var onThisDay = {};

      while (stops.length < perDayStops) {
        var pick = nextPlace();
        if (!pick) break;

        /* Recycling is acceptable across a fortnight; the same mosque twice
           before lunch is not. */
        if (onThisDay[pick.name]) continue;

        used[pick.name] = true;
        onThisDay[pick.name] = true;

        stops.push({
          time: SLOTS[stops.length % SLOTS.length],
          title: pick.name,
          detail: pick.detail,
          cost: pick.cost === 0 ? 'Free' : aed(pick.cost)
        });
      }

      days.push({
        day: d + 1,
        theme: THEMES[(d + themeOffset) % THEMES.length],
        stops: stops
      });
    }

    /* A summary that names what was actually applied, so the user can tell the
       refinements did something even when the plan looks similar. */
    var applied = [];
    if (lighter) applied.push('a lighter pace with fewer stops per day');
    if (cheaper) applied.push('the cheapest options first');
    if (foodFirst) applied.push('food and dining brought forward');

    var tierName = tierFor(cfg.budget).name;
    var summary = cfg.days + (cfg.days === 1 ? ' day' : ' days') + ' across ' + cfg.destination +
      ' at a ' + tierName.toLowerCase() + ' level, grouped so each day stays in one area' +
      (applied.length ? ', with ' + applied.join(' and ') + '.' : '.');

    var spend = cfg.budget * (cheaper ? 0.58 : 0.82);

    return {
      title: cfg.days + '-day ' + cfg.destination + ' itinerary',
      summary: summary,
      days: days,
      tips: TIPS.slice(),
      estimatedTotal: aed(spend),
      /* Carried through to the badge, the chat line and the PDF so "which one
         wrote this?" is answerable from the plan itself, not just the mode tag
         in the corner. */
      writtenBy: 'Offline planner',
      run: state.offlineRuns
    };
  }

  /* ======================================================================
     5 — the prompt
     ==================================================================== */

  function buildPrompt(cfg, notes) {
    var tier = tierFor(cfg.budget);
    var names = cfg.interests.map(function (k) { return INTEREST_LABELS[k]; });

    var lines = [];
    lines.push('You are an expert United Arab Emirates travel planner writing for a visitor.');
    lines.push('');
    lines.push('TRIP');
    lines.push('- Destination: ' + cfg.destination);
    lines.push('- Duration: ' + cfg.days + (cfg.days === 1 ? ' day' : ' days'));
    lines.push('- Budget per person: ' + aed(cfg.budget) + ' (' + tier.name + ' — ' + tier.note + ')');
    lines.push('- Interests: ' + (names.length ? names.join(', ') : 'general sightseeing'));

    if (notes.length) {
      lines.push('');
      lines.push('TRAVELLER NOTES, most recent last — obey these above all:');
      notes.forEach(function (note, i) { lines.push((i + 1) + '. ' + note); });
    }

    lines.push('');
    lines.push('RULES');
    lines.push('- Group each day geographically to minimise travel. Name real UAE places.');
    lines.push('- Respect UAE realities: summer midday heat, Friday prayer timings, modest dress at mosques, Ramadan hours, and real drive times between emirates.');
    lines.push('- Include Emirati heritage and culture, not only malls and towers.');
    lines.push('- 4 to 6 stops per day. Each stop needs a time window, a one- or two-sentence reason, and a cost in AED ("Free" where it is free).');
    lines.push('- Keep the total within the stated budget.');

    /* From the second attempt onward, say explicitly that the mix must change.
       A model given the same prompt at the same settings answers with much the
       same plan, which made the Regenerate button look like it had done
       nothing at all. Asking for difference is the only thing that reliably
       produces it. */
    if (state.aiAttempts > 1) {
      lines.push('- This traveller has seen a plan for these settings already. Choose a noticeably different mix of stops: different neighbourhoods, different times of day, different kinds of place.');
    }

    lines.push('');
    lines.push('Reply with ONLY valid JSON. No markdown fences, no commentary. Exactly this shape:');
    lines.push('{"title":"","summary":"","days":[{"day":1,"theme":"","stops":[{"time":"09:00 – 11:00","title":"","detail":"","cost":"AED 120"}]}],"tips":[""],"estimatedTotal":"AED 5,400"}');

    return lines.join('\n');
  }

  /* ======================================================================
     6 — the Gemini layer
     ----------------------------------------------------------------------
     Called straight from the browser with the key as a query parameter. There
     is no backend to hide it behind, and the README says so plainly.
     ==================================================================== */

  var API = 'https://generativelanguage.googleapis.com/v1beta';

  /* A preference order, NOT a statement of fact about what exists.
     An earlier version of this file had a list of model IDs hard-coded as if
     they were permanent. Google retired them, every call came back 404, and
     the studio quietly fell back to the offline planner forever — with a valid
     key in the box and no visible error anywhere. Everything below exists to
     make sure that failure mode can never happen again: the list is always
     filtered against what the key can actually call. */
  var PREFERRED = [
    'gemini-3.6-flash',
    'gemini-3.5-flash',
    'gemini-3.5-flash-lite',
    'gemini-3.1-flash-lite',
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
    'gemini-2.5-pro'
  ];

  var NOT_CHAT = /embedding|aqa|imagen|veo|tts|live|vision/i;

  function httpError(res, data) {
    var message = 'HTTP ' + res.status;
    if (data && data.error && data.error.message) message = data.error.message;
    var err = new Error(message);
    err.status = res.status;
    return err;
  }

  async function listModels(key) {
    if (state.modelCache[key]) return state.modelCache[key];

    var res = await fetch(API + '/models?pageSize=200&key=' + encodeURIComponent(key));
    var data = null;
    try { data = await res.json(); } catch (err) { data = null; }

    if (!res.ok) throw httpError(res, data);

    /* No array at all means the shape of the answer is not what we expect —
       a proxy page, a captive portal, a changed API. Throw WITHOUT a status so
       the caller reads it as "could not check" rather than "your key is
       broken", and tries the preference list blind instead of accusing the
       user of a bad key. */
    if (!data || !Array.isArray(data.models)) {
      throw new Error('Model list unavailable');
    }

    var names = data.models
      .filter(function (m) {
        return (m.supportedGenerationMethods || []).indexOf('generateContent') !== -1;
      })
      .map(function (m) { return String(m.name || '').replace(/^models\//, ''); })
      .filter(Boolean);

    state.modelCache[key] = names;
    return names;
  }

  /* Newest first, by the version number in the name — "gemini-3.6-flash"
     should be tried before "gemini-2.5-flash" when we are guessing. */
  function byVersionDesc(a, b) {
    var va = parseFloat((a.match(/(\d+(?:\.\d+)?)/) || [0])[0]) || 0;
    var vb = parseFloat((b.match(/(\d+(?:\.\d+)?)/) || [0])[0]) || 0;
    if (va !== vb) return vb - va;
    return a.localeCompare(b);
  }

  function unique(list) {
    var seen = {};
    return list.filter(function (item) {
      if (!item || seen[item]) return false;
      seen[item] = true;
      return true;
    });
  }

  async function buildChain(key, chosen) {
    var blind = unique([chosen].concat(PREFERRED));
    var available;

    try {
      available = await listModels(key);
    } catch (err) {
      /* 400 or 403 while merely LISTING means the key itself is the problem —
         say so straight away instead of walking seven models and blaming
         whichever one happened to be last. */
      if (err.status === 400 || err.status === 403) throw err;
      /* Anything else — offline, CORS, a blip at Google's end — is not
         evidence about the key. Try the preference list blind. */
      return blind;
    }

    var filtered = blind.filter(function (name) {
      return available.indexOf(name) !== -1;
    });

    if (filtered.length) return filtered;

    /* The key works but not one of the names we prefer still exists. Rather
       than give up, use whatever gemini-* chat models this key does expose. */
    var fallback = available
      .filter(function (name) { return /^gemini-/.test(name) && !NOT_CHAT.test(name); })
      .sort(byVersionDesc);

    return fallback.length ? fallback : blind;
  }

  var RETRYABLE = { 404: true, 429: true, 500: true, 503: true, 504: true };

  async function callModel(key, model, body) {
    var res = await fetch(
      API + '/models/' + encodeURIComponent(model) + ':generateContent?key=' + encodeURIComponent(key),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }
    );

    var data = null;
    try { data = await res.json(); } catch (err) { data = null; }

    if (!res.ok) throw httpError(res, data);

    var parts = data
      && data.candidates
      && data.candidates[0]
      && data.candidates[0].content
      && data.candidates[0].content.parts;

    var text = (parts || []).map(function (p) { return p.text || ''; }).join('').trim();

    if (!text) {
      var blocked = data && data.promptFeedback && data.promptFeedback.blockReason;
      throw new Error(blocked ? ('Response blocked: ' + blocked) : 'Empty response from ' + model);
    }

    return text;
  }

  /* Walks the chain, reporting each hop into the chat so a slow generation is
     never a silent one. */
  async function callWithFallback(key, chain, body, onHop) {
    var firstError = null;

    for (var i = 0; i < chain.length; i++) {
      var model = chain[i];
      try {
        var text = await callModel(key, model, body);
        return { text: text, model: model, fellBack: i > 0, intended: chain[0] };
      } catch (err) {
        /* Keep the FIRST failure, never the last. The first one came from the
           model the user actually chose, so it is the one worth reporting. An
           earlier version reported the last error, which is why a simply
           invalid key used to surface as "gemini-1.5-pro is not found" — the
           name of a model nobody had picked, at the bottom of a chain the user
           never saw. */
        if (!firstError) firstError = err;

        var canRetry = RETRYABLE[err.status] && i < chain.length - 1;
        if (!canRetry) throw firstError;

        if (onHop) onHop(model, chain[i + 1]);
        await sleep(400);
      }
    }

    throw firstError || new Error('No model available');
  }

  /* Models wrap JSON in ``` fences even when told not to, and sometimes add a
     sentence before it. Strip, parse, then try the widest {...} substring. */
  function parseJSON(text) {
    var cleaned = String(text)
      .replace(/^\s*```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/, '')
      .trim();

    try { return JSON.parse(cleaned); } catch (err) { /* fall through */ }

    var first = cleaned.indexOf('{');
    var last = cleaned.lastIndexOf('}');
    if (first !== -1 && last > first) {
      try { return JSON.parse(cleaned.slice(first, last + 1)); } catch (err) { /* fall through */ }
    }

    return null;
  }

  /* ======================================================================
     7 — rendering the plan
     ==================================================================== */

  function readConfig() {
    var interests = Array.prototype.slice
      .call(document.querySelectorAll('input[name="interest"]:checked'))
      .map(function (input) { return input.value; });

    return {
      destination: dom.destination.value,
      days: parseInt(dom.days.value, 10),
      budget: parseInt(dom.budget.value, 10),
      interests: interests
    };
  }

  function summaryGrid(cfg) {
    var tier = tierFor(cfg.budget);
    var grid = el('div', 'summary-grid');

    var cells = [
      ['Destination', cfg.destination],
      ['Duration', cfg.days + (cfg.days === 1 ? ' day' : ' days')],
      ['Budget', aed(cfg.budget) + ' · ' + tier.name],
      ['Interests', cfg.interests.length
        ? cfg.interests.map(function (k) { return INTEREST_LABELS[k]; }).join(', ')
        : 'General sightseeing']
    ];

    cells.forEach(function (pair) {
      var cell = el('div', 'summary-cell');
      cell.appendChild(el('span', 'k', pair[0]));
      cell.appendChild(el('span', 'v', pair[1]));
      grid.appendChild(cell);
    });

    return grid;
  }

  function notice(kind, text) {
    return el('p', 'notice notice-' + kind, text);
  }

  function renderPlan(plan, cfg, banner) {
    var out = dom.itineraryOut;
    clear(out);

    if (banner) out.appendChild(banner);
    out.appendChild(summaryGrid(cfg));
    out.appendChild(el('h3', 'plan-title', plan.title || (cfg.days + '-day ' + cfg.destination + ' itinerary')));

    /* The provenance badge. Both modes produce a plan that LOOKS the same, so
       the plan has to say which engine wrote it, right next to the title. The
       plan number is there for a related reason: it makes "this is a different
       plan from the last one" visible even when two plans share stops. */
    if (plan.writtenBy) {
      var source = el('p', 'plan-source');
      source.setAttribute('data-source', plan.writtenBy === 'Offline planner' ? 'offline' : 'ai');
      source.appendChild(el('span', 'plan-source-dot'));
      source.appendChild(el('span', null, 'Written by ' + plan.writtenBy));
      if (plan.run) source.appendChild(el('span', 'plan-run', 'plan #' + plan.run));
      out.appendChild(source);
    }

    if (plan.summary) out.appendChild(el('p', 'plan-summary', plan.summary));

    var days = Array.isArray(plan.days) ? plan.days : [];

    days.forEach(function (day, index) {
      var block = el('div', 'day');
      var head = el('div', 'day-head');
      head.appendChild(el('span', 'day-num', 'Day ' + (day.day || index + 1)));
      head.appendChild(el('span', 'day-theme', day.theme || 'Exploring'));
      block.appendChild(head);

      /* Accept both shapes a model might reach for. A response that is
         slightly off the requested schema is still a usable plan, and throwing
         it away over a key name would be the wrong trade. */
      var stops = day.stops || day.activities || [];

      stops.forEach(function (stop) {
        var row = el('div', 'stop');
        row.appendChild(el('span', 'stop-time', stop.time || ''));
        row.appendChild(el('span', 'stop-title', stop.title || stop.name || 'Stop'));
        row.appendChild(el('span', 'stop-cost', stop.cost || ''));
        var detail = stop.detail || stop.description || '';
        if (detail) row.appendChild(el('p', 'stop-detail', detail));
        block.appendChild(row);
      });

      out.appendChild(block);
    });

    var tips = Array.isArray(plan.tips) ? plan.tips.filter(Boolean) : [];
    if (tips.length) {
      var tipsBox = el('div', 'tips');
      tipsBox.appendChild(el('h4', null, 'Local tips'));
      var list = el('ul');
      tips.forEach(function (tip) { list.appendChild(el('li', null, tip)); });
      tipsBox.appendChild(list);
      out.appendChild(tipsBox);
    }

    if (plan.estimatedTotal) {
      out.appendChild(el('p', 'total', 'Estimated spend · ' + plan.estimatedTotal + ' of ' + aed(cfg.budget) + ' per person'));
    }

    out.scrollTop = 0;
  }

  /* When the model answers in prose instead of JSON, show the prose. It is
     still useful travel writing, and an error page would throw away a perfectly
     good answer over its formatting. */
  function renderRaw(text, cfg) {
    var out = dom.itineraryOut;
    clear(out);
    out.appendChild(notice('info', 'The model replied in prose rather than the structured format, so it is shown here as written. The PDF and map need the structured version — press Regenerate to try again.'));
    out.appendChild(summaryGrid(cfg));
    out.appendChild(el('pre', 'raw', text));
    out.scrollTop = 0;
  }

  /* ======================================================================
     8 — the map panel
     ==================================================================== */

  function mapSrc(query, zoom) {
    return 'https://www.google.com/maps?q=' + encodeURIComponent(query) +
      '&z=' + zoom + '&output=embed';
  }

  function buildMap(plan, cfg) {
    var list = dom.mapList;
    clear(list);

    var buttons = [];

    function addButton(label, query, zoom) {
      var btn = el('button', 'map-btn', label);
      btn.type = 'button';
      btn.setAttribute('aria-pressed', 'false');
      btn.addEventListener('click', function () {
        buttons.forEach(function (b) { b.setAttribute('aria-pressed', 'false'); });
        btn.setAttribute('aria-pressed', 'true');
        dom.mapFrame.src = mapSrc(query, zoom);
      });
      buttons.push(btn);
      list.appendChild(btn);
      return btn;
    }

    /* Zoom 7 frames the whole federation; zoom 14 is close enough to see the
       streets around a single stop. */
    var overview = addButton('All UAE', 'United Arab Emirates', 7);

    (plan.days || []).forEach(function (day, index) {
      var number = day.day || index + 1;
      var stops = day.stops || day.activities || [];
      stops.forEach(function (stop) {
        var name = stop.title || stop.name;
        if (!name) return;
        addButton('D' + number + ' · ' + name, name + ', United Arab Emirates', 14);
      });
    });

    overview.setAttribute('aria-pressed', 'true');
    dom.mapFrame.src = mapSrc(cfg.destination === 'All UAE' ? 'United Arab Emirates' : cfg.destination + ', United Arab Emirates', cfg.destination === 'All UAE' ? 7 : 10);

    dom.mapEmpty.hidden = true;
    dom.mapGrid.hidden = false;
  }

  /* ======================================================================
     9 — the PDF
     ----------------------------------------------------------------------
     Typeset by hand with jsPDF, so the output is real selectable text rather
     than a screenshot of the page. Rebuilt on every generation and previewed
     in an iframe, so what you see is exactly what downloads.
     ==================================================================== */

  var NAVY = [22, 24, 38];
  var PURPLE = [145, 132, 217];
  var GREY = [120, 122, 140];
  var INK = [32, 33, 44];

  function buildPDF(plan, cfg) {
    if (!window.jspdf || !window.jspdf.jsPDF) return null;

    var doc = new window.jspdf.jsPDF({ unit: 'pt', format: 'a4' });
    var pageW = doc.internal.pageSize.getWidth();
    var pageH = doc.internal.pageSize.getHeight();
    var margin = 46;
    var width = pageW - margin * 2;
    var y = 0;

    /* Page-break awareness: ask for the room a block needs before drawing it,
       so a day heading never lands alone at the bottom of a page. */
    function need(height) {
      if (y + height <= pageH - 56) return;
      doc.addPage();
      y = margin + 18;
    }

    /* --- Header band --- */
    doc.setFillColor(NAVY[0], NAVY[1], NAVY[2]);
    doc.rect(0, 0, pageW, 116, 'F');

    doc.setTextColor(233, 233, 237);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(19);
    doc.text('AI_tour_guide.ae', margin, 44);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(169, 171, 189);
    doc.text('Smart UAE AI Tourism Assistant · Created by Ashwanth Vijay, Grade 9-AI', margin, 62);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(PURPLE[0], PURPLE[1], PURPLE[2]);
    doc.text(doc.splitTextToSize(plan.title || 'UAE itinerary', width)[0], margin, 94);

    y = 116 + 28;

    /* --- Metadata line --- */
    var tier = tierFor(cfg.budget);
    var meta = cfg.destination +
      '  ·  ' + cfg.days + (cfg.days === 1 ? ' day' : ' days') +
      '  ·  ' + aed(cfg.budget) + ' (' + tier.name + ')' +
      '  ·  ' + (cfg.interests.length
        ? cfg.interests.map(function (k) { return INTEREST_LABELS[k]; }).join(', ')
        : 'General sightseeing');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(GREY[0], GREY[1], GREY[2]);
    doc.splitTextToSize(meta, width).forEach(function (line) {
      doc.text(line, margin, y);
      y += 13;
    });

    /* The printed document carries its own provenance too — a PDF forwarded to
       somebody else should not be ambiguous about what produced it. */
    if (plan.writtenBy) {
      doc.text('Written by: ' + plan.writtenBy + (plan.run ? '  ·  plan #' + plan.run : ''), margin, y);
      y += 13;
    }

    /* --- Summary --- */
    if (plan.summary) {
      y += 8;
      doc.setFontSize(10.5);
      doc.setTextColor(INK[0], INK[1], INK[2]);
      doc.splitTextToSize(plan.summary, width).forEach(function (line) {
        need(16);
        doc.text(line, margin, y);
        y += 15;
      });
    }

    /* --- Days --- */
    (plan.days || []).forEach(function (day, index) {
      y += 16;
      need(58);

      doc.setDrawColor(PURPLE[0], PURPLE[1], PURPLE[2]);
      doc.setLineWidth(1.2);
      doc.line(margin, y, pageW - margin, y);
      y += 18;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11.5);
      doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
      doc.text('DAY ' + (day.day || index + 1) + '  ·  ' + (day.theme || 'Exploring'), margin, y);
      y += 18;

      var stops = day.stops || day.activities || [];

      stops.forEach(function (stop) {
        need(34);

        var title = stop.title || stop.name || 'Stop';
        var cost = stop.cost ? '   [' + stop.cost + ']' : '';

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(INK[0], INK[1], INK[2]);
        doc.text((stop.time ? stop.time + '   ' : '') + title + cost, margin, y);
        y += 14;

        var detail = stop.detail || stop.description || '';
        if (detail) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(9);
          doc.setTextColor(GREY[0], GREY[1], GREY[2]);
          doc.splitTextToSize(detail, width - 16).forEach(function (line) {
            need(13);
            doc.text(line, margin + 16, y);
            y += 12;
          });
        }
        y += 5;
      });
    });

    /* --- Tips --- */
    var tips = Array.isArray(plan.tips) ? plan.tips.filter(Boolean) : [];
    if (tips.length) {
      y += 18;
      need(40);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
      doc.text('LOCAL TIPS', margin, y);
      y += 16;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(GREY[0], GREY[1], GREY[2]);

      tips.forEach(function (tip) {
        doc.splitTextToSize('•  ' + tip, width - 8).forEach(function (line, i) {
          need(13);
          doc.text(line, margin + (i ? 10 : 0), y);
          y += 12;
        });
        y += 4;
      });
    }

    /* --- Total --- */
    if (plan.estimatedTotal) {
      y += 12;
      need(30);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10.5);
      doc.setTextColor(PURPLE[0], PURPLE[1], PURPLE[2]);
      doc.text('Estimated spend · ' + plan.estimatedTotal + ' of ' + aed(cfg.budget) + ' per person', margin, y);
    }

    /* --- Footer on every page --- */
    var pages = doc.internal.getNumberOfPages();
    for (var p = 1; p <= pages; p++) {
      doc.setPage(p);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(160, 162, 178);
      doc.text('Generated by AI_tour_guide.ae — Smart UAE AI Tourism Assistant', margin, pageH - 26);
      doc.text(p + ' / ' + pages, pageW - margin, pageH - 26, { align: 'right' });
    }

    return doc;
  }

  function showPDF(plan, cfg) {
    var doc = buildPDF(plan, cfg);

    if (!doc) {
      dom.pdfEmpty.textContent = 'The PDF library did not load, so the document cannot be built. Everything else still works — reconnect and reload to get the PDF back.';
      dom.pdfEmpty.hidden = false;
      dom.pdfFrame.hidden = true;
      dom.downloadBtn.disabled = true;
      return;
    }

    state.pdfDoc = doc;

    /* Revoke the previous object URL before replacing it. Without this, every
       regeneration leaks a whole PDF into memory for the life of the tab. */
    if (state.pdfUrl) URL.revokeObjectURL(state.pdfUrl);
    state.pdfUrl = URL.createObjectURL(doc.output('blob'));

    /* #view=FitH so the preview opens at page width — the user should be
       looking at the same document that is about to download, not a zoomed
       corner of it. */
    dom.pdfFrame.src = state.pdfUrl + '#view=FitH';
    dom.pdfFrame.hidden = false;
    dom.pdfEmpty.hidden = true;
    dom.downloadBtn.disabled = false;
  }

  function downloadPDF() {
    if (!state.plan) return;

    /* Rebuild rather than trusting the stored doc: the settings may have been
       changed since the preview was made, and a download that does not match
       the plan on screen is worse than no download. */
    var doc = state.pdfDoc || buildPDF(state.plan, state.planConfig);

    if (!doc) {
      window.alert('The PDF library (jsPDF) did not load, so the document cannot be built. Check your connection and reload — the rest of the studio works without it.');
      return;
    }

    var slug = String(state.planConfig.destination).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    doc.save('AI_tour_guide-ae-' + slug + '-' + state.planConfig.days + '-day-itinerary.pdf');
  }

  /* ======================================================================
     10 — chat: bubbles, thinking dots, typing animation
     ==================================================================== */

  function chatScrolledToBottom() {
    var log = dom.chatLog;
    return log.scrollHeight - log.scrollTop - log.clientHeight < 90;
  }

  function pushMessage(kind, text) {
    if (dom.chatEmpty && dom.chatEmpty.parentNode) dom.chatEmpty.remove();
    var node = el('div', 'msg ' + kind, text);
    dom.chatLog.appendChild(node);
    dom.chatLog.scrollTop = dom.chatLog.scrollHeight;
    return node;
  }

  function showThinking() {
    if (dom.chatEmpty && dom.chatEmpty.parentNode) dom.chatEmpty.remove();
    var bubble = el('div', 'typing');
    /* Three animated dots are silence to a screen reader. Give it words. */
    bubble.setAttribute('aria-label', 'Assistant is typing');
    bubble.setAttribute('role', 'status');
    bubble.appendChild(el('i'));
    bubble.appendChild(el('i'));
    bubble.appendChild(el('i'));
    dom.chatLog.appendChild(bubble);
    dom.chatLog.scrollTop = dom.chatLog.scrollHeight;
    return bubble;
  }

  /* Reveals text a few characters per animation frame.

     requestAnimationFrame, not setInterval: rAF stays in step with the display
     and stops entirely in a background tab, so switching away mid-generation
     does not leave a timer firing into a hidden page.

     The speed scales with length against a ~1,400 ms budget, clamped to 1–9
     characters per frame — a two-line reply should feel typed, and a
     twelve-line one should not outstay its welcome.

     Auto-scroll only happens if the user is ALREADY near the bottom. Typing
     that yanks the view back while somebody is reading an earlier message is
     the fastest way to make a chat feel hostile. */
  function typeOut(node, text, token) {
    return new Promise(function (resolve) {
      if (reduced()) {
        node.textContent = text;
        if (chatScrolledToBottom()) dom.chatLog.scrollTop = dom.chatLog.scrollHeight;
        resolve();
        return;
      }

      var frames = Math.max(1, 1400 / 16.7);
      var cpf = Math.min(9, Math.max(1, Math.ceil(text.length / frames)));
      var shown = 0;

      (function step() {
        /* A second Generate cancels the first, so two messages can never be
           typing themselves into the log at the same time. */
        if (token.cancelled) {
          node.textContent = text;
          resolve();
          return;
        }

        var stick = chatScrolledToBottom();
        shown += cpf;
        node.textContent = text.slice(0, shown);
        if (stick) dom.chatLog.scrollTop = dom.chatLog.scrollHeight;

        if (shown < text.length) window.requestAnimationFrame(step);
        else resolve();
      }());
    });
  }

  function say(text) {
    if (state.typeToken) state.typeToken.cancelled = true;
    var token = { cancelled: false };
    state.typeToken = token;
    var node = pushMessage('ai', '');
    return typeOut(node, text, token);
  }

  /* ======================================================================
     11 — the generating veil
     ==================================================================== */

  var VEIL_CAPTIONS = [
    'Reading your trip settings…',
    'Choosing stops and grouping them by area…',
    'Checking times, costs and travel between them…',
    'Writing the day-by-day plan…',
    'Laying out the document…'
  ];

  var veilTimer = null;
  var veilCaps = [];

  function buildVeil() {
    var veil = el('div', 'veil');
    /* aria-hidden: the chat already narrates progress in words, and a screen
       reader does not need a description of a shimmering rectangle. */
    veil.setAttribute('aria-hidden', 'true');
    veil.appendChild(el('div', 'skel skel-h'));
    veil.appendChild(el('div', 'skel skel-p'));
    veil.appendChild(el('div', 'skel skel-block'));
    veil.appendChild(el('div', 'skel skel-block'));
    var caption = el('p', 'veil-cap', VEIL_CAPTIONS[0]);
    veil.appendChild(caption);
    veilCaps.push(caption);
    return veil;
  }

  function setBusyPanels(on) {
    /* Veil BOTH the itinerary and the PDF panel, not just the visible one.
       They are separate scroll boxes and the user can switch tabs mid-run;
       veiling both means the PDF tab is never caught showing the PREVIOUS
       trip's document as though it were the one being generated. */
    [dom.panelItinerary, dom.panelPdf].forEach(function (panel) {
      panel.classList.toggle('is-busy', on);
    });

    if (veilTimer) { window.clearInterval(veilTimer); veilTimer = null; }

    if (!on) return;

    var i = 0;
    veilCaps.forEach(function (cap) { cap.textContent = VEIL_CAPTIONS[0]; });

    /* A caption that changes every 1.6s is the difference between a slow
       generation and one that looks frozen. */
    veilTimer = window.setInterval(function () {
      i = (i + 1) % VEIL_CAPTIONS.length;
      veilCaps.forEach(function (cap) { cap.textContent = VEIL_CAPTIONS[i]; });
    }, 1600);
  }

  /* ======================================================================
     12 — the generation flow
     ==================================================================== */

  function apiKey() {
    return dom.apiKey.value.trim();
  }

  function setMode() {
    var live = apiKey().length > 0;
    dom.modeTag.textContent = live ? 'Gemini live' : 'Demo mode';
    dom.modeTag.setAttribute('data-mode', live ? 'live' : 'demo');
  }

  function setGenerating(on, label) {
    dom.generateBtn.disabled = on;
    dom.sendBtn.disabled = on || !state.plan;
    dom.chatInput.disabled = on || !state.plan;
    dom.resetBtn.disabled = on;

    clear(dom.generateBtn);

    if (on) {
      dom.generateBtn.appendChild(el('span', 'spinner'));
      dom.generateBtn.appendChild(el('span', null, label));
    } else {
      dom.generateBtn.textContent = state.plan ? 'Regenerate itinerary' : 'Generate itinerary';
    }
  }

  function unlockChat() {
    dom.chatInput.disabled = false;
    dom.sendBtn.disabled = false;
    dom.chatInput.placeholder = 'Refine the plan — ‘make day 3 cheaper’…';
    Array.prototype.forEach.call(
      dom.suggestions.querySelectorAll('.suggestion'),
      function (btn) { btn.disabled = false; }
    );
  }

  function describeSettings(cfg) {
    var names = cfg.interests.map(function (k) { return INTEREST_LABELS[k].toLowerCase(); });
    return cfg.days + (cfg.days === 1 ? ' day' : ' days') + ' in ' + cfg.destination +
      ', ' + (names.length ? names.join(', ') : 'general sightseeing') +
      ', ' + aed(cfg.budget) + ' per person.';
  }

  function finishWithPlan(plan, cfg, banner) {
    state.plan = plan;
    state.planConfig = cfg;
    dom.itineraryEmpty.hidden = true;
    renderPlan(plan, cfg, banner);
    showPDF(plan, cfg);
    buildMap(plan, cfg);
    unlockChat();
  }

  async function generate(userMessage) {
    if (state.busy) return;
    state.busy = true;

    var cfg = readConfig();
    var key = apiKey();
    var model = dom.modelSelect.value;

    var message = userMessage || describeSettings(cfg);
    pushMessage('me', message);
    if (userMessage) state.refinements.push(userMessage);

    setGenerating(true, key ? 'Thinking' : 'Planning');
    pushMessage('sys', key ? 'Asking ' + model + '…' : 'Building with the offline planner…');
    var thinking = showThinking();
    setBusyPanels(true);

    function done() {
      thinking.remove();
      setBusyPanels(false);
      setGenerating(false);
      state.busy = false;
    }

    /* ---------------------------------------------------------- demo path */
    if (!key) {
      /* A deliberate pause. An offline planner returns in about two
         milliseconds, and an answer that instant reads as canned — which is
         unfair to a planner that genuinely does rebuild the plan each time. */
      await sleep(700);
      var plan = offlinePlan(cfg, state.refinements);
      /* finishWithPlan first, then done(): done() re-labels the button and
         re-enables the composer from state.plan, so it has to run after the
         plan actually exists or the button keeps saying "Generate". */
      finishWithPlan(plan, cfg, notice('info', 'This plan was built by the offline planner, not by an AI model. Add a Gemini API key in “Model & API key” to have a model write it instead.'));
      done();
      await say('Offline planner — this is plan #' + plan.run + ' for ' + cfg.destination +
        ', ' + cfg.days + (cfg.days === 1 ? ' day' : ' days') + '. No AI model was involved: check the badge under the title, or the tag in the top-right corner.\n\n' +
        'It picks a different mix of stops each time and reacts to obvious words like “cheaper”, “toddler” or “food”, but it does not truly understand your notes. With only a few interests ticked it will reuse many of the same landmarks — there are only so many desert stops in the country. Add a Gemini API key and a model will write it properly instead.');
      return;
    }

    /* ------------------------------------------------------------ AI path */
    state.aiAttempts += 1;

    var body = {
      contents: [{ role: 'user', parts: [{ text: buildPrompt(cfg, state.refinements) }] }],
      generationConfig: {
        temperature: 0.9,
        responseMimeType: 'application/json'
      }
    };

    try {
      var chain = await buildChain(key, model);

      var result = await callWithFallback(key, chain, body, function (from, to) {
        pushMessage('sys', from + ' is busy — falling back to ' + to + '…');
      });

      var parsed = parseJSON(result.text);

      if (parsed && Array.isArray(parsed.days) && parsed.days.length) {
        /* Stamp the model that actually answered — which is not necessarily
           the one selected in the panel, if the chain fell back. */
        parsed.writtenBy = result.model;
        parsed.run = state.aiAttempts;
        finishWithPlan(parsed, cfg, null);
        done();
        await say('Here is your ' + cfg.days + (cfg.days === 1 ? '-day' : '-day') + ' ' + cfg.destination +
          ' plan' + (result.fellBack ? ' (answered by ' + result.model + ' — ' + result.intended + ' was unavailable)' : '') +
          '. Tell me what to change — a cheaper day, more food, a slower pace — and I will rewrite it.');
      } else {
        /* Prose instead of JSON. Show it rather than lose it. */
        done();
        state.plan = null;
        dom.itineraryEmpty.hidden = true;
        dom.downloadBtn.disabled = true;
        renderRaw(result.text, cfg);
        unlockChat();
        await say(result.model + ' answered in prose rather than the structured format, so it is shown as written. Press Regenerate and it usually returns proper JSON.');
      }
    } catch (err) {
      /* Total failure. Show the offline plan anyway — being stuck with nothing
         is a worse outcome than being told honestly what happened and given a
         working plan meanwhile. */
      var fallbackPlan = offlinePlan(cfg, state.refinements);
      finishWithPlan(fallbackPlan, cfg, notice('error', 'The AI request failed: ' + err.message + ' — the offline planner wrote this plan instead.'));
      done();
      await say('That did not work: ' + err.message +
        '. I have shown an offline plan so you are not stuck. Open “Model & API key” and press Test key — it makes one real request and tells you exactly what is wrong.');
    }
  }

  /* ======================================================================
     13 — controls, tabs and the key panel
     ==================================================================== */

  function paintRange(input) {
    var min = parseFloat(input.min);
    var max = parseFloat(input.max);
    var value = parseFloat(input.value);
    var pct = ((value - min) / (max - min)) * 100;
    input.style.setProperty('--fill', pct + '%');
  }

  function syncDays() {
    var n = parseInt(dom.days.value, 10);
    dom.daysLabel.textContent = n + (n === 1 ? ' day' : ' days');
    paintRange(dom.days);
  }

  function syncBudget() {
    var value = parseInt(dom.budget.value, 10);
    var tier = tierFor(value);
    dom.budgetLabel.textContent = aed(value) + ' · ' + tier.name;
    dom.budgetDesc.textContent = tier.note;
    paintRange(dom.budget);
  }

  function selectTab(name) {
    ['itinerary', 'pdf', 'map'].forEach(function (key) {
      var tab = $('tab-' + key);
      var panel = $('panel-' + key);
      var on = key === name;
      tab.setAttribute('aria-selected', on ? 'true' : 'false');
      tab.tabIndex = on ? 0 : -1;
      panel.hidden = !on;
    });
  }

  /* --- The Test key button — the honesty feature ---------------------------
     Both modes produce something that LOOKS like an itinerary, so "is the AI
     actually running?" cannot be answered by looking at the output. This
     button answers it directly: it clears the model cache, lists what the key
     can call, and then makes ONE real generateContent request.

     It deliberately does NOT fall back to the offline planner the way
     generate() does. A failure here is the entire point and must be visible. */
  async function testKey() {
    var key = apiKey();
    var chosen = dom.modelSelect.value;

    function report(text, ok) {
      dom.keyStatus.textContent = text;
      dom.keyStatus.setAttribute('data-state', ok);
    }

    if (!key) {
      report('No key saved. The studio is running the offline planner — which is why every plan looks broadly similar and why it cannot really understand your chat notes.', 'bad');
      return;
    }

    dom.testKeyBtn.disabled = true;
    report('Testing…', '');

    /* Drop the cache first: a test that reports what was true five minutes ago
       is not a test. */
    delete state.modelCache[key];

    try {
      var available = await listModels(key);
      var chain = await buildChain(key, chosen);
      var started = Date.now();

      /* JSON mode OFF for this one call. "OK" is not valid JSON, so a healthy
         key asked for "OK" in JSON mode would look like a failure. */
      var result = await callWithFallback(key, chain, {
        contents: [{ role: 'user', parts: [{ text: 'Reply with exactly: OK' }] }],
        generationConfig: { temperature: 0 }
      }, null);

      var ms = Date.now() - started;
      var lines = [];

      lines.push('Key works. ' + result.model + ' replied “' + result.text.slice(0, 40) + '” in ' + ms + ' ms.');
      lines.push('This key can call ' + available.length + ' model' + (available.length === 1 ? '' : 's') + '.');

      if (available.indexOf(chosen) === -1) {
        lines.push('Note: ' + chosen + ' is NOT among them, so the studio will use ' + chain[0] + ' instead.');
      }

      report(lines.join('\n'), 'ok');
    } catch (err) {
      var hint = '';
      if (err.status === 400 || err.status === 403) hint = '\nThat status means the key itself is the problem — check it was copied whole, and that the Generative Language API is enabled for it.';
      else if (err.status === 429) hint = '\nThat is a rate limit — wait a minute and test again.';
      else if (!err.status) hint = '\nNo HTTP status came back, which usually means no connection, or the request was blocked before it left the browser.';

      report('Test failed: ' + err.message + hint, 'bad');
    } finally {
      dom.testKeyBtn.disabled = false;
    }
  }

  function resetAll() {
    state.plan = null;
    state.planConfig = null;
    state.refinements = [];
    state.offlineRuns = 0;
    state.aiAttempts = 0;
    /* Reset means reset: the persisted seed goes too, so "Reset trip & chat"
       genuinely returns the studio to a first-run state. */
    drop(KEYS.runs);
    if (state.typeToken) state.typeToken.cancelled = true;

    clear(dom.chatLog);
    dom.chatLog.appendChild(dom.chatEmpty);
    dom.chatEmpty.hidden = false;

    dom.chatInput.value = '';
    dom.chatInput.disabled = true;
    dom.chatInput.placeholder = 'Generate first, then refine here…';
    dom.sendBtn.disabled = true;
    Array.prototype.forEach.call(
      dom.suggestions.querySelectorAll('.suggestion'),
      function (btn) { btn.disabled = true; }
    );

    clear(dom.itineraryOut);
    dom.itineraryOut.appendChild(dom.itineraryEmpty);
    dom.itineraryEmpty.hidden = false;

    if (state.pdfUrl) { URL.revokeObjectURL(state.pdfUrl); state.pdfUrl = null; }
    state.pdfDoc = null;
    dom.pdfFrame.removeAttribute('src');
    dom.pdfFrame.hidden = true;
    dom.pdfEmpty.hidden = false;
    dom.downloadBtn.disabled = true;

    clear(dom.mapList);
    dom.mapFrame.removeAttribute('src');
    dom.mapGrid.hidden = true;
    dom.mapEmpty.hidden = false;

    dom.generateBtn.textContent = 'Generate itinerary';
    selectTab('itinerary');
  }

  /* ======================================================================
     14 — the floating notes window
     ==================================================================== */

  function initNotes() {
    var notes = dom.notes;
    var bar = dom.notesBar;
    var saveTimer = null;

    /* --- restore ---------------------------------------------------------
       The saved position is validated against the CURRENT viewport before it
       is applied. A note dragged to x: 1600 on a desktop monitor and reloaded
       on a laptop would otherwise come back completely off-screen, with no way
       to reach it. */
    var stored = load(KEYS.notesPos, null);
    if (stored) {
      try {
        var pos = JSON.parse(stored);
        var maxX = window.innerWidth - notes.offsetWidth;
        var maxY = window.innerHeight - 40;
        if (typeof pos.x === 'number' && typeof pos.y === 'number' &&
            pos.x >= 0 && pos.y >= 0 && pos.x <= maxX && pos.y <= maxY) {
          notes.style.left = pos.x + 'px';
          notes.style.top = pos.y + 'px';
          notes.style.right = 'auto';
          notes.style.bottom = 'auto';
        }
      } catch (err) { /* corrupt value: just leave it in the default corner */ }
    }

    dom.notesText.value = load(KEYS.notesText, '');

    if (load(KEYS.notesHidden, '0') === '1') {
      notes.hidden = true;
      dom.notesFab.hidden = false;
    }

    /* --- auto-save -------------------------------------------------------- */
    dom.notesText.addEventListener('input', function () {
      dom.notesStatus.textContent = 'Saving…';
      window.clearTimeout(saveTimer);
      /* 450ms debounce: writing to localStorage on every keystroke is wasted
         work, and the status line flickering on every letter looks broken. */
      saveTimer = window.setTimeout(function () {
        save(KEYS.notesText, dom.notesText.value);
        dom.notesStatus.textContent = 'Saved locally · drag the bar to move';
      }, 450);
    });

    /* --- drag ------------------------------------------------------------
       Pointer events with setPointerCapture, so one code path covers mouse,
       touch and pen, and the drag keeps working when the cursor leaves the
       bar — which it will, because people drag fast. */
    var dragging = false;
    var offsetX = 0;
    var offsetY = 0;

    bar.addEventListener('pointerdown', function (event) {
      if (event.target.closest('.notes-btn')) return;
      dragging = true;
      var rect = notes.getBoundingClientRect();
      offsetX = event.clientX - rect.left;
      offsetY = event.clientY - rect.top;
      bar.setPointerCapture(event.pointerId);
      event.preventDefault();
    });

    bar.addEventListener('pointermove', function (event) {
      if (!dragging) return;

      var maxX = window.innerWidth - notes.offsetWidth;
      var maxY = window.innerHeight - notes.offsetHeight;
      var x = Math.min(Math.max(0, event.clientX - offsetX), Math.max(0, maxX));
      var y = Math.min(Math.max(0, event.clientY - offsetY), Math.max(0, maxY));

      notes.style.left = x + 'px';
      notes.style.top = y + 'px';
      notes.style.right = 'auto';
      notes.style.bottom = 'auto';
    });

    function endDrag(event) {
      if (!dragging) return;
      dragging = false;
      try { bar.releasePointerCapture(event.pointerId); } catch (err) { /* already gone */ }
      var rect = notes.getBoundingClientRect();
      save(KEYS.notesPos, JSON.stringify({ x: Math.round(rect.left), y: Math.round(rect.top) }));
    }

    bar.addEventListener('pointerup', endDrag);
    bar.addEventListener('pointercancel', endDrag);

    /* --- minimise / close / restore -------------------------------------- */
    dom.notesMin.addEventListener('click', function () {
      var min = notes.classList.toggle('is-min');
      dom.notesMin.setAttribute('aria-expanded', min ? 'false' : 'true');
      dom.notesMin.textContent = min ? '+' : '–';
    });

    dom.notesClose.addEventListener('click', function () {
      notes.hidden = true;
      dom.notesFab.hidden = false;
      save(KEYS.notesHidden, '1');
    });

    dom.notesFab.addEventListener('click', function () {
      notes.hidden = false;
      dom.notesFab.hidden = true;
      save(KEYS.notesHidden, '0');
      dom.notesText.focus();
    });
  }

  /* ======================================================================
     15 — boot
     ==================================================================== */

  function init() {
    dom = {
      modeTag: $('modeTag'),
      setupForm: $('setupForm'),
      destination: $('destination'),
      days: $('days'),
      daysLabel: $('daysLabel'),
      budget: $('budget'),
      budgetLabel: $('budgetLabel'),
      budgetDesc: $('budgetDesc'),
      generateBtn: $('generateBtn'),
      resetBtn: $('resetBtn'),
      modelSelect: $('modelSelect'),
      apiKey: $('apiKey'),
      toggleKeyBtn: $('toggleKeyBtn'),
      testKeyBtn: $('testKeyBtn'),
      keyStatus: $('keyStatus'),

      chatLog: $('chatLog'),
      chatEmpty: $('chatEmpty'),
      suggestions: $('suggestions'),
      chatForm: $('chatForm'),
      chatInput: $('chatInput'),
      sendBtn: $('sendBtn'),
      clearChatBtn: $('clearChatBtn'),

      downloadBtn: $('downloadBtn'),
      panelItinerary: $('panel-itinerary'),
      panelPdf: $('panel-pdf'),
      itineraryOut: $('itineraryOut'),
      itineraryEmpty: $('itineraryEmpty'),
      pdfFrame: $('pdfFrame'),
      pdfEmpty: $('pdfEmpty'),
      mapFrame: $('mapFrame'),
      mapGrid: $('mapGrid'),
      mapList: $('mapList'),
      mapEmpty: $('mapEmpty'),

      notes: $('notes'),
      notesBar: $('notesBar'),
      notesText: $('notesText'),
      notesMin: $('notesMin'),
      notesClose: $('notesClose'),
      notesStatus: $('notesStatus'),
      notesFab: $('notesFab')
    };

    /* The veil markup is built once per panel and then only toggled by class.
       Rebuilding it on every generation would mean re-running the CSS
       animations from zero each time, which stutters. */
    dom.panelItinerary.appendChild(buildVeil());
    dom.panelPdf.appendChild(buildVeil());

    /* --- sliders --- */
    dom.days.addEventListener('input', syncDays);
    dom.budget.addEventListener('input', syncBudget);
    syncDays();
    syncBudget();

    /* --- generate / reset --- */
    dom.setupForm.addEventListener('submit', function (event) {
      event.preventDefault();
      generate(null);
    });

    dom.resetBtn.addEventListener('click', resetAll);

    /* --- chat --- */
    dom.chatForm.addEventListener('submit', function (event) {
      event.preventDefault();
      var text = dom.chatInput.value.trim();
      if (!text || state.busy) return;
      dom.chatInput.value = '';
      generate(text);
    });

    Array.prototype.forEach.call(
      dom.suggestions.querySelectorAll('.suggestion'),
      function (btn) {
        btn.addEventListener('click', function () {
          if (btn.disabled || state.busy) return;
          generate(btn.textContent.trim());
        });
      }
    );

    dom.clearChatBtn.addEventListener('click', function () {
      if (state.typeToken) state.typeToken.cancelled = true;
      state.refinements = [];
      clear(dom.chatLog);
      dom.chatLog.appendChild(dom.chatEmpty);
      dom.chatEmpty.hidden = false;
    });

    /* --- tabs --- */
    ['itinerary', 'pdf', 'map'].forEach(function (name) {
      $('tab-' + name).addEventListener('click', function () { selectTab(name); });
    });

    dom.downloadBtn.addEventListener('click', downloadPDF);

    /* --- key panel --- */
    dom.apiKey.value = load(KEYS.key, '');

    dom.apiKey.addEventListener('input', function () {
      var value = apiKey();
      if (value) save(KEYS.key, value);
      else drop(KEYS.key);
      setMode();
    });

    dom.toggleKeyBtn.addEventListener('click', function () {
      var shown = dom.apiKey.type === 'text';
      dom.apiKey.type = shown ? 'password' : 'text';
      dom.toggleKeyBtn.textContent = shown ? 'Show' : 'Hide';
      dom.toggleKeyBtn.setAttribute('aria-pressed', shown ? 'false' : 'true');
    });

    dom.testKeyBtn.addEventListener('click', testKey);

    /* Pick the offline seed up where the last session left it, so a reload
       does not rewind the planner to its very first plan. */
    state.offlineRuns = parseInt(load(KEYS.runs, '0'), 10) || 0;

    setMode();
    if (apiKey()) {
      dom.keyStatus.textContent = 'Key loaded from this browser. Press Test key to prove it works.';
    }

    initNotes();
  }

  init();
}());
