/* ============================================================================
   index.js — landing-page scroll behaviour for AI_tour_guide.ae
   ----------------------------------------------------------------------------
   WHAT THIS IS
   Three small behaviours and nothing else. There is no AI logic on the landing
   page; every model call, the planner, the PDF and the map live in
   js/studio.js. Keeping this file deliberately tiny is the point — a marketing
   page that ships a kilobyte of script cannot break the thing it is selling.

     1. Sticky header — sets data-stuck past 12px of scroll (css/index.css
        paints the blur and the border from that attribute).
     2. Scroll-spy   — an IntersectionObserver that marks the nav link for the
        section currently in the middle of the viewport.
     3. Reveals      — adds .in to .rv elements as they arrive, then stops
        watching them.

   WHERE THE REST LIVES
   index.html / css/index.css   the page these behaviours drive
   js/studio.js                 the app
   ========================================================================== */

(function () {
  'use strict';

  /* Reduced motion is checked at CALL time, not once at load: someone can turn
     the OS setting on while the page is open, and a page that only looked once
     would keep animating at them for the rest of the session. */
  function reduced() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /* ---------------------------------------------------------------- header */

  var header = document.getElementById('siteHeader');

  if (header) {
    var stuck = false;

    var syncHeader = function () {
      var past = window.scrollY > 12;
      /* Only touch the DOM when the state actually flips. A scroll handler that
         writes an attribute on every frame is the easiest way to make a smooth
         page stutter. */
      if (past === stuck) return;
      stuck = past;
      if (past) header.setAttribute('data-stuck', '');
      else header.removeAttribute('data-stuck');
    };

    /* passive: this listener never calls preventDefault, and saying so lets the
       browser scroll without waiting to find out. */
    window.addEventListener('scroll', syncHeader, { passive: true });
    syncHeader();
  }

  /* -------------------------------------------------------------- scrollspy */

  var navLinks = Array.prototype.slice.call(
    document.querySelectorAll('.site-nav a[href^="#"]')
  );

  if (navLinks.length && 'IntersectionObserver' in window) {
    var linkFor = {};
    var sections = [];

    navLinks.forEach(function (link) {
      var id = link.getAttribute('href').slice(1);
      var section = document.getElementById(id);
      if (!section) return;
      linkFor[id] = link;
      sections.push(section);
    });

    var clearCurrent = function () {
      navLinks.forEach(function (link) { link.removeAttribute('aria-current'); });
    };

    /* The negative rootMargin shrinks the observation window down to a thin
       band across the middle of the screen, so "active" means "the section you
       are actually reading" rather than "anything touching the viewport" —
       which would light up two or three links at once on a tall screen. */
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var link = linkFor[entry.target.id];
        if (!link) return;
        clearCurrent();
        /* aria-current doubles as the CSS hook, so the visual state and the
           screen-reader state can never disagree. */
        link.setAttribute('aria-current', 'location');
      });
    }, { rootMargin: '-45% 0px -50% 0px', threshold: 0 });

    sections.forEach(function (section) { spy.observe(section); });
  }

  /* ---------------------------------------------------------------- reveals */

  var revealables = Array.prototype.slice.call(document.querySelectorAll('.rv'));

  if (revealables.length) {
    if (reduced() || !('IntersectionObserver' in window)) {
      /* No observer or no appetite for motion: show everything immediately.
         The CSS also has a reduced-motion fallback, but an old browser with no
         IntersectionObserver would otherwise be left with an invisible page. */
      revealables.forEach(function (el) { el.classList.add('in'); });
    } else {
      var reveal = new IntersectionObserver(function (entries, observer) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('in');
          /* Reveals are one-way. Unobserving keeps the callback from being
             re-entered for the rest of the page's life. */
          observer.unobserve(entry.target);
        });
      }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });

      revealables.forEach(function (el) { reveal.observe(el); });
    }
  }
}());
