<img width="1919" height="521" alt="image" src="https://github.com/user-attachments/assets/4c0c525a-2016-4ca6-9999-460d202cc3f8" />



# AI_tour_guide.ae


### Smart UAE AI Tourism Assistant

<img width="1919" height="971" alt="image" src="https://github.com/user-attachments/assets/f35243b0-0d08-4fc8-842e-bfde7a85540e" />


A Grade 9 Artificial Intelligence school project by **Ashwanth Vijay**, built around
**UAE Vision 2071**.

Answer four questions. Ten seconds later you have a full day-by-day United Arab
Emirates itinerary — every stop with a time window, a reason and a price in dirhams —
that you can argue with in plain English, see on a map, and download as a PDF.

```
Where are you going?      Dubai · Abu Dhabi · Sharjah · Ras Al Khaimah · Fujairah · All UAE
How many days?            1 – 14
What is your budget?      AED 500 – 30,000 per person
What do you like?         Culture · Desert · Shopping · Family · Food · Beaches · Architecture · Nature
```

---

## Three things that make it useful

1. **It writes the plan, it does not look it up.** There is no database of pre-made
   tours. Every itinerary is composed on request, so two travellers never get the same
   document.
2. **You can talk to it.** "Make day 3 cheaper." "We have a toddler." The plan is rebuilt
   around your notes instead of making you fill the form in again.
3. **It works with no internet and no API key.** A built-in offline planner always
   produces a real itinerary. A demo that depends on working WiFi is a demo that fails
   in front of the class.

---

## How to run it

There is nothing to install. No Node, no npm, no build step, no server.

1. Download the ZIP (green **Code** button → *Download ZIP*).
2. Unzip it anywhere.
3. Double-click **`index.html`**.

That is the whole setup. It opens from a `file://` URL in any modern browser.

> Two files come from the internet when you have a connection: the **Inter** font and
> **jsPDF** (for the PDF). Offline, the page falls back to a system font and only the PDF
> tab stops working — planning, chat and the map carry on.

---

## Demo mode vs AI mode

The studio runs in one of two modes, and the tag in the top-right corner always says
which.

| | **Demo mode** | **AI mode** |
|---|---|---|
| **Tag reads** | `Demo mode` (grey) | `Gemini live` (purple) |
| **Needs** | Nothing | A free Gemini API key |
| **Who writes the plan** | The built-in offline planner | Google Gemini |
| **Internet** | Not required | Required |
| **Understands your chat** | Only keywords — "cheaper", "toddler", "food" | Yes, properly |
| **Varies between runs** | Yes, via a seeded shuffle | Yes |
| **PDF, map, notes** | All work | All work |
| **Cost** | Free | Free tier, then Google's pricing |

Both modes produce something that *looks* like an itinerary. That is exactly why the
**Test key** button exists — see below.

---

## Getting a free Gemini API key
<img width="1300" height="731" alt="image" src="https://github.com/user-attachments/assets/7f05f17a-8189-4473-ac5f-4d6661bfdba8" />


You do not need a key to use the app. If you want a real model writing the plans:

