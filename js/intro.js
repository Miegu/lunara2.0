// Cinematic intro overlay controller.
(() => {
  const intro = document.getElementById('lunaraIntro');
  const skip = document.getElementById('lunaraIntroSkip');
  if (!intro || !skip) return;
  document.body.classList.add('lunara-intro-open');
  const startedAt = performance.now();
  const minimumDuration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 450 : 4300;
  let finished = false, fallbackTimer = null;
  const onKeyDown = event => { if (event.key === 'Escape') finish(true); };
  const finish = (skipNow = false) => {
    if (finished) return;
    finished = true;
    clearTimeout(fallbackTimer);
    window.removeEventListener('lunara:ready', onReady);
    document.removeEventListener('keydown', onKeyDown);
    const elapsed = performance.now() - startedAt;
    const wait = skipNow ? 0 : Math.max(0, minimumDuration - elapsed);
    window.setTimeout(() => {
      intro.classList.add('is-exiting');
      document.body.classList.remove('lunara-intro-open');
      window.setTimeout(() => intro.remove(), 1050);
    }, wait);
  };
  const onReady = () => finish(false);
  window.addEventListener('lunara:ready', onReady, { once:true });
  skip.addEventListener('click', () => finish(true), { once:true });
  document.addEventListener('keydown', onKeyDown);
  fallbackTimer = window.setTimeout(() => finish(true), 8500);
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    clearTimeout(fallbackTimer);
    intro.classList.add('is-exiting');
    document.body.classList.remove('lunara-intro-open');
    window.setTimeout(() => intro.remove(), 1100);
    finished = true;
  }
})();
