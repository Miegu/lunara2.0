'use strict';
// 2D horizon panorama: azimuth 0-360° (x) × elevation (y). Shows the Sun and Earth paths over the
// whole window (faded dots = below the horizon/terrain) and their position at the selected time.
// Used by the main column (js/ui/render.js) and the comparison cards (js/ui/comparison.js).
// Part of LUNARA's main app. Loaded as a classic deferred script (see js/README.md for the order).

const horizonPanoramaCache = new WeakMap();

// data: rows from makeRows(); row: selected row; opts.terrain: az => horizon elevation, or null (flat).
function horizonPanoramaSVG(data, row, opts = {}) {
  const W = opts.width || 1000, H = opts.height || 300;
  const terrain = opts.terrain || null;
  const left = 46, right = 10, top = 18, bottom = 36;
  let cache = horizonPanoramaCache.get(data);
  if (!cache || cache.terrain !== terrain || cache.W !== W || cache.H !== H) {
    cache = buildPanoramaLayer(data, terrain, {W, H, left, right, top, bottom});
    horizonPanoramaCache.set(data, cache);
  }
  const {x, y, lo, hi} = cache;
  const marker = (body, color, label, visible) => {
    const below = body.elevation < lo;
    const cx = x(body.azimuth), cy = below ? H - bottom - 6 : y(Math.min(body.elevation, hi));
    const tx = clamp(cx, 70, W - 70);
    const text = below ? `${label} · below horizon` : `${label}${visible ? '' : ' · hidden'}`;
    return `${visible ? `<circle cx="${cx}" cy="${cy}" r="17" fill="${color}" opacity=".5" filter="url(#h2dGlow)"/>` : ''}` +
      `<circle cx="${cx}" cy="${cy}" r="9" fill="${visible ? color : 'none'}" stroke="${color}" stroke-width="2.5"${visible ? '' : ' stroke-dasharray="4 3"'}/>` +
      `<text x="${tx}" y="${Math.max(top + 12, cy - 18)}" class="h2d-mark" fill="${color}" text-anchor="middle">${text}</text>`;
  };
  return `<svg class="h2d" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Horizon panorama with the Sun and Earth">` +
    cache.svg +
    marker(row.earth, '#6cc4ff', 'Earth', row.earth.limbVisible) +
    marker(row.sun, '#ffc66d', 'Sun', row.sun.centerVisible) +
    `</svg>`;
}

function buildPanoramaLayer(data, terrain, g) {
  const {W, H, left, right, top, bottom} = g;
  const els = data.flatMap(r => [r.sun.elevation, r.earth.elevation]);
  const terrainVals = [];
  if (terrain) for (let a = 0; a < 360; a += 2) terrainVals.push(terrain(a));
  // Deep negative elevations are not interesting: keep at most 15° below the horizon.
  const lo = Math.max(-15, Math.floor(Math.min(-3, ...(terrainVals.length ? terrainVals : [0]), ...els) - 1));
  const hi = Math.min(90, Math.ceil(Math.max(8, ...(terrainVals.length ? terrainVals : [0]), ...els) + 3));
  const x = az => left + wrap360(az) / 360 * (W - left - right);
  const y = el => top + (hi - el) / (hi - lo) * (H - top - bottom);
  const gridStep = hi - lo <= 30 ? 5 : hi - lo <= 60 ? 15 : 30;

  let s = `<defs><linearGradient id="h2dTerr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5b6f8c"/><stop offset="1" stop-color="#16202f"/></linearGradient>` +
    `<filter id="h2dGlow" x="-1" y="-1" width="3" height="3"><feGaussianBlur stdDeviation="5"/></filter></defs>`;
  for (let v = Math.ceil(lo / gridStep) * gridStep; v <= hi; v += gridStep) {
    s += `<line x1="${left}" x2="${W - right}" y1="${y(v)}" y2="${y(v)}" stroke="${v === 0 ? '#8fb3d6' : '#22344b'}" stroke-width="${v === 0 ? 1.3 : 1}"/>` +
      `<text x="${left - 8}" y="${y(v) + 5}" class="h2d-axis" text-anchor="end">${v}°</text>`;
  }
  // Ground / terrain silhouette
  let d = `M${left} ${H - bottom}`;
  for (let az = 0; az <= 360; az += 1) d += ` L${(left + az / 360 * (W - left - right)).toFixed(1)} ${y(clamp(terrain ? terrain(az) : 0, lo, hi)).toFixed(1)}`;
  d += ` L${W - right} ${H - bottom} Z`;
  s += `<path d="${d}" fill="url(#h2dTerr)" stroke="#9fb6d3" stroke-width="1.2" opacity=".95"/>`;
  // Paths over the window (subsampled to ~700 dots per body)
  const every = Math.max(1, Math.round(data.length / 700));
  for (const [key, color] of [['sun', '#ffc66d'], ['earth', '#6cc4ff']]) {
    for (let i = 0; i < data.length; i += every) {
      const b = data[i][key];
      if (b.elevation < lo || b.elevation > hi) continue;
      const vis = key === 'sun' ? b.centerVisible : b.limbVisible;
      s += `<circle cx="${x(b.azimuth).toFixed(1)}" cy="${y(b.elevation).toFixed(1)}" r="2.2" fill="${color}" opacity="${vis ? .9 : .28}"/>`;
    }
  }
  ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW', 'N'].forEach((t, i) => {
    s += `<text x="${left + i * 45 / 360 * (W - left - right)}" y="${H - 11}" class="h2d-axis h2d-dir" text-anchor="middle">${t}</text>`;
  });
  return {svg: s, x, y, lo, hi, terrain, W, H};
}

// Terrain function for a site (its own profile from js/data/terrain.js), or null for a flat horizon.
// Memoised per profile so the panorama cache is reused while the slider moves.
const terrainFunctions = new WeakMap();
function terrainFor(site) {
  const profile = profileForSite(site);
  if (!profile) return null;
  if (!terrainFunctions.has(profile)) terrainFunctions.set(profile, az => horizonAt(az, profile));
  return terrainFunctions.get(profile);
}
