/* ═══════════════════════════════════════════════════════════════
   index.js  —  JavaScript for index.html ONLY (the landing page)

   WHAT THIS FILE DOES
   Three small presentation touches. There is no AI logic here —
   all of that lives in js/studio.js.

     1. Sticky header    adds a "stuck" look once you scroll down
     2. Scroll spy       highlights the nav link for the section
                         you are currently looking at
     3. Scroll reveal    fades elements in as they enter the screen

   HOW IT IS LOADED
   index.html loads this with <script defer>, so it runs after the
   page HTML exists. That is why it can safely look elements up
   straight away without waiting for DOMContentLoaded.

   WHY THE WHOLE FILE IS WRAPPED IN (() => { ... })()
   That is an IIFE (Immediately Invoked Function Expression). It
   runs once and keeps every variable inside it private, so
   nothing here can clash with other scripts on the page.
   ═══════════════════════════════════════════════════════════════ */

(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  const hdr = $('#hdr');
  addEventListener('scroll', () => hdr.toggleAttribute('data-stuck', scrollY > 12), { passive: true });

  const navLinks = $$('.hdr-nav a');
  const spy = new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return;
    navLinks.forEach(a => a.removeAttribute('aria-current'));
    const l = navLinks.find(a => a.getAttribute('href') === '#' + e.target.id);
    if (l) l.setAttribute('aria-current', 'location');
  }), { rootMargin: '-45% 0px -50% 0px' });
  navLinks.map(a => $(a.getAttribute('href'))).filter(Boolean).forEach(s => spy.observe(s));

  const rv = new IntersectionObserver((es, o) => es.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add('in'); o.unobserve(e.target); }
  }), { rootMargin: '0px 0px -8% 0px' });
  $$('.rv').forEach(x => rv.observe(x));
})();
