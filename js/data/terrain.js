'use strict';
// Terrain: horizon profiles per site. The heavy LOLA elevation map is never loaded in the browser:
// tools/lola_horizon.py precomputes a small CSV (azimuth, horizon elevation) for each catalog site
// into horizons/, and this file loads those CSVs (a few KB each) plus any CSV the user uploads.
// Part of LUNARA's main app. Loaded as a classic deferred script (see js/README.md for the order).

const horizonLibrary = new Map(); // "lat,lon" -> {profile:[{az,el}], source}
const siteKey = site => `${Number(site.lat).toFixed(5)},${Number(site.lon).toFixed(5)}`;

function profileForSite(site) {
  return horizonLibrary.get(siteKey(site))?.profile || null;
}
function horizonSourceForSite(site) {
  return horizonLibrary.get(siteKey(site))?.source || null;
}
function registerHorizon(site, profile, source) {
  horizonLibrary.set(siteKey(site), {profile, source});
}

// CSV "azimuth_deg,horizon_elevation_deg" (header and # comments are ignored).
function parseHorizonCSV(text) {
  const pts = [];
  for (const line of text.split(/\r?\n/).map(x => x.trim()).filter(Boolean)) {
    if (!/^[-+]?\d/.test(line)) continue;
    const cols = line.split(/[;,\t]/).map(Number);
    if (cols.length >= 2 && Number.isFinite(cols[0]) && Number.isFinite(cols[1])) {
      if (cols[1] < -90 || cols[1] > 90) throw new Error('Horizon elevation must be between −90° and +90°.');
      pts.push({az: wrap360(cols[0]), el: cols[1]});
    }
  }
  if (pts.length < 4) throw new Error('The CSV must contain at least 4 azimuth,elevation pairs.');
  return pts.sort((a, b) => a.az - b.az);
}

// Load the precomputed LOLA horizons of the catalog sites (PRESETS[*].horizon).
async function preloadCatalogHorizons() {
  const jobs = Object.values(PRESETS).filter(p => p.horizon).map(async p => {
    try {
      const response = await fetch(p.horizon, {cache: 'no-store'});
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      registerHorizon(p, parseHorizonCSV(await response.text()), `LOLA · ${p.horizon.split('/').pop()}`);
    } catch (error) {
      console.warn(`Terrain profile not available for ${p.name}:`, error);
    }
  });
  await Promise.all(jobs);
}

// Keep the legacy globals (horizonProfile/horizonProfileSite, used by the chart and reports)
// and the status message in sync with the active site.
function syncActiveHorizon() {
  const site = {lat: Number($('lat').value), lon: Number($('lon').value)};
  const entry = horizonLibrary.get(siteKey(site));
  horizonProfile = entry?.profile || null;
  horizonProfileSite = entry ? site : null;
  const msg = $('terrainMessage');
  if (!msg) return;
  msg.textContent = entry
    ? `Terrain: ${entry.source} · ${entry.profile.length} points · applies to ${number(site.lat, 3)}°, ${number(site.lon, 3)}°.`
    : 'Terrain: flat horizon (0°). No terrain profile for these coordinates; catalog sites near the south pole use LOLA.';
  msg.className = `status-note${entry ? ' good' : ''}`;
}
