/* phm-stars.js — shared cosmos backdrop + scroll behaviour for all PHM pages.
   - twinkling starfield
   - occasional meteors / shooting stars
   - reading-progress bar (injected)
   - scroll-reveal for .reveal sections
   Honours prefers-reduced-motion: paints a static starfield, no meteors,
   and shows every section immediately. */
(function () {
  var reduce = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── Starfield + meteors ── */
  var canvas = document.getElementById('stars');
  if (canvas) {
    var ctx = canvas.getContext('2d'), w, h, stars = [], meteors = [], last = 0;

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

    function spawnMeteor() {
      // travel down-left to up-right at a shallow angle, starting off the
      // left/upper edge so streaks sweep across the sky
      var ang = (-25 - Math.random() * 15) * Math.PI / 180; // -25°..-40°
      var speed = 6 + Math.random() * 5;
      meteors.push({
        x: Math.random() * w * 0.6,
        y: h * (0.1 + Math.random() * 0.5),
        vx: Math.cos(ang) * speed,
        vy: Math.sin(ang) * speed,
        len: 120 + Math.random() * 140,
        life: 0, ttl: 60 + Math.random() * 40
      });
    }

    function drawStars(t) {
      for (var i = 0; i < stars.length; i++) {
        var p = stars[i];
        var f = reduce ? 1 : 0.5 + 0.5 * Math.sin(t * p.s * 6);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(232,230,225,' + (p.a * f) + ')';
        ctx.fill();
      }
    }

    function drawMeteors() {
      for (var i = meteors.length - 1; i >= 0; i--) {
        var m = meteors[i];
        m.x += m.vx; m.y += m.vy; m.life++;
        var fade = 1 - m.life / m.ttl;                 // 1 → 0 over its life
        var tx = m.x - m.vx / Math.hypot(m.vx, m.vy) * m.len;
        var ty = m.y - m.vy / Math.hypot(m.vx, m.vy) * m.len;
        var g = ctx.createLinearGradient(m.x, m.y, tx, ty);
        g.addColorStop(0, 'rgba(255,246,225,' + (0.9 * fade) + ')');
        g.addColorStop(0.3, 'rgba(232,166,48,' + (0.5 * fade) + ')');
        g.addColorStop(1, 'rgba(232,166,48,0)');
        ctx.strokeStyle = g; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(tx, ty); ctx.stroke();
        // bright head
        ctx.beginPath(); ctx.arc(m.x, m.y, 1.6, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,248,230,' + fade + ')'; ctx.fill();
        if (m.life >= m.ttl || m.x > w + m.len || m.y < -m.len) meteors.splice(i, 1);
      }
    }

    function frame(t) {
      ctx.clearRect(0, 0, w, h);
      drawStars(t);
      if (!reduce) {
        // ~ one new meteor every 2.2–4s
        if (t - last > 2200 + Math.random() * 1800) { spawnMeteor(); last = t; }
        drawMeteors();
        requestAnimationFrame(frame);
      }
    }

    seed();
    addEventListener('resize', function () { resize(); if (reduce) frame(0); });
    requestAnimationFrame(frame);
  }

  /* ── Reading-progress bar ── */
  var bar = document.createElement('div');
  bar.className = 'read-progress';
  bar.setAttribute('aria-hidden', 'true');
  (document.body || document.documentElement).appendChild(bar);
  function updateProgress() {
    var doc = document.documentElement;
    var max = doc.scrollHeight - doc.clientHeight;
    bar.style.transform = 'scaleX(' + (max > 0 ? Math.min(1, doc.scrollTop / max) : 0) + ')';
  }
  addEventListener('scroll', updateProgress, { passive: true });
  addEventListener('resize', updateProgress);
  updateProgress();

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
