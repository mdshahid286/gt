/**
 * interactions.js — Shared interaction utilities
 *
 * Used on both index.html and app.html.
 * Exported functions must be imported as ES modules.
 */

// ---------------------------------------------------------------------------
// Scroll reveal — fade + slide-up elements with class .reveal
// ---------------------------------------------------------------------------
export function initScrollReveal() {
    const targets = document.querySelectorAll('.reveal');
    if (!targets.length) return;

    const observer = new IntersectionObserver(
        entries => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('in-view');
                    observer.unobserve(entry.target);
                }
            });
        },
        { threshold: 0.12 }
    );

    targets.forEach(el => observer.observe(el));
}

// ---------------------------------------------------------------------------
// 3D card tilt on hover — follows cursor inside each card
// Respects prefers-reduced-motion automatically.
// ---------------------------------------------------------------------------
export function initCardTilt(selector = '.card-tilt') {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    document.querySelectorAll(selector).forEach(card => {
        card.addEventListener('mousemove', e => {
            const rect = card.getBoundingClientRect();
            const x    = (e.clientX - rect.left) / rect.width  - 0.5;
            const y    = (e.clientY - rect.top)  / rect.height - 0.5;
            card.style.transform = `perspective(700px) rotateY(${x * 8}deg) rotateX(${-y * 8}deg) translateY(-3px)`;
        });

        card.addEventListener('mouseleave', () => {
            card.style.transform = 'perspective(700px) rotateY(0deg) rotateX(0deg) translateY(0)';
        });
    });
}

// ---------------------------------------------------------------------------
// Counter animation — animates [data-count] elements when they enter view
// ---------------------------------------------------------------------------
export function initCounters(selector = '[data-count]') {
    const targets = document.querySelectorAll(selector);
    if (!targets.length) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        targets.forEach(el => { el.textContent = el.dataset.count; });
        return;
    }

    const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            observer.unobserve(entry.target);
            animateCount(entry.target);
        });
    }, { threshold: 0.5 });

    targets.forEach(el => observer.observe(el));
}

function animateCount(el) {
    const target   = parseInt(el.dataset.count, 10);
    const duration = 1200;
    const start    = performance.now();

    function step(now) {
        const progress = Math.min((now - start) / duration, 1);
        // Ease out cubic
        const eased = 1 - Math.pow(1 - progress, 3);
        el.textContent = Math.round(eased * target);
        if (progress < 1) requestAnimationFrame(step);
    }

    requestAnimationFrame(step);
}