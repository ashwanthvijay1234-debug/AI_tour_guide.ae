# AI_tour_guide.ae

### Smart UAE AI Tourism Assistant
<img width="1919" height="932" alt="image" src="https://github.com/user-attachments/assets/2a0080c5-7b23-440a-b13b-81d24f1bb5bd" />

An AI-powered virtual guide that plans your trip around the UAE. Tell it where you
want to go, how long you have and what you like — it builds a full day-by-day
itinerary, prices everything in dirhams, plots every stop on a map, and lets you
download the whole thing as a PDF.

**Grade 9 · Artificial Intelligence · Subject Enrichment Activity**
Made by **Ashwanth Vijay**

---

## What it does

You answer four simple questions:

| Question | Example |
|---|---|
| Where do you want to go? | Dubai, Abu Dhabi, Sharjah… or all of the UAE |
| How many days? | 1 to 14 |
| What's your budget per person? | AED 500 to AED 40,000 |
| What are you interested in? | Food, beaches, culture, desert, shopping, family |

…and it gives you back a complete trip plan in about ten seconds.

**You can also just talk to it.** Once the plan appears, type things like
*"make day 3 cheaper"*, *"we have a toddler"* or *"more desert, less shopping"*
and it rewrites the itinerary around you.

### The three things that make it useful

🗓️ **A real itinerary, not a list** — every stop has a time window, a reason why
it's worth going, and what it costs. Days are grouped by area so you're not
driving back and forth across the emirates.

🗺️ **Mapped and exportable** — see every stop on a map, then download the plan as
a PDF to take with you.

🌙 **It knows the UAE** — summer midday heat, Friday prayer timings, modest dress
at mosques, Ramadan hours, and how long it really takes to drive between emirates.

---

## Try it

### The easy way

1. Click the green **Code** button at the top of this page → **Download ZIP**
2. Unzip the folder anywhere on your computer
3. Double-click **`index.html`**

That's it. No installing anything, no setup, no internet connection needed.

### The two modes

The studio works in **two different ways**, and this is the important bit:

| | 🎭 **Demo mode** | ✨ **AI mode** |
|---|---|---|
| **Needs an API key?** | No | Yes (free) |
| **Needs internet?** | No | Yes |
| **How it plans** | A built-in list of real UAE places | Google Gemini writes it fresh |
| **Always works?** | Yes, always | Only when Google is reachable |

**Demo mode runs automatically** if you don't add a key — so the project never
breaks, even with no internet. That was a deliberate design choice: a demo that
depends on a working WiFi connection is a demo that fails when you need it most.

Want the real AI to write your trip? Here's how 👇

---

## 🔑 How to get your free Gemini API key

An "API key" is just a long password that lets this webpage talk to Google's AI.
It's **free**, and it takes about two minutes to get.

> **You don't need this to use the project.** Demo mode works without it. This is
> only if you want the AI to write the itinerary from scratch.

### Step 1 — Open Google AI Studio
Watch this video(https://youtu.be/JdKcFCLotZY?si=YtJM6uWIsKA7dDxw) or follow the steps below :

Go to **[aistudio.google.com/apikey](https://aistudio.google.com/apikey)**

### Step 2 — Sign in

Use any normal Google account (the same one you use for Gmail or YouTube is fine).

### Step 3 — Create the key

Click the **"Create API key"** button.

If it asks you to pick a project, just choose whatever it suggests, or click
**"Create project"** and accept the default name. It doesn't matter what it's called.

### Step 4 — Copy it

You'll see a long code that starts with **`AIza`** followed by lots of letters and
numbers. Click the copy icon next to it.

⚠️ **Treat this like a password.** Don't post it online, don't put it in your
homework screenshots, and don't share it with friends.

### Step 5 — Paste it into the studio

1. Open **`studio.html`**
2. In the left column, scroll down and click **"Model & API key"** to expand it
3. Paste your key into the **Gemini API key** box
4. The tag in the top-right corner changes from **"Demo mode"** to **"Gemini live"** ✅

Now press **Generate itinerary** and the AI writes your trip.

### Where does the key go?

**Nowhere.** It's saved only in your own browser, on your own computer. It never
gets uploaded, never gets sent to me, and it isn't stored anywhere in this repo.
If you open the project on a different computer, you'd have to paste it again.

---

## 🔧 If something goes wrong

| What you see | What it means | What to do |
|---|---|---|
| Tag says **"Demo mode"** | No key entered | Follow the steps above — or just carry on, demo mode works fine |
| **"Check the key is enabled for the Generative Language API"** | The key isn't valid, or it's from the wrong kind of project | Make a fresh key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |
| **"Every Gemini model failed"** | Google couldn't be reached | Check your internet. The offline plan is shown instead, so you're not stuck |
| Page looks plain and unstyled | The CSS didn't load | Make sure you kept the whole folder together — `index.html` needs the `css` folder next to it |
| Changes don't show up | Your browser cached the old version | Press **Ctrl + F5** to force a proper refresh |

The studio automatically asks Google which AI models your key can use, so it keeps
working even when Google renames or retires models.

---

## 📁 What's in each file

Everything is plain **HTML, CSS and JavaScript** — no frameworks, no build step,
nothing to install.

```
index.html          the landing page (start here)
studio.html         the actual trip-planning app

css/
  tokens.css        all the colours, fonts and spacing
  base.css          buttons, inputs and shared basics
  index.css         styling for the landing page
  studio.css        styling for the app

js/
  index.js          scrolling effects on the landing page
  studio.js         the brain — planning, AI, map and PDF

assets/
  photo.jpg         the photograph on the landing page
```

Every file starts with a comment explaining what it is and what it's for, so you
can open any one of them and know where you are.

### Why it's split up like this

It started as two enormous files with all the styling and code crammed inside
them. Splitting it means the colours live in one place (change `tokens.css` and
both pages update together), and you can find things without scrolling through
hundreds of lines.

---

## 🇦🇪 How this connects to UAE Vision 2071

Tourism is one of the pillars of the UAE's move beyond an oil-based economy.
A guide like this makes the country easier to explore for visitors who don't
know it — surfacing heritage sites and local food alongside the famous towers
and malls, and making a trip work on a small budget as well as a large one.
It also shows AI being used for something practical and everyday, which is
exactly the kind of adoption the National AI Strategy is aiming for.

---

## 🛠️ Built with

- **HTML5** and **CSS3** — custom properties, flexbox and grid, no frameworks
- **JavaScript** — no libraries for the app logic
- **Google Gemini API** — for the AI-written itineraries
- **jsPDF** — for the PDF export

---

## 📄 Licence

Released under the MIT Licence — see [LICENSE](LICENSE).
You're welcome to read the code, learn from it and build on it.
