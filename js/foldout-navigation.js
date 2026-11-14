// Opens the right foldout when a navigation link is clicked.
(() => {
  document.querySelectorAll('.mission-nav a[href^="#"]').forEach(link => {
    link.addEventListener('click', () => {
      const target = document.querySelector(link.getAttribute('href'));
      if (!target) return;
      target.closest('details')?.setAttribute('open', '');
      target.scrollIntoView({behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block:'start'});
    });
  });
})();
