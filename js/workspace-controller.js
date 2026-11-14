// Builds the persistent workspace layout (views, overlays). Runs while the page is parsed.
(() => {
  const app = document.querySelector('.app');
  const workspace = document.getElementById('workspace');
  if (!app || !workspace || document.getElementById('novaViewOverlay')) return;

  const topbar = app.querySelector('.topbar');
  const oldHero = app.querySelector('.hero');
  const oldNav = app.querySelector('.mission-nav');
  const aside = workspace.querySelector(':scope > aside.panel');
  const main = workspace.querySelector(':scope > main.content');
  if (!topbar || !aside || !main) return;

  const visualIntro = main.querySelector('.visual-intro');
  const visuals = main.querySelector('#visuals');
  const kpis = main.querySelector('.kpis');
  const telemetryFold = main.querySelector('#telemetryFold');
  const scenarioFold = main.querySelector('#scenarioFold');
  const integrityFold = main.querySelector('#integrityFold');
  const telemetryBody = telemetryFold?.querySelector('.mission-foldout__content');
  const compare = scenarioFold?.querySelector('#compare');
  const explorer = scenarioFold?.querySelector('#explorer');
  const science = integrityFold?.querySelector('#science');
  const timeControl = telemetryBody?.querySelector('.time-control');

  const observatory = document.createElement('section');
  observatory.className = 'nova-observatory';
  observatory.setAttribute('aria-label', 'Persistent 3D lunar observatory');
  observatory.innerHTML = `
    <div class="nova-observatory-head">
      <div><div class="nova-overline"><i class="nova-live-dot"></i> LIVE MISSION OBSERVATORY</div><h2 class="nova-observatory-title">The lunar theatre</h2></div>
      <span class="nova-stage-tag">3D / ALWAYS ON</span>
    </div>`;
  if (visualIntro) visualIntro.remove();
  if (visuals) observatory.appendChild(visuals);

  // Right column: the data. The most-used controls and results are visible directly;
  // less frequent tools open as focused views (overlay) from the buttons at the bottom.
  // Styles for this column: css/10-data-panel.css. Values are filled in js/ui/render.js.
  const command = document.createElement('main');
  command.className = 'nova-command nova-data';

  // 1. Scenario: the real site/date/window controls, moved here from the setup panel.
  const scenario = document.createElement('section');
  scenario.className = 'nova-card nova-scenario';
  scenario.innerHTML = `
    <div class="nova-card-head"><h2>Scenario</h2><button type="button" class="nova-link" data-open-view="setup">Coordinates, solar panel &amp; data ↗</button></div>
    <div class="nova-scenario-grid"></div>
    <div class="nova-scenario-meta"><span class="nova-coordinate-tag"></span></div>`;
  const scenarioGrid = scenario.querySelector('.nova-scenario-grid');
  for (const id of ['preset', 'date', 'duration']) {
    const field = document.getElementById(id)?.closest('.field');
    if (field) scenarioGrid.appendChild(field);
  }
  const activeCoords = scenario.querySelector('.nova-coordinate-tag');
  const syncActiveScenario = () => {
    const lat = Number(document.getElementById('lat')?.value || 0);
    const lon = Number(document.getElementById('lon')?.value || 0);
    activeCoords.textContent = `${Math.abs(lat).toFixed(2)}°${lat < 0 ? 'S' : 'N'} · ${Math.abs(lon).toFixed(2)}°${lon < 0 ? 'W' : 'E'}`;
  };
  command.appendChild(scenario);

  // 2. Results over the whole window.
  const summary = document.createElement('section');
  summary.className = 'nova-card nova-summary';
  summary.innerHTML = `
    <div class="nova-card-head"><h2>Over the whole window</h2><span class="nova-card-note" id="winRange"></span></div>
    <div class="nova-summary-grid">
      <div class="nova-stat nova-stat--sun"><span class="nova-stat-label">☀ Sun visible</span><strong id="winSun">—</strong><span class="nova-stat-sub" id="winSunPct">—</span><div class="nova-meter"><i id="winSunBar"></i></div><span class="nova-stat-next" id="winSunNext">—</span></div>
      <div class="nova-stat nova-stat--earth"><span class="nova-stat-label">◉ Earth in view</span><strong id="winEarth">—</strong><span class="nova-stat-sub" id="winEarthPct">—</span><div class="nova-meter"><i id="winEarthBar"></i></div><span class="nova-stat-next" id="winEarthNext">—</span></div>
      <div class="nova-stat nova-stat--power"><span class="nova-stat-label">⚡ Peak solar power</span><strong id="winPower">—</strong><span class="nova-stat-sub" id="winPowerSub">—</span><div class="nova-meter"><i id="winPowerBar"></i></div><span class="nova-stat-next" id="winPowerNext">—</span></div>
    </div>`;
  command.appendChild(summary);

  // 3. Sun/Earth bars over time + the time scrubber (moved out of the telemetry view).
  const timelineEl = telemetryBody?.querySelector('#timeline');
  const timeCard = document.createElement('section');
  timeCard.className = 'nova-card nova-time-card';
  timeCard.innerHTML = `<div class="nova-card-head"><h2>When is there Sun and Earth?</h2><span class="nova-card-note">Drag the slider or press play</span></div>`;
  if (timelineEl) timeCard.appendChild(timelineEl);
  if (timeControl) timeCard.appendChild(timeControl);
  telemetryBody?.querySelector('#windows')?.remove();
  command.appendChild(timeCard);

  // 4. Instant readings at the slider position.
  const metricsLabel = document.createElement('div');
  metricsLabel.className = 'nova-section-label';
  metricsLabel.innerHTML = `<strong>At the selected time</strong>`;
  if (kpis) { command.appendChild(metricsLabel); command.appendChild(kpis); }

  // 5. Less frequent tools, each in its own focused view.
  const launchers = document.createElement('section');
  launchers.className = 'nova-workspaces';
  launchers.innerHTML = `
    <div class="nova-section-label"><strong>More tools</strong></div>
    <div class="nova-workspace-grid">
      <button class="nova-launcher" type="button" data-open-view="setup"><span class="nova-launcher-icon">⌘</span><span class="nova-launcher-copy"><strong>Site details &amp; data</strong><small>Coordinates · solar panel · SPICE · terrain</small></span><span class="nova-launcher-arrow">↗</span></button>
      <button class="nova-launcher" type="button" data-open-view="telemetry"><span class="nova-launcher-icon">⌁</span><span class="nova-launcher-copy"><strong>Detailed telemetry</strong><small>Elevation chart · exact angles</small></span><span class="nova-launcher-arrow">↗</span></button>
      <button class="nova-launcher" type="button" data-open-view="comparison"><span class="nova-launcher-icon">⇄</span><span class="nova-launcher-copy"><strong>Compare scenarios</strong><small>Up to four sites or dates</small></span><span class="nova-launcher-arrow">↗</span></button>
      <button class="nova-launcher" type="button" data-open-view="explorer"><span class="nova-launcher-icon">⌖</span><span class="nova-launcher-copy"><strong>Find sites</strong><small>Search candidate locations</small></span><span class="nova-launcher-arrow">↗</span></button>
      <button class="nova-launcher" type="button" data-open-view="science"><span class="nova-launcher-icon">∿</span><span class="nova-launcher-copy"><strong>Limitations</strong><small>Data sources · assumptions</small></span><span class="nova-launcher-arrow">↗</span></button>
    </div>`;
  command.appendChild(launchers);

  workspace.replaceChildren(observatory, command);
  workspace.classList.remove('grid');
  workspace.classList.add('nova-grid');

  const overlay = document.createElement('div');
  overlay.className = 'nova-view-overlay';
  overlay.id = 'novaViewOverlay';
  overlay.setAttribute('aria-hidden', 'true');
  overlay.setAttribute('role', 'presentation');
  const viewsHost = document.createElement('div');
  viewsHost.className = 'nova-view-host';
  viewsHost.style.cssText = 'display:flex;flex:1;min-width:0;min-height:0;width:100%;height:100%';
  overlay.appendChild(viewsHost);

  const viewDefinitions = [
    ['setup', 'Mission setup', 'Configure the active site, planning window, solar array and scientific data.', aside],
    ['telemetry', 'Mission telemetry', 'Inspect solar and Earth geometry, elevation curves and opportunity windows.', telemetryBody],
    ['comparison', 'Scenario comparison lab', 'A dedicated workspace for comparing saved landing-site and date scenarios.', compare],
    ['explorer', 'Polar site explorer', 'Screen candidate locations using the currently loaded ephemeris and geometric filters.', explorer],
    ['science', 'Model integrity', 'Understand provenance, assumptions and scientific limitations behind the results.', science]
  ];
  const viewMap = new Map();
  for (const [key, title, subtitle, content] of viewDefinitions) {
    if (!content) continue;
    const view = document.createElement('section');
    view.className = 'nova-view';
    view.dataset.view = key;
    const header = document.createElement('header');
    header.className = 'nova-view-header';
    const copy = document.createElement('div');
    copy.innerHTML = `<div class="nova-view-overline">LUNARA / WORKSPACE</div><h2>${title}</h2><p>${subtitle}</p>`;
    const close = document.createElement('button');
    close.type = 'button'; close.className = 'nova-close'; close.innerHTML = `<span>←</span> BACK TO OBSERVATORY`;
    close.addEventListener('click', closeView);
    header.append(copy, close);
    const scroll = document.createElement('div');
    scroll.className = 'nova-view-scroll';
    if (key === 'telemetry') {
      // Keep the original metric cards, chart and visibility timeline together.
      scroll.appendChild(content);
    } else {
      scroll.appendChild(content);
    }
    view.append(header, scroll);
    viewsHost.appendChild(view);
    viewMap.set(key, view);
  }
  app.appendChild(overlay);

  // Remove superseded wrappers only after their functional children have been moved.
  telemetryFold?.remove();
  scenarioFold?.remove();
  integrityFold?.remove();
  main.remove();
  // The original controls aside has already been moved into the Setup view.
  oldHero?.remove();
  if (oldNav) oldNav.setAttribute('aria-hidden', 'true');

  let activeLauncher = null;
  function openView(key, launcher) {
    const view = viewMap.get(key);
    if (!view) return;
    for (const v of viewMap.values()) v.classList.toggle('is-active', v === view);
    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('nova-view-open');
    activeLauncher = launcher || null;
    overlay.querySelector('.nova-close')?.focus({preventScroll:true});
  }
  function closeView() {
    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('nova-view-open');
    for (const v of viewMap.values()) v.classList.remove('is-active');
    activeLauncher?.focus?.({preventScroll:true});
    activeLauncher = null;
  }
  command.querySelectorAll('[data-open-view]').forEach(button => {
    button.addEventListener('click', () => openView(button.dataset.openView, button));
  });
  overlay.addEventListener('click', event => { if (event.target === overlay) closeView(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && overlay.classList.contains('is-open')) closeView(); });

  syncActiveScenario();
  document.getElementById('siteName')?.addEventListener('input', syncActiveScenario);
  document.getElementById('lat')?.addEventListener('input', syncActiveScenario);
  document.getElementById('lon')?.addEventListener('input', syncActiveScenario);
  document.getElementById('preset')?.addEventListener('change', () => requestAnimationFrame(syncActiveScenario));
  document.getElementById('calculate')?.addEventListener('click', () => requestAnimationFrame(syncActiveScenario));
})();
