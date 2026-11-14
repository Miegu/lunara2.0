'use strict';
// Connection to the local Python SPICE server (lunara_spice_server.py).
// Part of LUNARA's main app. Loaded as a classic deferred script: top-level
// declarations are shared with the other js/ files (see js/README.md for the order).

// -----------------------------------------------------------------------------
// Local Python / SPICE bridge.
// The backend returns the same t_utc_s + Sun/Earth vector format consumed by
// normalizeDataset(); the existing geometry, calculations and renderers remain
// the source of truth on the client.
// Header data button (#spiceConnect): shows the data in use and switches between demo and real SPICE data.
let spiceService = 'checking'; // 'checking' | 'ready' | 'offline'
function updateSpiceButton(state){
  const button = $('spiceConnect');
  if (!button) return;
  const real = dataMode === 'spice', s = state || (real ? 'connected' : spiceService);
  const info = { // [small hint next to the switch, tooltip]
    connected: ['', 'Using real SPICE positions. Click to switch back to demo data.'],
    connecting: ['connecting…', 'Calculating real positions with SPICE…'],
    ready: ['', 'Demo data. Click to use real Sun and Earth positions from SPICE.'],
    checking: ['checking…', 'Looking for the local SPICE server…'],
    offline: ['offline ↻', 'Local SPICE server not found: start start_lunara_spice.bat and open http://127.0.0.1:8765/. Click to check again.']
  }[s];
  button.className = `spice-toggle is-${s}`;
  button.setAttribute('aria-checked', String(real || s === 'connecting'));
  button.querySelector('.spice-toggle__hint').textContent = info[0];
  button.title = info[1];
  button.disabled = s === 'connecting' || s === 'checking';
}

async function refreshLocalSpiceStatus(){
  spiceService = 'checking'; updateSpiceButton();
  try { await refreshLocalSpiceStatusDetail(); } finally { updateSpiceButton(); }
}
async function refreshLocalSpiceStatusDetail(){
  const statusEl = $('spiceServiceStatus');
  if (!statusEl) return;
  try {
    const response = await fetch('/api/status', {cache:'no-store'});
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const status = await response.json();
    if (status.ready) {
      const names = (status.kernels || []).map(k => k.name).join(' · ');
      statusEl.textContent = `SPICE READY · ${status.frame} · ${names || 'kernels loaded'}`;
      statusEl.className = 'status-note good';
      spiceService = 'ready';
    } else {
      spiceService = 'offline';
      statusEl.textContent = `SPICE service found, but not ready: ${status.error || status.message || 'check kernels and SpiceyPy'}`;
      statusEl.className = 'status-note warn';
    }
  } catch (error) {
    statusEl.textContent = 'Local SPICE service not detected. Start start_lunara_spice.bat and open LUNARA at http://127.0.0.1:8765/. Do not open the HTML as file://.';
    statusEl.className = 'status-note warn';
    spiceService = 'offline';
  }
}

async function connectLocalSpice(){
  const button = $('spiceConnect');
  const statusEl = $('spiceServiceStatus');
  const dateValue = $('date').value;
  const durationHours = Number($('duration').value);
  const stepMinutes = Number($('sampleStep').value);
  if (!dateValue) {
    showNotice('Select a mission start date/time before generating SPICE data.','warn');
    return;
  }
  const params = new URLSearchParams({
    start_utc: dateValue,
    duration_hours: String(durationHours),
    step_minutes: String(stepMinutes)
  });
  updateSpiceButton('connecting');
  if (statusEl) {
    statusEl.textContent = 'Calculating Sun and Earth positions with the loaded SPICE kernels…';
    statusEl.className = 'status-note warn';
  }
  try {
    const response = await fetch(`/api/ephemeris?${params.toString()}`, {
      method:'GET', cache:'no-store', headers:{'Accept':'application/json'}
    });
    const payload = await response.json();
    if (!response.ok) {
      const details = payload.details || payload.error || `HTTP ${response.status}`;
      throw new Error(details);
    }

    // Validate using the same normalizer as the existing file-upload workflow.
    const nextEphemeris = normalizeDataset(payload);
    if (nextEphemeris.meta?.frame !== 'IAU_MOON') {
      throw new Error(`Unexpected reference frame: ${nextEphemeris.meta?.frame || 'not specified'}. LUNARA currently expects IAU_MOON.`);
    }
    ephemeris = nextEphemeris;
    dataMode = 'spice';
    updateDataBadge();

    const startDate = new Date(J2000_MS + ephemeris.start * 1000);
    const endDate = new Date(J2000_MS + ephemeris.end * 1000);
    const kernelSummary = (ephemeris.meta?.ephemeris_kernel || 'SPK') +
      ' / ' + (ephemeris.meta?.orientation_constants_kernel || 'PCK');
    if (statusEl) {
      statusEl.textContent = `CONNECTED · ${ephemeris.samples.length} samples · ${ephemeris.meta.frame} · ${kernelSummary}`;
      statusEl.className = 'status-note good';
    }
    showNotice(
      `REAL SPICE DATA: ${ephemeris.samples.length.toLocaleString('en-US')} samples · ${startDate.toISOString()} to ${endDate.toISOString()} · step ${number(ephemeris.step/60,1)} min. ` +
      `Vectors are geometric positions in ${ephemeris.meta.frame}; the existing LUNARA calculations now use these vectors.`,
      'good'
    );
    calculate();
  } catch (error) {
    if (statusEl) {
      statusEl.textContent = `SPICE connection failed: ${error.message}`;
      statusEl.className = 'status-note warn';
    }
    showNotice(`Could not generate SPICE ephemeris: ${error.message}. Check the local Python server and kernel coverage.`, 'warn');
  } finally {
    updateSpiceButton();
  }
}

// Real data -> back to demo; demo + server ready -> connect; server offline -> check again.
$('spiceConnect')?.addEventListener('click', () => {
  if (dataMode === 'spice') $('resetDemo').click();
  else if (spiceService === 'ready') connectLocalSpice();
  else refreshLocalSpiceStatus();
});

refreshLocalSpiceStatus();
