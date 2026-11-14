'use strict';
// Startup. Runs last: loads Three.js (optional), builds the 3D scenes and runs the first calculation.
// Loaded as a classic deferred script; see js/README.md.
(async () => {
  try { THREE = await Promise.race([import('three'), new Promise((_, reject) => setTimeout(() => reject(new Error('Timed out loading Three.js')), 2500))]); } catch (error) { console.warn('Three.js is unavailable; switching to the 2D fallback view.', error); }
  if (THREE) {
    try { GLTFLoader = (await import('three/addons/loaders/GLTFLoader.js')).GLTFLoader; } catch (error) { console.warn('GLTFLoader is unavailable; moon model will not load.', error); }
  }

  // Startup: graceful visual fallback if WebGL is unavailable.
  try{sky3d=createSky3D();moon3d=await createMoon3D();}catch(err){console.warn('Could not initialize Three.js:',err);fallbackVisuals=createFallbackVisuals();$('skyStatus').textContent='2D fallback view';$('moonStatus').textContent='2D fallback view';}
  updateDataBadge();calculate();
  window.dispatchEvent(new Event('lunara:ready'));
})();
