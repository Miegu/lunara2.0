'use strict';
// Direct-to-Earth communications: Deep Space Network (DSN) station visibility and an idealised link budget.
// A link is possible when (1) Earth is above the site's horizon (terrain included, see geometry.js) and
// (2) at least one DSN complex sees the Moon above its elevation mask.
// Moon position for (2) uses a low-precision lunar ephemeris (~0.3°) plus Earth rotation (GMST): enough
// for station visibility, not for antenna pointing. Shown in the "Link to Earth" 3D panel (js/ui/scenes-3d.js).
// Part of LUNARA's main app. Loaded as a classic deferred script (see js/README.md for the order).

const DSN_STATIONS = [
  {name: 'Goldstone', lat: 35.426, lon: -116.890},
  {name: 'Madrid', lat: 40.431, lon: -4.248},
  {name: 'Canberra', lat: -35.401, lon: 148.982}
];
const DSN_MASK_DEG = 10;
const COMMS_BANDS = { // frequency (MHz) and typical DSN system noise temperature (K)
  S: {label: 'S-band · 2.2 GHz', freqMHz: 2200, tsysK: 30},
  X: {label: 'X-band · 8.4 GHz', freqMHz: 8400, tsysK: 30},
  Ka: {label: 'Ka-band · 32 GHz', freqMHz: 32000, tsysK: 45}
};
const DEG = Math.PI / 180;

// Geocentric Moon position, low precision (Astronomical Almanac). Returns RA/Dec (deg) and distance (km).
function moonEquatorial(dateMs) {
  const d = (dateMs - J2000_MS) / 86400000;
  const L = 218.316 + 13.176396 * d, M = 134.963 + 13.064993 * d, F = 93.272 + 13.229350 * d;
  const D = 297.850 + 12.190749 * d, Ms = 357.529 + 0.98560028 * d; // mean elongation, solar anomaly
  const s = x => Math.sin(x * DEG), c = x => Math.cos(x * DEG);
  const lam = (L + 6.289 * s(M) - 1.274 * s(M - 2 * D) + 0.658 * s(2 * D) - 0.186 * s(Ms) - 0.059 * s(2 * M - 2 * D)
    - 0.057 * s(M - 2 * D + Ms) + 0.053 * s(M + 2 * D) + 0.046 * s(2 * D - Ms) + 0.041 * s(M - Ms) - 0.035 * s(D) - 0.031 * s(M + Ms)) * DEG;
  const beta = (5.128 * s(F) + 0.281 * s(M + F) + 0.278 * s(M - F) + 0.173 * s(2 * D - F)) * DEG;
  const dist = 385001 - 20905 * c(M) - 3699 * c(2 * D - M) - 2956 * c(2 * D);
  const eps = (23.439 - 0.0000004 * d) * DEG;
  const x = Math.cos(beta) * Math.cos(lam);
  const y = Math.cos(eps) * Math.cos(beta) * Math.sin(lam) - Math.sin(eps) * Math.sin(beta);
  const z = Math.sin(eps) * Math.cos(beta) * Math.sin(lam) + Math.cos(eps) * Math.sin(beta);
  return {ra: wrap360(Math.atan2(y, x) / DEG), dec: Math.asin(z) / DEG, dist};
}
function gmstDeg(dateMs) { return wrap360(280.46061837 + 360.98564736629 * (dateMs - J2000_MS) / 86400000); }

// Moon elevation (deg, topocentric) seen from each DSN station.
function dsnVisibility(dateMs) {
  const moon = moonEquatorial(dateMs), gmst = gmstDeg(dateMs);
  return DSN_STATIONS.map(st => {
    const H = (gmst + st.lon - moon.ra) * DEG, phi = st.lat * DEG, dec = moon.dec * DEG;
    const hGeo = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
    const hTopo = hGeo - Math.asin(6378 / moon.dist * Math.cos(hGeo)); // lunar parallax (~1°)
    const elevation = hTopo / DEG;
    return {...st, elevation, inView: elevation >= DSN_MASK_DEG};
  });
}
// Sub-lunar point on Earth (where the Moon is at the zenith): used to orient the Earth in the 3D panel.
function subLunarPoint(dateMs) {
  const moon = moonEquatorial(dateMs);
  return {lat: moon.dec, lon: ((moon.ra - gmstDeg(dateMs) + 540) % 360) - 180};
}

function commsSettings() {
  const band = COMMS_BANDS[$('commsBand')?.value] || COMMS_BANDS.X;
  return {
    band,
    powerW: Math.max(0.01, Number($('commsPower')?.value) || 10),
    landerGainDbi: Number($('commsGain')?.value) || 10,
    dishM: Number($('commsDish')?.value) || 34
  };
}
// Idealised link budget, downlink lander -> DSN. Returns C/N0 (dB-Hz) and the theoretical max data rate (bps)
// with coded Eb/N0 = 2.5 dB and a 3 dB margin. Not modelled: atmosphere, pointing, polarisation, scheduling.
function linkBudget(distanceKm, s = commsSettings()) {
  const fMHz = s.band.freqMHz, lambda = 299792458 / (fMHz * 1e6);
  const fspl = 20 * Math.log10(distanceKm) + 20 * Math.log10(fMHz) + 32.44;
  const dsnGain = 10 * Math.log10(0.6 * (Math.PI * s.dishM / lambda) ** 2);
  const received = 10 * Math.log10(s.powerW) + s.landerGainDbi + dsnGain - fspl - 2; // 2 dB misc. losses
  const cn0 = received - (-228.6 + 10 * Math.log10(s.band.tsysK));
  const rateBps = 10 ** ((cn0 - 2.5 - 3) / 10);
  return {fspl, dsnGain, received, cn0, rateBps};
}
function fmtRate(bps) {
  if (!(bps > 0)) return '—';
  return bps >= 1e6 ? `${number(bps / 1e6, bps >= 1e8 ? 0 : 1)} Mbps` : bps >= 1e3 ? `${number(bps / 1e3, 1)} kbps` : `${number(bps, 0)} bps`;
}

// Link state at one sample (row from makeRows).
function linkState(row, s = commsSettings()) {
  const stations = dsnVisibility(row.dateMs);
  const best = stations.filter(st => st.inView).sort((a, b) => b.elevation - a.elevation)[0] || null;
  const earthVisible = !!row.earth.limbVisible;
  const ok = earthVisible && !!best;
  const budget = linkBudget(row.earth.distance, s);
  const reason = ok ? '' : !earthVisible ? 'Earth is below the horizon at the site' : 'no DSN station sees the Moon right now';
  return {ok, earthVisible, stations, best, budget, reason};
}
// Fraction of the window with a possible link (cached per data array).
// Link possible = geometry only (Earth visible + DSN in view), so it does not depend on the radio settings.
const linkAvailabilityCache = new WeakMap();
function linkAvailability(data) {
  if (!linkAvailabilityCache.has(data)) {
    const s = commsSettings();
    linkAvailabilityCache.set(data, data.filter(r => linkState(r, s).ok).length / Math.max(1, data.length));
  }
  return linkAvailabilityCache.get(data);
}
