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
  // Left column: only the two 3D views (titles are small labels on the image to give them all the height).
  if (visualIntro) visualIntro.remove();
  if (visuals) observatory.appendChild(visuals);
  // ⤢ button on each view: expands it to the whole screen (Esc or the button again to close).
  // The scenes watch their container size, so Three.js re-renders at the new size automatically.
  const expandedPanel = () => visuals?.querySelector('.panel.is-expanded');
  const setExpanded = (panel, on) => {
    panel.classList.toggle('is-expanded', on);
    document.body.classList.toggle('nova-view-expanded', on);
    const button = panel.querySelector('.nova-expand');
    button.textContent = on ? '✕' : '⤢';
    button.setAttribute('aria-label', on ? 'Close full screen' : 'Expand to full screen');
  };
  visuals?.querySelectorAll(':scope > .panel').forEach(panel => {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'nova-expand'; button.textContent = '⤢';
    button.setAttribute('aria-label', 'Expand to full screen'); button.title = 'Full screen';
    button.addEventListener('click', () => {
      const open = expandedPanel();
      if (open && open !== panel) setExpanded(open, false);
      setExpanded(panel, !panel.classList.contains('is-expanded'));
    });
    panel.querySelector('.scene-wrap')?.appendChild(button);
  });
  document.addEventListener('keydown', event => {
    const open = expandedPanel();
    if (event.key === 'Escape' && open) setExpanded(open, false);
  });

  // Right column: the data. The most-used controls and results are visible directly;
  // less frequent tools open as focused views (overlay) from the buttons at the bottom.
  // Styles for this column: css/10-data-panel.css. Values are filled in js/ui/render.js.
  const command = document.createElement('main');
  command.className = 'nova-command nova-data';

  // 1. Scenario: the real site/date/window controls, moved here from the setup panel.
  const scenario = document.createElement('section');
  scenario.className = 'nova-card nova-scenario';
  scenario.innerHTML = `
    <div class="nova-card-head"><h2>Scenario</h2>
      <div class="nova-card-actions"><button type="button" class="btn ghost small" id="mainAddCompare">＋ Add to comparison</button><button type="button" class="btn primary small" data-open-view="comparison">⇄ Compare <span id="compareBadge">0/4</span></button></div>
    </div>
    <div class="nova-scenario-grid"></div>
    <details class="nova-more">
      <summary><span class="nova-coordinate-tag"></span><span class="nova-more-toggle">More options</span></summary>
      <div class="nova-more-body">
        <section class="nova-more-group" data-group="site"><h3>Site coordinates</h3></section>
        <section class="nova-more-group" data-group="panel"><h3>Solar panel</h3></section>
        <section class="nova-more-group" data-group="comms"><h3>Communications</h3>
          <div class="field-row">
            <div class="field"><label for="commsBand">Band</label><select id="commsBand"><option value="S">S · 2.2 GHz</option><option value="X" selected>X · 8.4 GHz</option><option value="Ka">Ka · 32 GHz</option></select></div>
            <div class="field"><label for="commsDish">DSN antenna</label><select id="commsDish"><option value="34" selected>34 m</option><option value="70">70 m</option></select></div>
          </div>
          <div class="field-row">
            <div class="field"><label for="commsPower">Lander power (W)</label><input id="commsPower" type="number" min="0.1" max="500" step="0.1" value="10"></div>
            <div class="field"><label for="commsGain">Lander antenna (dBi)</label><input id="commsGain" type="number" min="-5" max="45" step="0.5" value="10"></div>
          </div>
          <div class="field-note">Downlink lander → DSN, theoretical maximum data rate.</div>
        </section>
        <section class="nova-more-group nova-more-group--wide" data-group="data"><h3>Data source</h3></section>
      </div>
    </details>`;
  const scenarioGrid = scenario.querySelector('.nova-scenario-grid');
  for (const id of ['preset', 'date', 'duration']) {
    const field = document.getElementById(id)?.closest('.field');
    if (field) scenarioGrid.appendChild(field);
  }
  // "More options": the real inputs, moved here from the old setup panel (IDs and listeners unchanged).
  const moveInto = (group, nodes) => {
    const host = scenario.querySelector(`[data-group="${group}"]`);
    nodes.filter(Boolean).forEach(node => host.appendChild(node));
  };
  const fieldOf = id => document.getElementById(id)?.closest('.field');
  moveInto('site', [fieldOf('siteName'), document.getElementById('lat')?.closest('.field-row'), fieldOf('alt')]);
  moveInto('panel', [document.getElementById('tilt')?.closest('.field-row'), fieldOf('efficiency')]);
  moveInto('data', [document.getElementById('spiceBridge'), fieldOf('dataFile'), fieldOf('horizonFile'),
    document.getElementById('resetDemo')?.closest('.btn-row'), document.getElementById('dataMessage'), document.getElementById('terrainMessage')]);
  scenario.querySelector('#mainAddCompare')?.addEventListener('click', () => document.getElementById('addCompare')?.click());
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
    </div>
    <details class="nova-extra">
      <summary>
        <span class="nova-extra__item">🌑 Longest night <b id="winNightShort">—</b></span>
        <span class="nova-extra__item">📡 Longest without contact <b id="winNoLinkShort">—</b></span>
        <span class="nova-more-toggle">Details</span>
      </summary>
      <div class="nova-extra-grid">
        <div class="nova-mini"><span>🌑 Longest night</span><strong id="winNight">—</strong><small id="winNightSub">without direct sunlight</small></div>
        <div class="nova-mini"><span>📡 Longest without contact</span><strong id="winNoLink">—</strong><small>no direct link to Earth (DSN)</small></div>
        <div class="nova-mini"><span>☀◉ Sun + Earth together</span><strong id="winSunEarth">—</strong><small id="winSunEarthSub">—</small></div>
        <div class="nova-mini"><span>☀ Longest continuous sun</span><strong id="winLongDay">—</strong><small>longest single sunlit period</small></div>
      </div>
      <p class="nova-extra__note">“≥” means the period touches the start or end of the window, so it may be longer.</p>
    </details>`;
  command.appendChild(summary);

  // 3. 2D sky around the site (js/ui/horizon-2d.js) + compact Sun/Earth bars + the time scrubber.
  const timelineEl = telemetryBody?.querySelector('#timeline');
  const timeCard = document.createElement('section');
  timeCard.className = 'nova-card nova-time-card';
  timeCard.innerHTML = `<div class="nova-card-head"><h2>Sky around the site</h2><span class="nova-card-note">Faded dots = hidden</span></div>
    <div class="nova-h2d" id="horizon2d"></div>`;
  if (timelineEl) { timelineEl.classList.add('timeline--compact'); timeCard.appendChild(timelineEl); }
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
      <button class="nova-launcher" type="button" data-open-view="telemetry"><span class="nova-launcher-icon">⌁</span><span class="nova-launcher-copy"><strong>Detailed telemetry</strong><small>Elevation chart · exact angles</small></span><span class="nova-launcher-arrow">↗</span></button>
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
    ['comparison', 'Compare scenarios', 'Up to four sites or dates side by side.', compare],
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
    overlay.classList.toggle('is-wide', key === 'comparison'); // the comparison uses the full screen
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