**[Watch the video walkthrough](https://youtu.be/JdKcFCLotZY?si=YtJM6uWIsKA7dDxw)**, or
follow the five steps below.

1. Go to **[Google AI Studio](https://aistudio.google.com/app/apikey)** and sign in with a
   Google account.
2. Click **Create API key**.
3. Pick a project (or let it make one) and confirm.
4. Copy the key — it is a long string starting with `AIza…`.
5. In the studio, open **Model & API key**, paste it into the box, and press **Test key**.

**Treat the key like a password.** Anyone who has it can spend against your Google
account. Do not paste it into a chat, do not put it in a screenshot, and never commit it
to a repository.

---

## The Test key button, and why it exists

Demo mode and AI mode both produce a polished-looking itinerary. So "is the AI actually
running?" is a question you genuinely **cannot** answer by looking at the output — which
makes it exactly the sort of thing a school project should be able to prove.

The button answers it directly. It:

- clears the cached model list, so the answer is about now and not five minutes ago;
- asks Google which models your key can actually call;
- makes **one real request**, asking the model to reply with exactly `OK`;
- reports which model answered, what it said, the round-trip in milliseconds, and how
  many models your key can use;
- says so explicitly if the model you picked is not one of them.

With no key it tells you plainly: the studio is running the offline planner, which is why
every plan looks broadly similar.

Unlike the Generate button, **Test key does not fall back to the offline planner.** If it
fails, it shows you the failure. That is the entire point of it.

> Detail worth knowing: this one call turns **JSON mode off**. "OK" is not valid JSON, so a
> perfectly healthy key asked for "OK" in JSON mode would look like a failure.

---

## Which one wrote this plan — the offline planner or Gemini?

Three places answer this, and they never disagree:

1. **The badge under the plan title.** Grey dot, *"Written by Offline planner"* — or a
   purple dot and the model's actual name, *"Written by gemini-3.6-flash"*. It also
   carries a plan number, so you can see at a glance that pressing Regenerate produced a
   genuinely new plan.
2. **The mode tag in the top-right corner** — `Demo mode` or `Gemini live`. It updates
   live as you type a key.
3. **The Test key button**, which makes one real request and reports back.

The PDF carries the same `Written by:` line, so a document you forward to somebody else
is not ambiguous either.

## Am I getting the same plan every time?

If there is no API key, you are using the offline planner, and it used to repeat itself
far more than it should have. Two separate causes, both now fixed:

- **The seed reset on every page load.** The planner varies its output using a counter
  that feeds a seeded shuffle, but that counter started at zero again on each reload — so
  the first plan after a reload was *byte-identical* to the first plan after the previous
  one. The counter is now saved in `localStorage` and keeps climbing. (**Reset trip &
  chat** deliberately clears it and starts over.)
- **The pool was smaller than the trip.** A 5-day trip needs 25 distinct places, and two
  ticked interests only offered about 27 — so effectively every one of them was used
  every time and only the running order changed. The place pool is now **103 real UAE
  locations**, and the planner draws from a wider candidate list, which cuts the repeat
  rate substantially.

Two honest caveats that are not bugs:

- **Some repetition is correct.** Tick only *Desert adventure* and you will keep seeing
  Liwa, Al Marmoom and Hatta, because that is genuinely what the country offers. Tick
  more interests and the variety goes up sharply.
- **Long trips exhaust the pool.** A 14-day trip at six stops a day needs 84 slots. Rather
  than print empty days, the planner cycles back through the pool — so places recur, which
  is what a real fortnight looks like anyway.

For plans that are actually different every time — and that genuinely understand
"make day 4 lighter, we have a toddler" rather than just pattern-matching the word
"toddler" — add an API key. That is the honest difference between the two modes.

## Where is my key stored?

**Nowhere.** It is saved in your own browser's `localStorage`, on your own computer, and
that is the only copy.

- There is **no backend** in this project. Not a small one — none at all.
- The key travels from your browser straight to `generativelanguage.googleapis.com` and
  nowhere else.
- It is not in this repository, and every `localStorage` read and write is wrapped in
  `try/catch` so private-browsing mode and `file://` restrictions cannot break the page.

Clearing the field deletes the stored key.

---

## Troubleshooting

| Symptom | What it means | Fix |
|---|---|---|
| Tag says `Demo mode` with a key pasted | The field is empty or whitespace | Re-paste the key; the tag switches as you type |
| Test key: *"API key not valid"* (400/403) | The key is wrong, revoked, or the Generative Language API is not enabled for it | Copy the key again, whole; check it in Google AI Studio |
| Test key: *"quota"* or 429 | Rate limit on the free tier | Wait a minute and try again |
| Test key: *"No HTTP status came back"* | No connection, or the request was blocked before it left the browser | Check the network; some school and office networks block the endpoint |
| Chat says *"gemini-X is busy — falling back to gemini-Y"* | The first model was unavailable; the app walked its chain | Nothing — this is the fallback working |
| Plan appears but says *"built by the offline planner"* | No key, or every model in the chain failed | Add a key, then press Test key to see the real reason |
| Model replied in prose, not a plan | The model ignored the JSON instruction | Press Regenerate; it usually complies on the retry |
| PDF tab: *"The PDF library did not load"* | The jsPDF CDN file was blocked or you are offline | Reconnect and reload; everything else still works |
| Every plan looks the same | See **"Am I getting the same plan every time?"** below | Check the badge under the plan title |
| Map tile says it cannot load | Google Maps embeds need a connection | Reconnect; the rest of the studio is offline-capable |

---

## The repo, file by file

```
index.html          Landing page — the explainer. No AI logic lives here.
studio.html         The app: three columns and a floating notes window.

css/tokens.css      Colours, fonts, radii, spacing.        Loads 1st, both pages.
css/base.css        Reset, links, focus, button colours.   Loads 2nd, both pages.
css/index.css       Landing-page layout and the CSS sky.   Loads 3rd.
css/studio.css      App layout, the veil, the notes panel. Loads 3rd.

js/index.js         Sticky header, scroll-spy, reveals. Three behaviours, no more.
js/studio.js        Everything else: the planner, the prompt, the Gemini layer,
                    rendering, the map, the PDF, the chat animation, the notes.

assets/hero-skyline.jpg   Dubai skyline across the dunes — the hero background.
assets/mosque.jpg         Sheikh Zayed Grand Mosque at blue hour.
assets/photo.jpg          The Liwa dunes at golden hour.
assets/creek.jpg          Dubai Creek and the abras at dusk.
```

> **About the images.** They are AI-generated views of the UAE, not licensed
> photographs, so the project ships with no attribution or usage strings attached.
> Drop real photographs in over the top using the same filenames whenever you like —
> nothing else needs to change. Every `<img>` carries an `onerror` that removes its own
> figure, and the hero's photo sits on top of the original pure-CSS ridge silhouettes,
> so a missing file always degrades cleanly instead of leaving a broken frame.

**Why it is split this way.** Stylesheet order is load-bearing: the page-specific file
comes last so it can override the shared ones. `tokens.css` holds a value only if it is
identical on **both** pages — which is why the extra-large radius is not in there, since
the landing page wants 22px and the studio wants 20px. `base.css` holds only the rules
that are byte-identical on both pages; control *sizing* is deliberately per-page, because
the studio runs a denser interface (13.5px inputs, 14px slider handles) than the landing
page (14px, 15px).

Both JavaScript files are wrapped in an IIFE with `'use strict'` and loaded with
`defer`, so nothing leaks into the global scope and nothing blocks the parser.

---

## A few decisions worth explaining

- **The offline planner varies its output on purpose.** It is a pure function, so pressing
  Generate twice used to return a byte-identical plan — which reads as "the AI is broken",
  and in demo mode there is no AI to blame. A session run counter feeds a *seeded* shuffle
  (Knuth hash + LCG), so runs differ but one seed always gives one ordering, which keeps
  the planner reproducible and testable.
- **The model chain is filtered against reality.** An earlier version had model IDs
  hard-coded as though they were permanent. Google retired them, every call 404'd, and the
  studio silently fell back to the offline planner forever — with a valid key in the box.
  Now the preference list is always checked against what the key can actually call, and a
  400/403 while *listing* is reported immediately as a key problem instead of blaming the
  last model in a chain nobody chose.
- **The first error is the one reported, not the last.** The first failure came from the
  model you actually picked.
- **Nothing is rendered with `innerHTML`.** The content comes from a language model, so
  every node is built with `createElement` and `textContent`.
- **The "generating" veil covers the itinerary *and* the PDF panel.** They are separate
  scroll boxes and you can switch tabs mid-generation; veiling both means the PDF tab is
  never caught showing the previous trip's document as though it were the new one.

---

## UAE Vision 2071 and the National AI Strategy

Vision 2071 sets out to make the UAE one of the best countries in the world by the
centenary of the union, with a diversified, knowledge-led economy. The National AI
Strategy 2031 names tourism among the sectors AI should serve. This project points at
four of those goals:

- **Economy** — tourism is a pillar of growth beyond oil, and a country that is easier to
  plan a trip to is a country that is easier to choose.
- **Sustainability** — grouping each day's stops by area cuts back-and-forth driving, and
  with it fuel, emissions and time lost in traffic.
- **Culture** — the model is instructed to include Emirati heritage in every plan, not
  only malls and towers.
- **Access** — large language models already work across Arabic, Hindi, Mandarin and
  Russian, so no separate edition has to be written, printed or shipped.

---

## Tech

Plain HTML, CSS and JavaScript. No framework, no bundler, no build step, no server.

- **Google Gemini API** — called directly from the browser
- **jsPDF 2.5.1** — PDF typesetting, via CDN
- **Google Maps embeds** — the map panel
- **Inter** — Google Fonts

---

## A note on the data

The places are real UAE landmarks and the prices are realistic dirham figures, but they
are **indicative, not live**. Nothing is fetched from a booking API. Check current prices
and opening hours before you commit to a day.

---

## Licence
<img width="1024" height="764" alt="image" src="https://github.com/user-attachments/assets/9bb67f55-d63c-4767-a8cb-2b82908d9e71" />

MIT — see [LICENSE](LICENSE) for the full text.
