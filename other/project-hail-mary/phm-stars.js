/* phm-stars.js — shared starfield backdrop + scroll-reveal for all PHM pages.
   Honours prefers-reduced-motion: paints a static starfield and shows every
   section immediately instead of animating. */
(function () {
  var reduce = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── Starfield ── */
  var canvas = document.getElementById('stars');
  if (canvas) {
    var ctx = canvas.getContext('2d'), w, h, stars = [];

    function resize() { w = canvas.width = innerWidth; h = canvas.height = innerHeight; }

    function seed() {
      resize();
      stars = Array.from({ length: 220 }, function () {
        return {
          x: Math.random() * w, y: Math.random() * h,
          r: Math.random() * 1.4 + 0.3,
          a: Math.random() * 0.7 + 0.3,
          s: Math.random() * 0.0008 + 0.0002
        };
      });
    }

    function paint(t) {
      ctx.clearRect(0, 0, w, h);
      for (var i = 0; i < stars.length; i++) {
        var p = stars[i];
        var f = reduce ? 1 : 0.5 + 0.5 * Math.sin(t * p.s * 6);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(232,230,225,' + (p.a * f) + ')';
        ctx.fill();
      }
      if (!reduce) requestAnimationFrame(paint);
    }

    seed();
    addEventListener('resize', function () { resize(); if (reduce) paint(0); });
    requestAnimationFrame(paint);
  }

  /* ── Scroll reveals ── */
  var reveals = document.querySelectorAll('.reveal');
  if (reduce || !('IntersectionObserver' in window)) {
    reveals.forEach(function (el) { el.classList.add('visible'); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) e.target.classList.add('visible'); });
    }, { threshold: 0.12 });
    reveals.forEach(function (el) { io.observe(el); });
  }
})();
