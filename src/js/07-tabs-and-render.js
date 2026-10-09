// ==== Tab registry and the main render loop ====
//
// TABS: ordered list of top-level tabs. `id` matches the data-tab-panel / data-tab-btn attributes
// and the block*/wire*/render* function families. An optional `when()` hides a tab unless it
// returns true (e.g. 'run' only exists while the save is paused mid-run).
const TABS = [ {
  id: 'account',
  label: 'Account'
}, {
  id: 'fighters',
  label: 'Fighters'
}, {
  id: 'layouts',
  label: 'Layouts'
}, {
  id: 'research',
  label: 'Research'
}, {
  id: 'decals',
  label: 'Decals'
}, {
  id: 'stews',
  label: 'Stews'
}, {
  id: 'bags',
  label: 'Mystery Bags'
}, {
  id: 'boxes',
  label: 'Death Boxes'
}, {
  id: 'hub',
  label: 'Waiting Room'
}, {
  id: 'defense',
  label: 'Defense'
}, {
  id: 'photos',
  label: 'Screenshots'
}, {
  id: 'graves',
  label: 'Dead Fighters'
}, {
  id: 'dates',
  label: 'Dates'
}, {
  id: 'storage',
  label: 'Storage'
}, {
  id: 'rewards',
  label: 'Rewards'
}, {
  id: 'quests',
  label: 'Quests'
}, {
  id: 'rally',
  label: 'Stamp Rally'
}, {
  id: 'location',
  label: 'Location'
}, {
  id: 'run',
  label: 'Current Run',
  when: () => !!runData()
}, {
  id: 'collection',
  label: 'Collection'
}, {
  id: 'jackals',
  label: 'Jackals'
}, {
  id: 'stats',
  label: 'Stats'
}, {
  id: 'vip',
  label: 'VIP'
}, {
  id: 'compare',
  label: 'Compare'
}, {
  id: 'raw',
  label: 'Raw data'
}, {
  id: 'jdiff',
  label: 'JSON compare (advanced)'
} ];

// Currently shown tab id; renderAll() falls back to 'account' if that tab's when() turns false.
let activeTab = 'account';

