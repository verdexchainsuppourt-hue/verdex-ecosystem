// Verdex Website Interactivity v3 - Pure Vanilla JS (No Dependencies)

document.addEventListener('DOMContentLoaded', function() {
  
  // --- 1. PRELOADER ---
  const preloader = document.getElementById('preloader');

  // --- 2. SCROLL PROGRESS BAR ---
  const scrollProgress = document.getElementById('scrollProgress');
  if (scrollProgress) {
    window.addEventListener('scroll', function() {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const scrollPercent = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
      scrollProgress.style.width = scrollPercent + '%';
    });
  }

  // --- 3. BACKGROUND INTERACTION ---
  // Small cursor glow and particle overlays removed for a cleaner site experience.

  // --- 4. NAVBAR SCROLL EFFECT ---
  const navbar = document.querySelector('.navbar');
  if (navbar) {
    window.addEventListener('scroll', function() {
      if (window.scrollY > 50) {
        navbar.style.background = 'rgba(3, 8, 3, 0.95)';
        navbar.style.padding = '14px 0';
      } else {
        navbar.style.background = 'rgba(3, 8, 3, 0.8)';
        navbar.style.padding = '20px 0';
      }
    });
  }

  // --- 6. MOBILE MENU ---
  const menuToggle = document.querySelector('.mobile-menu-toggle');
  const navLinks = document.querySelector('.nav-links');
  
  if (menuToggle && navLinks) {
    menuToggle.addEventListener('click', function() {
      navLinks.classList.toggle('active');
    });

    // Close menu on link click
    const navLinkItems = navLinks.querySelectorAll('a');
    for (let i = 0; i < navLinkItems.length; i++) {
      navLinkItems[i].addEventListener('click', function() {
        if (window.innerWidth <= 1280) {
          navLinks.classList.remove('active');
        }
      });
    }
  }

  // --- 7. COUNTDOWN TIMER (December 12, 2026) ---
  const countdownDate = new Date('2026-12-12T00:00:00').getTime();
  
  function updateCountdown() {
    const now = new Date().getTime();
    const distance = countdownDate - now;

    if (distance < 0) {
      const daysEl = document.getElementById('days');
      const hoursEl = document.getElementById('hours');
      const minutesEl = document.getElementById('minutes');
      const secondsEl = document.getElementById('seconds');
      if (daysEl) daysEl.textContent = '00';
      if (hoursEl) hoursEl.textContent = '00';
      if (minutesEl) minutesEl.textContent = '00';
      if (secondsEl) secondsEl.textContent = '00';
      return;
    }

    const days = Math.floor(distance / (1000 * 60 * 60 * 24));
    const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((distance % (1000 * 60)) / 1000);

    const daysEl = document.getElementById('days');
    const hoursEl = document.getElementById('hours');
    const minutesEl = document.getElementById('minutes');
    const secondsEl = document.getElementById('seconds');
    if (daysEl) daysEl.textContent = String(days).padStart(2, '0');
    if (hoursEl) hoursEl.textContent = String(hours).padStart(2, '0');
    if (minutesEl) minutesEl.textContent = String(minutes).padStart(2, '0');
    if (secondsEl) secondsEl.textContent = String(seconds).padStart(2, '0');
  }

  updateCountdown();
  setInterval(updateCountdown, 1000);

  // --- 8. SMOOTH SCROLL ---
  const anchorLinks = document.querySelectorAll('a[href^="#"]');
  for (let i = 0; i < anchorLinks.length; i++) {
    anchorLinks[i].addEventListener('click', function(e) {
      const href = this.getAttribute('href');
      if (href === '#' || href === '') return;
      const target = document.querySelector(href);
      if (target) {
        e.preventDefault();
        const offset = 80;
        const targetPosition = target.getBoundingClientRect().top + window.pageYOffset - offset;
        window.scrollTo({
          top: targetPosition,
          behavior: 'smooth'
        });
      }
    });
  }

  // --- 9. REVEAL ANIMATIONS ---
  const revealElements = document.querySelectorAll('.reveal');
  
  if (revealElements.length > 0 && 'IntersectionObserver' in window) {
    const revealObserver = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('active');
          revealObserver.unobserve(entry.target);
        }
      });
    }, {
      threshold: 0.1,
      rootMargin: '0px 0px -50px 0px'
    });

    for (let i = 0; i < revealElements.length; i++) {
      revealObserver.observe(revealElements[i]);
    }
  } else {
    // Fallback - just show everything
    for (let i = 0; i < revealElements.length; i++) {
      revealElements[i].classList.add('active');
    }
  }

  // --- 10. CARD ANIMATIONS ---
  const cardSelectors = '.about-card, .eco-card, .roadmap-item, .token-card, .token-allocation, .token-utility, .hiw-column, .fee-bar, .chart-card';
  const cardElements = document.querySelectorAll(cardSelectors);
  
  if (cardElements.length > 0 && 'IntersectionObserver' in window) {
    const cardObserver = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          entry.target.style.opacity = '1';
          entry.target.style.transform = 'translateY(0)';
          cardObserver.unobserve(entry.target);
        }
      });
    }, {
      threshold: 0.1,
      rootMargin: '0px 0px -30px 0px'
    });

    for (let i = 0; i < cardElements.length; i++) {
      cardElements[i].style.opacity = '0';
      cardElements[i].style.transform = 'translateY(30px)';
      cardElements[i].style.transition = 'opacity 0.6s ease, transform 0.6s ease';
      cardObserver.observe(cardElements[i]);
    }
  } else {
    for (let i = 0; i < cardElements.length; i++) {
      cardElements[i].style.opacity = '1';
      cardElements[i].style.transform = 'translateY(0)';
    }
  }

  // --- 11. WAITLIST FORM (Supabase + Resend API) ---
  const waitlistForm = document.getElementById('waitlistForm');
  const formMessage = document.getElementById('formMessage');

  if (waitlistForm && formMessage) {
    waitlistForm.addEventListener('submit', async function(e) {
      e.preventDefault();
      const emailInput = this.querySelector('input[type="email"]');
      const submitBtn = this.querySelector('button[type="submit"]');
      
      if (!emailInput || !emailInput.value) return;

      const email = emailInput.value;
      
      // Show loading state
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Joining...';
        submitBtn.style.opacity = '0.7';
      }

      try {
        const response = await fetch('/api/waitlist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email })
        });

        const data = await response.json();

        if (response.ok) {
          formMessage.textContent = '✓ ' + (data.message || 'Welcome aboard! Check your inbox.');
          formMessage.style.color = 'var(--color-primary-light)';
          formMessage.style.display = 'block';
          emailInput.value = '';
        } else {
          formMessage.textContent = '✗ ' + (data.error || 'Something went wrong.');
          formMessage.style.color = '#ff6b6b';
          formMessage.style.display = 'block';
        }
      } catch (err) {
        console.error('Waitlist fetch error:', err);
        formMessage.textContent = '✗ Network error. Please try again.';
        formMessage.style.color = '#ff6b6b';
        formMessage.style.display = 'block';
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Join Waitlist';
          submitBtn.style.opacity = '1';
        }
        setTimeout(function() {
          formMessage.style.display = 'none';
        }, 6000);
      }
    });
  }

  // --- 12. 3D CARD TILT EFFECT (Subtle - preserves green hover) ---
  const tiltCards = document.querySelectorAll('.about-card, .eco-card, .token-card, .token-allocation, .token-utility, .hiw-column, .fee-bar');
  tiltCards.forEach(function(card) {
    card.style.transformStyle = 'preserve-3d';
    card.style.perspective = '1000px';
    card.addEventListener('mousemove', function(e) {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      const rotateX = (y - centerY) / 30;
      const rotateY = (centerX - x) / 30;
      // Only apply 3D rotation, keep CSS hover effects (border, shadow, translateY)
      card.style.transform = 'perspective(1000px) rotateX(' + rotateX + 'deg) rotateY(' + rotateY + 'deg)';
    });
    card.addEventListener('mouseleave', function() {
      card.style.transform = '';
    });
  });

  // --- 13. SUBTLE BUTTON HOVER (No magnetic - preserves green) ---
  const buttons = document.querySelectorAll('.btn');
  buttons.forEach(function(btn) {
    btn.addEventListener('mousemove', function(e) {
      const rect = btn.getBoundingClientRect();
      const x = e.clientX - rect.left - rect.width / 2;
      const y = e.clientY - rect.top - rect.height / 2;
      // Very subtle effect - only 0.1 multiplier
      btn.style.transform = 'translate(' + (x * 0.1) + 'px, ' + (y * 0.1) + 'px)';
    });
    btn.addEventListener('mouseleave', function() {
      btn.style.transform = '';
    });
  });

  // --- 14. ANIMATED STAT COUNTERS ---
  const statValues = document.querySelectorAll('.stat-value');
  const statObserver = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
      if (entry.isIntersecting) {
        const el = entry.target;
        const finalText = el.textContent;
        el.classList.add('count-up');
        // Simple pulse animation
        el.style.transition = 'transform 0.3s ease';
        el.style.transform = 'scale(1.1)';
        setTimeout(function() {
          el.style.transform = 'scale(1)';
        }, 300);
        statObserver.unobserve(el);
      }
    });
  }, { threshold: 0.5 });
  
  statValues.forEach(function(stat) {
    statObserver.observe(stat);
  });

  // --- 15. PARALLAX SCROLL EFFECT ---
  const parallaxElements = document.querySelectorAll('.hero-animation, .trailer-animation, .section-tag');
  window.addEventListener('scroll', function() {
    const scrollY = window.scrollY;
    parallaxElements.forEach(function(el) {
      const rect = el.getBoundingClientRect();
      const elementTop = rect.top + scrollY;
      const offset = (scrollY - elementTop) * 0.05;
      if (rect.top < window.innerHeight && rect.bottom > 0) {
        el.style.transform = 'translateY(' + offset + 'px)';
      }
    });
  });

  // --- 16. ENHANCED PRELOADER WITH FADE ---
  if (preloader) {
    setTimeout(function() {
      preloader.style.transition = 'opacity 0.8s ease, visibility 0.8s ease';
      preloader.style.opacity = '0';
      preloader.style.visibility = 'hidden';
    }, 1800);
  }

  // --- 17. INTERSECTION OBSERVER FOR SECTION ANIMATIONS ---
  const animatedSections = document.querySelectorAll('.section');
  const sectionObserver = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('in-view');
        // Animate child elements with stagger
        const children = entry.target.querySelectorAll('.about-card, .eco-card, .hiw-column, .fee-bar, .roadmap-item, .token-card, .token-allocation, .token-utility');
        children.forEach(function(child, index) {
          setTimeout(function() {
            child.style.opacity = '1';
            child.style.transform = 'translateY(0)';
          }, index * 80);
        });
      }
    });
  }, { threshold: 0.15 });

  animatedSections.forEach(function(section) {
    sectionObserver.observe(section);
  });

  // --- 18. MOUSE TRAIL EFFECT (SUBTLE) ---
  let mouseX = 0, mouseY = 0;
  let trailX = 0, trailY = 0;
  document.addEventListener('mousemove', function(e) {
    mouseX = e.clientX;
    mouseY = e.clientY;
  });

  // --- 19. CARD HOVER SOUND-LIKE VISUAL FEEDBACK ---
  const interactiveCards = document.querySelectorAll('.eco-card, .about-card, .hiw-column');
  interactiveCards.forEach(function(card) {
    card.addEventListener('mouseenter', function() {
      card.style.transition = 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)';
    });
  });

  // --- 20. ENHANCED NAVBAR ON SCROLL ---
  let lastScroll = 0;
  window.addEventListener('scroll', function() {
    const currentScroll = window.pageYOffset;
    if (currentScroll > 100) {
      navbar.style.transform = 'translateY(0)';
    }
    lastScroll = currentScroll;
  });

  // --- 22. SMOOTH SECTION DIVIDERS ---
  const sections = document.querySelectorAll('.section');
  sections.forEach(function(section, index) {
    if (index < sections.length - 1) {
      section.style.position = 'relative';
    }
  });

  // --- 23. LOGO SPIN ON HOVER (NAVBAR) ---
  const navLogo = document.querySelector('.navbar .logo-icon');
  if (navLogo) {
    navLogo.style.transition = 'transform 0.6s ease';
    const navLogoLink = document.querySelector('.navbar .logo');
    if (navLogoLink) {
      navLogoLink.addEventListener('mouseenter', function() {
        navLogo.style.transform = 'rotateY(360deg)';
      });
      navLogoLink.addEventListener('mouseleave', function() {
        navLogo.style.transform = 'rotateY(0deg)';
      });
    }
  }

  // --- 24. ENHANCED COUNTDOWN WITH ANIMATION ---
  const countdownBoxes = document.querySelectorAll('.countdown div');
  countdownBoxes.forEach(function(box) {
    const span = box.querySelector('span');
    if (span) {
      const observer = new MutationObserver(function() {
        span.style.transform = 'scale(1.2)';
        setTimeout(function() {
          span.style.transform = 'scale(1)';
        }, 200);
      });
      observer.observe(span, { childList: true, characterData: true, subtree: true });
    }
  });

  // --- 25. LIVE HERO BLOCKCHAIN STATS TICKER ---
  const VDX_RPC_URL = '';

  async function updateLiveStats() {
    try {
      const res = await fetch(`${VDX_RPC_URL}/api/stats`);
      const data = await res.json();
      if (res.ok && data.success) {
        const heightEl = document.getElementById('hero-stat-height');
        const txsEl = document.getElementById('hero-stat-txs');
        const tpsEl = document.getElementById('hero-stat-tps');
        if (heightEl) heightEl.textContent = data.data.height.toLocaleString();
        if (txsEl) txsEl.textContent = data.data.totalTransactions.toLocaleString();
        if (tpsEl) tpsEl.textContent = '0.00';
        return;
      }
    } catch (e) {}

    const heightEl = document.getElementById('hero-stat-height');
    const txsEl = document.getElementById('hero-stat-txs');
    const tpsEl = document.getElementById('hero-stat-tps');

    if (heightEl) heightEl.textContent = '0';
    if (txsEl) txsEl.textContent = '0';
    if (tpsEl) tpsEl.textContent = '0.00';
  }

  updateLiveStats();
  setInterval(updateLiveStats, 3000);

  // --- 26. REFERRAL CAPTURE ---
  const urlParams = new URLSearchParams(window.location.search);
  const refCode = urlParams.get('ref');
  if (refCode) {
    localStorage.setItem('referred_by_code', refCode.trim().toUpperCase());
    console.log('Captured referral code from URL:', refCode.trim().toUpperCase());
  }

});

