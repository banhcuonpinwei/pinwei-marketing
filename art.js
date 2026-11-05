/*
 * The main page's motion, and nothing else: the faint Pin Wei mark behind the title drifts with the pointer and the
 * scroll, a soft light follows the pointer across the hero, and sections rise into place the first time they are seen.
 * With prefers-reduced-motion (or without IntersectionObserver) everything is simply shown, still. Content never waits on
 * this file: without it, the page is the same, only static.
 */
(function () {
  'use strict';
  var root = document.documentElement;
  var still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var sections = Array.prototype.slice.call(document.querySelectorAll('.reveal'));

  // the three steps rise one after the other
  Array.prototype.forEach.call(document.querySelectorAll('.steps .step'), function (el, i) { el.style.setProperty('--i', i); });

  if (still || !('IntersectionObserver' in window)) {
    sections.forEach(function (el) { el.classList.add('in'); });
  } else {
    root.classList.add('art'); // only now may .reveal start hidden (see hub.css)
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add('in');
        io.unobserve(e.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    sections.forEach(function (el) { io.observe(el); });
  }

  var hero = document.getElementById('hero');
  if (!hero || still) return;

  var mx = 0, my = 0, sy = 0, lx = 50, ly = 40, queued = false;
  function paint() {
    queued = false;
    hero.style.setProperty('--mx', mx.toFixed(3));
    hero.style.setProperty('--my', my.toFixed(3));
    hero.style.setProperty('--sy', String(Math.round(sy)));
    hero.style.setProperty('--lx', lx.toFixed(1) + '%');
    hero.style.setProperty('--ly', ly.toFixed(1) + '%');
  }
  function queue() {
    if (queued) return;
    queued = true;
    window.requestAnimationFrame(paint);
  }
  hero.addEventListener('pointermove', function (ev) {
    var r = hero.getBoundingClientRect();
    var x = (ev.clientX - r.left) / r.width;
    var y = (ev.clientY - r.top) / r.height;
    mx = x * 2 - 1;
    my = y * 2 - 1;
    lx = x * 100;
    ly = y * 100;
    hero.classList.add('lit');
    queue();
  });
  hero.addEventListener('pointerleave', function () {
    mx = 0; my = 0;
    hero.classList.remove('lit');
    queue();
  });
  window.addEventListener('scroll', function () {
    sy = Math.min(window.scrollY || 0, 900);
    queue();
  }, { passive: true });
})();
