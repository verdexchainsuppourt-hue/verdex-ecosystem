/* ============================================================
   VERDEX — Premium Interactivity Engine v4
   GSAP-choreographed motion · particle constellation · custom
   cursor · magnetic buttons · spotlight cards · live chain stats
   ============================================================ */

(function () {
  'use strict';

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isFinePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const hasGsap = typeof window.gsap !== 'undefined';
  const hasST = hasGsap && typeof window.ScrollTrigger !== 'undefined';
  const hasLenis = typeof window.Lenis !== 'undefined';

  if (hasST) window.gsap.registerPlugin(window.ScrollTrigger);

  document.addEventListener('DOMContentLoaded', function () {

    /* ---------------------------------------------------------
       1. LENIS SMOOTH SCROLL
    --------------------------------------------------------- */
    let lenis = null;
    if (hasLenis && !prefersReducedMotion) {
      try {
        lenis = new window.Lenis({ duration: 1.15, smoothWheel: true });
        const raf = function (time) { lenis.raf(time); requestAnimationFrame(raf); };
        requestAnimationFrame(raf);
        if (hasST) lenis.on('scroll', window.ScrollTrigger.update);
      } catch (e) { lenis = null; }
    }

    function smoothScrollTo(target) {
      const offset = -80;
      if (lenis) {
        lenis.scrollTo(target, { offset: offset, duration: 1.2 });
      } else {
        const top = target.getBoundingClientRect().top + window.pageYOffset + offset;
        window.scrollTo({ top: top, behavior: 'smooth' });
      }
    }

    /* ---------------------------------------------------------
       2. PREMIUM PRELOADER (counter → curtain reveal)
    --------------------------------------------------------- */
    const preloader = document.getElementById('preloader');
    const barFill = document.getElementById('preloaderBarFill');
    const percentEl = document.getElementById('preloaderPercent');
    let preloaderDone = false;

    function finishPreloader() {
      if (preloaderDone || !preloader) return;
      preloaderDone = true;
      if (hasGsap && !prefersReducedMotion) {
        window.gsap.to(preloader, {
          yPercent: -100,
          duration: 0.9,
          ease: 'power4.inOut',
          onComplete: function () {
            preloader.classList.add('hidden');
            preloader.style.transform = '';
            preloader.style.opacity = '';
            preloader.style.visibility = '';
          }
        });
      } else {
        preloader.classList.add('hidden');
      }
      playHeroIntro();
    }

    if (preloader) {
      if (barFill && percentEl && !prefersReducedMotion) {
        const start = performance.now();
        const dur = 1300;
        (function tick(now) {
          const t = Math.min(((now || performance.now()) - start) / dur, 1);
          const eased = 1 - Math.pow(1 - t, 3);
          const val = Math.round(eased * 100);
          barFill.style.width = val + '%';
          percentEl.textContent = val + '%';
          if (t < 1) requestAnimationFrame(tick);
          else setTimeout(finishPreloader, 180);
        })(start);
      } else {
        setTimeout(finishPreloader, 900);
      }
      // Hard fallback — never trap the user
      setTimeout(finishPreloader, 5000);
    } else {
      playHeroIntro();
    }

    /* ---------------------------------------------------------
       3. HERO INTRO TIMELINE
    --------------------------------------------------------- */
    let heroIntroPlayed = false;
    function playHeroIntro() {
      if (heroIntroPlayed) return;
      heroIntroPlayed = true;
      if (!hasGsap || prefersReducedMotion) return;

      const g = window.gsap;
      const tl = g.timeline({ defaults: { ease: 'power4.out' } });

      if (document.querySelector('.hero-badge')) {
        tl.fromTo('.hero-badge', { y: 26, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7 });
      }
      if (document.querySelector('.ht-word')) {
        tl.fromTo('.ht-word',
          { yPercent: 118, rotateZ: 4 },
          { yPercent: 0, rotateZ: 0, duration: 1.05, stagger: 0.07 }, '-=0.35');
      }
      if (document.querySelector('.hero-subtitle')) {
        tl.fromTo('.hero-subtitle', { y: 26, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8 }, '-=0.6');
      }
      if (document.querySelector('.hero-cta')) {
        tl.fromTo('.hero-cta > *', { y: 22, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7, stagger: 0.08 }, '-=0.55');
      }
      if (document.querySelector('.hero-stats')) {
        tl.fromTo('.hero-stats .stat', { y: 18, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, stagger: 0.1 }, '-=0.45');
      }
      if (document.querySelector('.hero-visual')) {
        tl.fromTo('.hero-visual', { opacity: 0, scale: 0.88, y: 30 }, { opacity: 1, scale: 1, y: 0, duration: 1.2, ease: 'power3.out' }, '-=1.0');
      }
      if (document.querySelector('.scroll-indicator')) {
        tl.fromTo('.scroll-indicator', { opacity: 0 }, { opacity: 1, duration: 0.8 }, '-=0.4');
      }
    }

    // If no preloader markup exists, hero intro fires immediately (handled above).

    /* ---------------------------------------------------------
       4. SCROLL PROGRESS BAR
    --------------------------------------------------------- */
    const scrollProgress = document.getElementById('scrollProgress');
    function updateProgress() {
      if (!scrollProgress) return;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const pct = docHeight > 0 ? (window.scrollY / docHeight) * 100 : 0;
      scrollProgress.style.width = pct + '%';
    }
    window.addEventListener('scroll', updateProgress, { passive: true });
    updateProgress();

    /* ---------------------------------------------------------
       5. NAVBAR — scrolled state + smart hide/show
    --------------------------------------------------------- */
    const navbar = document.querySelector('.navbar');
    let lastScrollY = window.scrollY;
    if (navbar) {
      window.addEventListener('scroll', function () {
        const y = window.scrollY;
        navbar.classList.toggle('scrolled', y > 40);
        if (y > 320 && y > lastScrollY + 4 && !document.querySelector('.nav-links.active')) {
          navbar.classList.add('nav-hidden');
        } else if (y < lastScrollY - 4 || y <= 320) {
          navbar.classList.remove('nav-hidden');
        }
        lastScrollY = y;
      }, { passive: true });
    }

    /* ---------------------------------------------------------
       6. MOBILE MENU
    --------------------------------------------------------- */
    const menuToggle = document.querySelector('.mobile-menu-toggle');
    const navLinks = document.querySelector('.nav-links');

    if (menuToggle && navLinks) {
      menuToggle.addEventListener('click', function () {
        navLinks.classList.toggle('active');
        menuToggle.textContent = navLinks.classList.contains('active') ? '✕' : '☰';
      });

      navLinks.querySelectorAll('a').forEach(function (link) {
        link.addEventListener('click', function () {
          if (window.innerWidth <= 1100) {
            navLinks.classList.remove('active');
            menuToggle.textContent = '☰';
          }
        });
      });

      document.addEventListener('click', function (e) {
        if (navbar && !navbar.contains(e.target) && navLinks.classList.contains('active')) {
          navLinks.classList.remove('active');
          menuToggle.textContent = '☰';
        }
      });
    }

    /* ---------------------------------------------------------
       7. SCROLLSPY — highlight active nav link
    --------------------------------------------------------- */
    const spySections = document.querySelectorAll('section[id], header[id]');
    const navAnchors = document.querySelectorAll('.nav-links a');
    if (spySections.length && navAnchors.length && 'IntersectionObserver' in window) {
      const spy = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            const id = entry.target.getAttribute('id');
            navAnchors.forEach(function (a) {
              const href = a.getAttribute('href') || '';
              a.classList.toggle('active', href === '#' + id);
            });
          }
        });
      }, { rootMargin: '-40% 0px -55% 0px' });
      spySections.forEach(function (s) { spy.observe(s); });
    }

    /* ---------------------------------------------------------
       8. SMOOTH ANCHOR SCROLL
    --------------------------------------------------------- */
    document.querySelectorAll('a[href^="#"]').forEach(function (link) {
      link.addEventListener('click', function (e) {
        const href = this.getAttribute('href');
        if (!href || href === '#') return;
        const target = document.querySelector(href);
        if (target) {
          e.preventDefault();
          smoothScrollTo(target);
        }
      });
    });

    /* ---------------------------------------------------------
       9. CUSTOM CURSOR (dot + lagging ring)
    --------------------------------------------------------- */
    if (isFinePointer && !prefersReducedMotion) {
      const dot = document.createElement('div');
      const ring = document.createElement('div');
      dot.className = 'cursor-dot';
      ring.className = 'cursor-ring';
      document.body.appendChild(dot);
      document.body.appendChild(ring);
      document.body.classList.add('cursor-ready');

      let mx = -100, my = -100, rx = -100, ry = -100;
      document.addEventListener('mousemove', function (e) {
        mx = e.clientX; my = e.clientY;
        dot.style.left = mx + 'px';
        dot.style.top = my + 'px';
      }, { passive: true });

      (function ringLoop() {
        rx += (mx - rx) * 0.16;
        ry += (my - ry) * 0.16;
        ring.style.left = rx + 'px';
        ring.style.top = ry + 'px';
        requestAnimationFrame(ringLoop);
      })();

      const hoverSel = 'a, button, .btn, select, input, .swap-arrow, [role="button"]';
      document.addEventListener('mouseover', function (e) {
        if (e.target.closest(hoverSel)) ring.classList.add('cursor-hover');
      }, { passive: true });
      document.addEventListener('mouseout', function (e) {
        if (e.target.closest(hoverSel)) ring.classList.remove('cursor-hover');
      }, { passive: true });
      document.addEventListener('mousedown', function () { ring.classList.add('cursor-press'); });
      document.addEventListener('mouseup', function () { ring.classList.remove('cursor-press'); });
    }

    /* ---------------------------------------------------------
       10. HERO PARTICLE CONSTELLATION
    --------------------------------------------------------- */
    (function initParticles() {
      const canvas = document.getElementById('heroCanvas');
      if (!canvas || prefersReducedMotion) return;
      const ctx = canvas.getContext('2d');
      const hero = canvas.parentElement;
      let W = 0, H = 0, particles = [], rafId = null, running = false;
      const mouse = { x: -9999, y: -9999 };

      function resize() {
        W = canvas.width = hero.offsetWidth;
        H = canvas.height = hero.offsetHeight;
        const count = Math.min(110, Math.floor((W * H) / 16000));
        particles = [];
        for (let i = 0; i < count; i++) {
          particles.push({
            x: Math.random() * W,
            y: Math.random() * H,
            vx: (Math.random() - 0.5) * 0.35,
            vy: (Math.random() - 0.5) * 0.35,
            r: Math.random() * 1.6 + 0.6,
            a: Math.random() * 0.5 + 0.25
          });
        }
      }

      function step() {
        if (!running) return;
        ctx.clearRect(0, 0, W, H);
        const LINK = 130;
        for (let i = 0; i < particles.length; i++) {
          const p = particles[i];
          p.x += p.vx; p.y += p.vy;
          if (p.x < 0 || p.x > W) p.vx *= -1;
          if (p.y < 0 || p.y > H) p.vy *= -1;

          // gentle mouse repulsion
          const dxm = p.x - mouse.x, dym = p.y - mouse.y;
          const dm = Math.sqrt(dxm * dxm + dym * dym);
          if (dm < 120 && dm > 0.01) {
            const f = (120 - dm) / 120 * 0.6;
            p.x += (dxm / dm) * f;
            p.y += (dym / dm) * f;
          }

          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(74, 222, 128,' + p.a + ')';
          ctx.fill();

          for (let j = i + 1; j < particles.length; j++) {
            const q = particles[j];
            const dx = p.x - q.x, dy = p.y - q.y;
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d < LINK) {
              ctx.beginPath();
              ctx.moveTo(p.x, p.y);
              ctx.lineTo(q.x, q.y);
              ctx.strokeStyle = 'rgba(34, 197, 94,' + (0.14 * (1 - d / LINK)) + ')';
              ctx.lineWidth = 1;
              ctx.stroke();
            }
          }
        }
        rafId = requestAnimationFrame(step);
      }

      hero.addEventListener('mousemove', function (e) {
        const rect = hero.getBoundingClientRect();
        mouse.x = e.clientX - rect.left;
        mouse.y = e.clientY - rect.top;
      }, { passive: true });
      hero.addEventListener('mouseleave', function () { mouse.x = -9999; mouse.y = -9999; });

      function start() { if (!running) { running = true; step(); } }
      function stop() { running = false; if (rafId) cancelAnimationFrame(rafId); }

      if ('IntersectionObserver' in window) {
        new IntersectionObserver(function (entries) {
          entries[0].isIntersecting ? start() : stop();
        }, { threshold: 0.02 }).observe(hero);
      } else { start(); }

      document.addEventListener('visibilitychange', function () {
        document.hidden ? stop() : start();
      });

      window.addEventListener('resize', resize, { passive: true });
      resize();
    })();

    /* ---------------------------------------------------------
       11. SCROLL REVEALS (GSAP ScrollTrigger with IO fallback)
    --------------------------------------------------------- */
    const revealEls = document.querySelectorAll('.reveal');
    const cardSelectors = '.about-card, .eco-card, .roadmap-item, .token-card, .token-allocation, .token-utility, .hiw-column, .fee-bar, .chart-card, .faq-card';

    if (hasST && !prefersReducedMotion) {
      revealEls.forEach(function (el) {
        window.gsap.fromTo(el,
          { opacity: 0, y: 64 },
          {
            opacity: 1, y: 0, duration: 1.05, ease: 'power3.out',
            scrollTrigger: { trigger: el, start: 'top 86%', once: true },
            onComplete: function () { el.classList.add('active'); }
          });
      });

      window.gsap.set(cardSelectors, { opacity: 0, y: 36 });
      window.ScrollTrigger.batch(cardSelectors, {
        start: 'top 90%',
        once: true,
        onEnter: function (batch) {
          window.gsap.to(batch, { opacity: 1, y: 0, duration: 0.85, stagger: 0.09, ease: 'power3.out', overwrite: true });
        }
      });

      // Hero scroll parallax
      if (document.querySelector('.hero-content')) {
        window.gsap.to('.hero-content', {
          y: -70, opacity: 0.35, ease: 'none',
          scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom 35%', scrub: true }
        });
      }
      if (document.querySelector('.hero-visual')) {
        window.gsap.to('.hero-visual', {
          y: -40, ease: 'none',
          scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true }
        });
      }
    } else {
      // IntersectionObserver fallback
      if ('IntersectionObserver' in window) {
        const io = new IntersectionObserver(function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) {
              entry.target.classList.add('active');
              io.unobserve(entry.target);
            }
          });
        }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });
        revealEls.forEach(function (el) { io.observe(el); });

        const cardIO = new IntersectionObserver(function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) {
              entry.target.style.opacity = '1';
              entry.target.style.transform = 'translateY(0)';
              cardIO.unobserve(entry.target);
            }
          });
        }, { threshold: 0.1 });
        document.querySelectorAll(cardSelectors).forEach(function (c) {
          c.style.opacity = '0';
          c.style.transform = 'translateY(30px)';
          c.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
          cardIO.observe(c);
        });
      } else {
        revealEls.forEach(function (el) { el.classList.add('active'); });
      }
    }

    /* ---------------------------------------------------------
       12. SPOTLIGHT CARDS — cursor-tracked glow position
    --------------------------------------------------------- */
    if (isFinePointer) {
      const spotCards = document.querySelectorAll(
        '.about-card, .eco-card, .hiw-column, .fee-bar, .token-card, .token-allocation, .token-utility, .chart-card, .whitepaper-card'
      );
      spotCards.forEach(function (card) {
        card.addEventListener('mousemove', function (e) {
          const rect = card.getBoundingClientRect();
          card.style.setProperty('--mx', ((e.clientX - rect.left) / rect.width * 100) + '%');
          card.style.setProperty('--my', ((e.clientY - rect.top) / rect.height * 100) + '%');
        }, { passive: true });
      });
    }

    /* ---------------------------------------------------------
       13. 3D TILT CARDS
    --------------------------------------------------------- */
    if (isFinePointer && !prefersReducedMotion) {
      document.querySelectorAll('.about-card, .eco-card, .token-card, .token-allocation, .token-utility, .hiw-column, .fee-bar').forEach(function (card) {
        card.style.transformStyle = 'preserve-3d';
        card.addEventListener('mousemove', function (e) {
          const rect = card.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;
          const rotateX = (y - rect.height / 2) / 28;
          const rotateY = (rect.width / 2 - x) / 28;
          card.style.transform = 'perspective(1000px) rotateX(' + rotateX.toFixed(2) + 'deg) rotateY(' + rotateY.toFixed(2) + 'deg) translateY(-6px)';
        });
        card.addEventListener('mouseleave', function () { card.style.transform = ''; });
      });
    }

    /* ---------------------------------------------------------
       14. MAGNETIC BUTTONS
    --------------------------------------------------------- */
    if (isFinePointer && !prefersReducedMotion && hasGsap) {
      document.querySelectorAll('.btn').forEach(function (btn) {
        btn.addEventListener('mousemove', function (e) {
          const rect = btn.getBoundingClientRect();
          const x = e.clientX - rect.left - rect.width / 2;
          const y = e.clientY - rect.top - rect.height / 2;
          window.gsap.to(btn, { x: x * 0.22, y: y * 0.22, duration: 0.4, ease: 'power3.out' });
        });
        btn.addEventListener('mouseleave', function () {
          window.gsap.to(btn, { x: 0, y: 0, duration: 0.6, ease: 'elastic.out(1, 0.45)' });
        });
      });
    }

    /* ---------------------------------------------------------
       15. NUMBER COUNT-UP HELPER
    --------------------------------------------------------- */
    function countUp(el, target, decimals) {
      decimals = decimals || 0;
      const current = parseFloat(String(el.textContent).replace(/[^0-9.\-]/g, '')) || 0;
      if (!hasGsap || prefersReducedMotion || current === target) {
        el.textContent = target.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
        return;
      }
      const obj = { v: current };
      window.gsap.to(obj, {
        v: target,
        duration: 1.4,
        ease: 'power2.out',
        onUpdate: function () {
          el.textContent = obj.v.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
        }
      });
    }

    /* ---------------------------------------------------------
       16. LIVE HERO BLOCKCHAIN STATS
    --------------------------------------------------------- */
    const heightEl = document.getElementById('hero-stat-height');
    const txsEl = document.getElementById('hero-stat-txs');
    const tpsEl = document.getElementById('hero-stat-tps');

    async function updateLiveStats() {
      try {
        const res = await fetch('/api/stats');
        const data = await res.json();
        if (res.ok && data.success) {
          if (heightEl) countUp(heightEl, Number(data.data.height) || 0);
          if (txsEl) countUp(txsEl, Number(data.data.totalTransactions) || 0);
          if (tpsEl) tpsEl.textContent = '0.00';
          return;
        }
      } catch (e) { /* network offline — fall through */ }
      if (heightEl && heightEl.textContent === '') heightEl.textContent = '0';
      if (txsEl && txsEl.textContent === '') txsEl.textContent = '0';
      if (tpsEl && tpsEl.textContent === '') tpsEl.textContent = '0.00';
    }

    if (heightEl || txsEl || tpsEl) {
      updateLiveStats();
      setInterval(updateLiveStats, 3000);
    }

    /* ---------------------------------------------------------
       17. COUNTDOWN TIMER (legacy support)
    --------------------------------------------------------- */
    const countdownDate = new Date('2026-12-12T00:00:00').getTime();
    function updateCountdown() {
      const now = Date.now();
      const distance = countdownDate - now;
      const els = {
        days: document.getElementById('days'),
        hours: document.getElementById('hours'),
        minutes: document.getElementById('minutes'),
        seconds: document.getElementById('seconds')
      };
      if (!els.days && !els.hours && !els.minutes && !els.seconds) return;
      if (distance < 0) {
        Object.keys(els).forEach(function (k) { if (els[k]) els[k].textContent = '00'; });
        return;
      }
      const v = {
        days: Math.floor(distance / 86400000),
        hours: Math.floor((distance % 86400000) / 3600000),
        minutes: Math.floor((distance % 3600000) / 60000),
        seconds: Math.floor((distance % 60000) / 1000)
      };
      Object.keys(v).forEach(function (k) {
        if (els[k]) els[k].textContent = String(v[k]).padStart(2, '0');
      });
    }
    updateCountdown();
    setInterval(updateCountdown, 1000);

    /* ---------------------------------------------------------
       18. WAITLIST FORM + CELEBRATION
    --------------------------------------------------------- */
    const waitlistForm = document.getElementById('waitlistForm');
    const formMessage = document.getElementById('formMessage');
    const celebrationOverlay = document.getElementById('celebrationOverlay');

    function celebrate() {
      if (!celebrationOverlay || prefersReducedMotion) return;
      for (let i = 0; i < 44; i++) {
        const p = document.createElement('div');
        p.className = 'celebration-particle';
        p.style.left = Math.random() * 100 + 'vw';
        p.style.bottom = '-12px';
        p.style.width = p.style.height = (Math.random() * 7 + 4) + 'px';
        p.style.background = ['#22c55e', '#4ade80', '#86efac', '#bbf7d0'][Math.floor(Math.random() * 4)];
        p.style.animationDelay = (Math.random() * 0.5) + 's';
        p.style.animationDuration = (Math.random() * 1.2 + 1.4) + 's';
        celebrationOverlay.appendChild(p);
        setTimeout(function () { p.remove(); }, 3200);
      }
    }

    if (waitlistForm && formMessage) {
      waitlistForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        const emailInput = this.querySelector('input[type="email"]');
        const submitBtn = this.querySelector('button[type="submit"]');
        if (!emailInput || !emailInput.value) return;

        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = 'Joining...';
          submitBtn.style.opacity = '0.7';
        }

        try {
          const response = await fetch('/api/waitlist', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: emailInput.value })
          });
          const data = await response.json();

          if (response.ok) {
            formMessage.textContent = '✓ ' + (data.message || 'Welcome aboard! Check your inbox.');
            formMessage.className = 'form-success';
            formMessage.style.display = 'block';
            emailInput.value = '';
            celebrate();
          } else {
            formMessage.textContent = '✗ ' + (data.error || 'Something went wrong.');
            formMessage.className = 'form-error';
            formMessage.style.display = 'block';
          }
        } catch (err) {
          formMessage.textContent = '✗ Network error. Please try again.';
          formMessage.className = 'form-error';
          formMessage.style.display = 'block';
        } finally {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Notify Me';
            submitBtn.style.opacity = '1';
          }
          setTimeout(function () { formMessage.style.display = 'none'; }, 6000);
        }
      });
    }

    /* ---------------------------------------------------------
       19. HERO VISUAL MOUSE PARALLAX
    --------------------------------------------------------- */
    if (isFinePointer && !prefersReducedMotion && hasGsap) {
      const hero = document.querySelector('.hero');
      const visual = document.querySelector('.logo-orbit');
      if (hero && visual) {
        hero.addEventListener('mousemove', function (e) {
          const rect = hero.getBoundingClientRect();
          const relX = (e.clientX - rect.left) / rect.width - 0.5;
          const relY = (e.clientY - rect.top) / rect.height - 0.5;
          window.gsap.to(visual, {
            x: relX * 26,
            y: relY * 26,
            rotationY: relX * 8,
            rotationX: -relY * 8,
            duration: 0.9,
            ease: 'power2.out'
          });
        });
        hero.addEventListener('mouseleave', function () {
          window.gsap.to(visual, { x: 0, y: 0, rotationX: 0, rotationY: 0, duration: 1, ease: 'power3.out' });
        });
      }
    }

    /* ---------------------------------------------------------
       20. NAV LOGO SPIN
    --------------------------------------------------------- */
    const navLogoIcon = document.querySelector('.navbar .logo-icon');
    const navLogoLink = document.querySelector('.navbar .logo');
    if (navLogoIcon && navLogoLink) {
      navLogoIcon.style.transition = 'transform 0.6s ease';
      navLogoLink.addEventListener('mouseenter', function () {
        navLogoIcon.style.transform = 'rotateY(360deg)';
      });
      navLogoLink.addEventListener('mouseleave', function () {
        navLogoIcon.style.transform = 'rotateY(0deg)';
      });
    }

    /* ---------------------------------------------------------
       21. REFERRAL CAPTURE
    --------------------------------------------------------- */
    const urlParams = new URLSearchParams(window.location.search);
    const refCode = urlParams.get('ref');
    if (refCode) {
      localStorage.setItem('referred_by_code', refCode.trim().toUpperCase());
    }

  });
})();