// renderAll(): rebuilds the whole UI from SAVE.
// Every tab panel is rendered up front (non-active ones are display:none), then each wire*()
// function attaches its event listeners to the fresh DOM. Because the DOM is thrown away on every
// call, the page scroll position and any scrolled element with an id are captured first and
// restored at the end. Heavy tabs (stews, dates, quests, ...) are additionally (re)rendered by
// their render*() function when their tab button is clicked.
// Call this after any change to SAVE that should be reflected in the UI.
function renderAll() {
  const app = document.getElementById('app');
  // remember scroll positions so the full innerHTML rebuild below does not jump the page
  const pageScrollY = window.scrollY;
  const scrollStates = {};
  app.querySelectorAll('[id]').forEach(el => {
    if (el.scrollTop > 0) scrollStates[el.id] = el.scrollTop;
  });
  // if the active tab has a when() that is now false (e.g. run ended), fall back to Account
  if (TABS.some(t => t.id === activeTab && t.when && !t.when())) activeTab = 'account';
  // one panel per tab; the markup comes from the block*() HTML builders
  app.innerHTML = `\n    ${blockHealth()}\n    ${uiTabbarHtml()}\n    <div class="tabpanel" data-tab-panel="account" style="display:${activeTab === 'account' ? 'block' : 'none'}">${blockCurrency()}</div>\n    <div class="tabpanel" data-tab-panel="fighters" style="display:${activeTab === 'fighters' ? 'block' : 'none'}">${blockCharacters()}${blockSkins()}</div>\n    <div class="tabpanel" data-tab-panel="research" style="display:${activeTab === 'research' ? 'block' : 'none'}">${blockBlueprints()}</div>\n    <div class="tabpanel" data-tab-panel="decals" style="display:${activeTab === 'decals' ? 'block' : 'none'}">${blockSkillDecals()}</div>\n    <div class="tabpanel" data-tab-panel="stews" style="display:${activeTab === 'stews' ? 'block' : 'none'}">${blockStews()}</div>\n    <div class="tabpanel" data-tab-panel="bags" style="display:${activeTab === 'bags' ? 'block' : 'none'}">${blockBags()}</div>\n    <div class="tabpanel" data-tab-panel="boxes" style="display:${activeTab === 'boxes' ? 'block' : 'none'}">${blockBoxes()}</div>\n    <div class="tabpanel" data-tab-panel="hub" style="display:${activeTab === 'hub' ? 'block' : 'none'}">${blockHub()}</div>\n    <div class="tabpanel" data-tab-panel="defense" style="display:${activeTab === 'defense' ? 'block' : 'none'}">${blockDefense()}</div>\n    <div class="tabpanel" data-tab-panel="photos" style="display:${activeTab === 'photos' ? 'block' : 'none'}">${blockPhotos()}</div>\n    <div class="tabpanel" data-tab-panel="graves" style="display:${activeTab === 'graves' ? 'block' : 'none'}">${blockGraves()}</div>\n    <div class="tabpanel" data-tab-panel="dates" style="display:${activeTab === 'dates' ? 'block' : 'none'}">${blockDates()}</div>\n    <div class="tabpanel" data-tab-panel="storage" style="display:${activeTab === 'storage' ? 'block' : 'none'}">${blockStorageBox()}</div>\n    <div class="tabpanel" data-tab-panel="rewards" style="display:${activeTab === 'rewards' ? 'block' : 'none'}">${blockRewardBox()}</div>\n    <div class="tabpanel" data-tab-panel="quests" style="display:${activeTab === 'quests' ? 'block' : 'none'}">${blockQuests()}</div>\n    <div class="tabpanel" data-tab-panel="rally" style="display:${activeTab === 'rally' ? 'block' : 'none'}">${blockRally()}</div>\n    <div class="tabpanel" data-tab-panel="location" style="display:${activeTab === 'location' ? 'block' : 'none'}">${blockLocation()}</div>\n    <div class="tabpanel" data-tab-panel="run" style="display:${activeTab === 'run' ? 'block' : 'none'}">${blockRun()}</div>\n    <div class="tabpanel" data-tab-panel="collection" style="display:${activeTab === 'collection' ? 'block' : 'none'}">${blockCollection()}</div>\n    <div class="tabpanel" data-tab-panel="jackals" style="display:${activeTab === 'jackals' ? 'block' : 'none'}">${blockJackals()}</div>\n    <div class="tabpanel" data-tab-panel="layouts" style="display:${activeTab === 'layouts' ? 'block' : 'none'}">${blockLayouts()}</div>\n    <div class="tabpanel" data-tab-panel="stats" style="display:${activeTab === 'stats' ? 'block' : 'none'}">${blockStats()}</div>\n    <div class="tabpanel" data-tab-panel="vip" style="display:${activeTab === 'vip' ? 'block' : 'none'}">${blockVip()}${blockFreeCont()}</div>\n    <div class="tabpanel" data-tab-panel="compare" style="display:${activeTab === 'compare' ? 'block' : 'none'}">${blockCompare()}</div>\n    <div class="tabpanel" data-tab-panel="raw" style="display:${activeTab === 'raw' ? 'block' : 'none'}">${blockRaw()}</div>\n    <div class="tabpanel" data-tab-panel="jdiff" style="display:${activeTab === 'jdiff' ? 'block' : 'none'}">${blockJd()}</div>\n  `;
  // attach listeners; the order is not significant, each wire* only touches its own tab's DOM
  wireHealth();
  wireCurrency();
  wireCharacters();
  wireBlueprints();
  wireSkillDecals();
  wireStews();
  wireBags();
  wireBoxes();
  wireHub();
  wireDefense();
  wirePhotos();
  wireGraves();
  wireDates();
  wireStorageBox();
  wireRewardBox();
  wireQuests();
  wireRally();
  wireLocation();
  wireRun();
  wireCollection();
  wireStats();
  wireLayouts();
  wireJackals();
  wireVip();
  wireFreeCont();
  wireFsec();
  wireCompare();
  wireRaw();
  wireJd();
  // tab buttons: switch the visible panel, then lazily run that tab's render*() for dynamic content
  document.querySelectorAll('[data-tab-btn]').forEach(btn => {
    btn.addEventListener('click', () => {
      activeTab = btn.dataset.tabBtn;
      document.querySelectorAll('[data-tab-btn]').forEach(b => b.classList.toggle('active', b.dataset.tabBtn === activeTab));
      document.querySelectorAll('[data-tab-panel]').forEach(p => {
        p.style.display = p.dataset.tabPanel === activeTab ? 'block' : 'none';
      });
      if (activeTab === 'stews') renderStewReport();
      if (activeTab === 'dates') renderDates();
      if (activeTab === 'quests') renderQuests();
      if (activeTab === 'rally') renderRally();
      if (activeTab === 'location') renderLocation();
      if (activeTab === 'run') renderRun();
      if (activeTab === 'collection') renderCollection();
      if (activeTab === 'stats') renderStats();
      if (activeTab === 'layouts') renderLayouts();
      if (activeTab === 'jackals') renderJackals();
      if (activeTab === 'bags') renderBags();
      if (activeTab === 'boxes') renderBoxes();
      if (activeTab === 'hub') renderHub();
      if (activeTab === 'defense') renderDefense();
      if (activeTab === 'photos') renderPhotos();
      if (activeTab === 'graves') renderGraves();
      if (activeTab === 'compare') renderCompare();
      if (activeTab === 'raw') renderRaw();
      if (activeTab === 'jdiff') renderJd();
      uiTabChanged();
      window.scrollTo(0, 0);
    });
  });
  // restore the scroll positions captured at the top
  window.scrollTo(0, pageScrollY);
  for (const id in scrollStates) {
    const el = document.getElementById(id);
    if (el) el.scrollTop = scrollStates[id];
  }
  uiAfterRender();
}

