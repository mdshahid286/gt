// Shared interaction helpers used on both index.html and app.html.

export function initScrollReveal() {
    const targets = document.querySelectorAll('.reveal');
    if (!targets.length) return;
    const observer = new IntersectionObserver(
        (entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('in-view');
                    observer.unobserve(entry.target);
                }
            });
        },
        { threshold: 0.15 }
    );
    targets.forEach((el) => observer.observe(el));
}

// Subtle 3D tilt on hover, following the cursor position within the card.
// Reduced-motion users get no tilt (respects prefers-reduced-motion).
export function initCardTilt(selector = '.glass-tilt') {
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;

    document.querySelectorAll(selector).forEach((card) => {
        card.addEventListener('mousemove', (e) => {
            const rect = card.getBoundingClientRect();
            const x = (e.clientX - rect.left) / rect.width - 0.5;
            const y = (e.clientY - rect.top) / rect.height - 0.5;
            card.style.transform = `perspective(700px) rotateY(${x * 6}deg) rotateX(${-y * 6}deg) translateY(-2px)`;
        });
        card.addEventListener('mouseleave', () => {
            card.style.transform = 'perspective(700px) rotateY(0deg) rotateX(0deg) translateY(0)';
        });
    });
}