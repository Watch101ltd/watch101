/* ============================================================================
   phood-engine.js — the PHOOD page's brains, split out of index.html on
   2026-08-14 (the Dude's call, baseball's MULTI_FILE_PUSH_V1 pattern) so both
   halves stay under the Rule #7 large-file line and have room to grow.
   Contains: the engine (lists, render, sort, filters, NAS save/load),
   READONLY_V1/V2, TIERS_V1 Stage 1+2 (ported from the twins), 
   PHOOD_DRAG_RANK_V1 + DRAG_POLISH_V1, and SPOT_EDITOR_V1.
   Loaded by phood/index.html via <script src="phood-engine.js">.
   Pushed to GitHub as its own file — it is in the Push ALL list.
   ============================================================================ */
/* ============================================================================
   PHOOD ENGINE v3 (2026-08-14) — twins-shaped so baseball's ported code runs
   unmodified. Same names the sports pages use: _watchList, _playerDB,
   renderWatchList, _sortField, #player-search, _wlFilterActive, and rows carry
   data-phood-pid the way NBA rows carry data-nba-pid.
   Persistence: localStorage for now; autoSaveToPhoodNAS becomes the server
   POST when PHOOD gets its server, same road the twins took.
   ============================================================================ */
/* MULTILIST — baseball's separate-lists model. Storage and tiers key on the
   active list id, so every list carries its own spots AND its own tiers. */
var WL_LISTS = [
  { id:'phood-restaurants', title:'PHOOD Restaurants',       subtitle:'Philadelphia proper — ones to watch',
    tabs:[{cat:'all',label:'All'},{cat:'rest',label:'🍽️ Restaurants'},{cat:'dess',label:'🍰 Desserts'}] },
  { id:'phood-bars',        title:'PHOOD Bars & Breweries',  subtitle:'The wider net — worth the drive',
    tabs:[{cat:'all',label:'All'}] }
];
var currentListId = 'phood-restaurants';
function _wlStorageKey(){ return 'phood_watchlist_' + currentListId; }
/* PHOOD_NAS_V1 (2026-08-14) — the plumbing. Same shape as the twins:
   SERVER_URL points at the PHOOD container on the Synology (port 5104)
   through the Cloudflare tunnel. Saves POST to /list-staging/:listId;
   admin loads read _Staging, fans read Production. localStorage stays
   as the offline fallback so the page never comes up empty. */
var SERVER_URL = 'https://phood-nas.fantasywatch101.com';

var PHOOD_SEEDS = {};
PHOOD_SEEDS['phood-restaurants'] = [
  {pid:'r1',  stars:5, cat:'rest', name:"Kalaya",               vibe:'🔥🥇', hood:'Fishtown',           addr:'TBD'},
  {pid:'r2',  stars:5, cat:'rest', name:"Zahav",                vibe:'🥇',   hood:'Society Hill',       addr:'TBD'},
  {pid:'r3',  stars:4, cat:'rest', name:"Angelo's Pizzeria",    vibe:'🔥💰', hood:'Bella Vista',        addr:'TBD'},
  {pid:'r4',  stars:4, cat:'rest', name:"Laser Wolf",           vibe:'🔥',   hood:'Kensington',         addr:'TBD'},
  {pid:'r5',  stars:4, cat:'rest', name:"John's Roast Pork",    vibe:'💰🥇', hood:'South Philly',       addr:'TBD'},
  {pid:'r6',  stars:4, cat:'rest', name:"Suraya",               vibe:'🍸',   hood:'Fishtown',           addr:'TBD'},
  {pid:'r7',  stars:3, cat:'rest', name:"Vernick Food & Drink", vibe:'🍸',   hood:'Rittenhouse',        addr:'TBD'},
  {pid:'r12', stars:4, cat:'dess', name:"Franklin Fountain",    vibe:'🍰',   hood:'Old City',           addr:'TBD'},
  {pid:'r13', stars:4, cat:'dess', name:"John's Water Ice",     vibe:'🍰💰', hood:'Bella Vista',        addr:'TBD'},
  {pid:'r14', stars:3, cat:'dess', name:"Termini Bros",         vibe:'🍰',   hood:'South Philly',       addr:'TBD'}
];
PHOOD_SEEDS['phood-bars'] = [
  {pid:'r8',  stars:4, cat:'bar',  name:"Monk's Café",          vibe:'🍺🌙', hood:'Rittenhouse',        addr:'TBD'},
  {pid:'r9',  stars:4, cat:'bar',  name:"Human Robot",          vibe:'🍺🆕', hood:'Kensington',         addr:'TBD'},
  {pid:'r10', stars:3, cat:'bar',  name:"Yards Brewing Co.",    vibe:'🍺',   hood:'Northern Liberties', addr:'TBD'},
  {pid:'r11', stars:3, cat:'bar',  name:"Victory Brewing",      vibe:'🍺',   hood:'Downingtown (worth the drive)', addr:'TBD'}
];
var PHOOD_SEED_TIERS = {};
PHOOD_SEED_TIERS['phood-restaurants'] = [
  {id:'tier_seed_1', name:'The Main List — Ones to Watch', color:'red',  start_pid:'r1',  end_pid:'r7',  created_at:'2026-08-14'},
  {id:'tier_seed_3', name:'Killer Desserts & Ice Cream',   color:'blue', start_pid:'r12', end_pid:'r14', created_at:'2026-08-14'}
];
PHOOD_SEED_TIERS['phood-bars'] = [
  {id:'tier_seed_2', name:'The Wider Net', color:'gold', start_pid:'r8', end_pid:'r11', created_at:'2026-08-14'}
];

let _watchList = [];
let _playerDB = {};          // pid -> {full_name} so the ported tier modal reads names unmodified
var _sortField = null;
var _sortDir = 1;
var _filterCat = 'all';
function _wlFilterActive(){ return _filterCat !== 'all'; }

function _setStamp(txt, ok){
  var el = document.getElementById('list-stamp');
  if(el){ el.textContent = txt; el.style.color = ok ? 'var(--turquoise2)' : 'var(--red)'; }
}
async function autoSaveToPhoodNAS(){
  /* Mirror to localStorage FIRST so nothing is ever lost if the POST fails. */
  try { localStorage.setItem(_wlStorageKey(), JSON.stringify(_watchList)); } catch(e){}
  try { localStorage.setItem(_tiersLsKey(), JSON.stringify(Array.isArray(currentTiers) ? currentTiers : [])); } catch(e){}
  try {
    var body = { spots: _watchList, tiers: (typeof _tiersForSave === 'function') ? _tiersForSave() : (currentTiers || []) };
    var res = await fetch(SERVER_URL + '/list-staging/' + currentListId, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if(res.ok){
      var j = await res.json();
      _setStamp('Saved to NAS ' + new Date().toLocaleTimeString() + ' (' + (j.spot_count != null ? j.spot_count : _watchList.length) + ' spots)', true);
    } else {
      _setStamp('NAS save failed (' + res.status + ') — kept in this browser', false);
    }
  } catch(e){
    _setStamp('NAS unreachable — kept in this browser', false);
    console.warn('[PHOOD_NAS_V1] save failed:', e);
  }
}
async function loadListFromStorage(){
  var list = null, tiers = null, stamp = null;
  /* NAS first — admin (staging host) reads _Staging, fans read Production.
     Same law as the twins: what fans see is what the Dude promoted. */
  var isFan = (typeof _isReadOnlyMode === 'function') && _isReadOnlyMode();
  var route = isFan ? '/list/' : '/list-staging/';
  try {
    var res = await fetch(SERVER_URL + route + currentListId);
    if(res.ok){
      var payload = await res.json();
      var d = payload && payload.data;
      if(d && Array.isArray(d.spots) && d.spots.length){
        list = d.spots;
        if(Array.isArray(d.tiers)) tiers = d.tiers;
        /* STAMP_TZ_V1 (2026-08-14): format the save time CLIENT-side from the ISO
           stamp so it reads in the viewer's timezone — the container's clock is UTC
           and its saved_at_local was showing four hours ahead of the Dude's wall. */
        var _when = '?';
        try { if(payload.saved_at || d.saved_at) _when = new Date(payload.saved_at || d.saved_at).toLocaleString(); } catch(e){}
        stamp = 'Loaded from NAS (' + (payload.environment || '?') + ', saved ' + _when + ')';
      }
    }
  } catch(e){ console.warn('[PHOOD_NAS_V1] NAS load failed, falling back:', e); }
  /* localStorage fallback */
  if(!list){
    try { var raw = localStorage.getItem(_wlStorageKey()); if(raw){ var a = JSON.parse(raw); if(Array.isArray(a) && a.length) list = a; } } catch(e){}
    if(list) stamp = 'Loaded from this browser — NAS not reached';
  }
  if(!tiers){
    try { var rawT = localStorage.getItem(_tiersLsKey()); if(rawT){ var t = JSON.parse(rawT); if(Array.isArray(t) && t.length) tiers = t; } } catch(e){}
  }
  /* seeds last, so the page never comes up empty */
  var seedL = PHOOD_SEEDS[currentListId] || [];
  var seedT = PHOOD_SEED_TIERS[currentListId] || [];
  _watchList = list || seedL.map(function(p){ return Object.assign({}, p); });
  currentTiers = tiers || seedT.map(function(t){ return Object.assign({}, t); });
  _playerDB = {};
  /* PHOOD_TAGS_V1: legacy emoji strings become tag ids here, once, on the way in. */
  _watchList.forEach(function(p){ _migrateVibeToTags(p); _playerDB[p.pid] = { full_name: p.name }; });
  _setStamp(stamp || 'Sample data — not yet saved', true);
}

/* WL_NOTES_V1 ported (2026-08-14) — the twins' live note column, adapted to
   PHOOD's field: the note IS Matt's Take (item.take), the same field the spot
   editor modal writes. Two doors, one truth. URL pasted inside a take becomes
   a 🔗 badge (twins' _splitNoteAndUrl, verbatim); fresh takes wear a 📝 badge
   for 48 hours (NEW_NOTE_48H_V1, stamp take_saved_at, pure read-time math).
   Deviation, deliberate: saving a take hits the NAS immediately — PHOOD's law. */
function _splitNoteAndUrl(noteText){
  if(noteText == null) return { text: '', url: null };
  var t = String(noteText);
  var m = t.match(/https?:\/\/[^\s<>"'`]+/);
  if(!m) return { text: t, url: null };
  var url = m[0];
  url = url.replace(/[.,;:!?)\]}]+$/, '');
  var stripped = t.replace(url, '').replace(/\s+/g, ' ').trim();
  return { text: stripped, url: url };
}
function _renderNoteLinkBadge(url){
  if(!url) return '';
  var safeUrl = String(url).replace(/"/g, '&quot;');
  return ' <a class="note-link-badge" href="' + safeUrl + '" target="_blank" rel="noopener noreferrer"'
       + ' onclick="event.stopPropagation();" title="' + safeUrl + '" role="button">&#128279;</a>';
}
function _freshTakeBadge(p){
  /* NEW_NOTE_48H_V1: badge lives while the stamp is under 48h, expires by math alone. */
  if(!p || !p.take_saved_at) return '';
  if((Date.now() - p.take_saved_at) > 48 * 60 * 60 * 1000) return '';
  return ' <span class="note-badge" title="Matt\'s take updated in the last 48 hours">&#128221;</span>';
}
function _takeCellHtml(p){
  var raw = (p && typeof p.take === 'string') ? p.take : '';
  var ro = (typeof _isReadOnlyMode === 'function') && _isReadOnlyMode();
  var onclick = ro ? '' : ' onclick="event.stopPropagation();editTake(&quot;' + _esc(p.pid) + '&quot;, this)"';
  if(!raw.trim()){
    if(ro) return '<td class="l take placeholder">—</td>';   /* fans see a quiet dash, no invitation */
    return '<td class="l take wl-note-cell placeholder" title="Click to add Matt\'s take"' + onclick + '><em class="note-add-hint">Add Matt\'s take...</em></td>';
  }
  var sp = _splitNoteAndUrl(raw);
  return '<td class="l take wl-note-cell"' + (ro ? '' : ' title="Click to edit this take"') + onclick + '>' + _esc(sp.text) + _renderNoteLinkBadge(sp.url) + '</td>';
}
function editTake(pid, el){
  if(_blockIfReadOnly('editTake')) return;
  var idx = _wlIndexOf(pid);
  if(idx < 0) return;
  var input = document.createElement('input');
  input.type = 'text';
  input.className = 'note-input';
  input.value = _watchList[idx].take || '';
  input.placeholder = 'Why is this spot on the list?';
  el.replaceWith(input);
  input.focus();
  input.addEventListener('blur', function(){ _setTake(pid, input.value); });
  input.addEventListener('keydown', function(e){ if(e.key === 'Enter') input.blur(); });
  input.addEventListener('click', function(e){ e.stopPropagation(); });
}
function _setTake(pid, text){
  if(_blockIfReadOnly('_setTake')) return;
  var idx = _wlIndexOf(pid);
  if(idx < 0) return;
  var cur = _watchList[idx];
  var prev = (cur && cur.take != null) ? String(cur.take) : '';
  var next = String(text || '');
  _watchList[idx] = Object.assign({}, cur, { take: next });
  /* stamp only when the text actually changes; clearing the take clears the stamp */
  if(next.trim() && next !== prev){ _watchList[idx].take_saved_at = Date.now(); }
  else if(!next.trim()){ delete _watchList[idx].take_saved_at; }
  renderWatchList();
  autoSaveToPhoodNAS();
}

/* PRIORITY_STARS_V1 (2026-08-14) — ported from the twins' renderPriorityStars +
   setPriority + global .pstar click delegator. Adaptations: the value lives in
   item.stars (PHOOD's field), and a set SAVES to the NAS immediately — every
   other PHOOD mutation saves on the spot, stars should not be the odd one out.
   Same-value click clears to zero, the twins' law. */
function renderPriorityStars(pid, currentPriority){
  var html = '<span class="priority-stars" data-pid="' + _esc(pid) + '">';
  for(var n = 1; n <= 5; n++){
    var filled = (n <= currentPriority) ? ' filled' : '';
    html += '<span class="pstar' + filled + '" data-value="' + n + '" title="Priority ' + n + ' of 5">\u2605</span>';
  }
  html += '</span>';
  return html;
}
function setPriority(pid, newPriority){
  if(_blockIfReadOnly('setPriority')) return;
  var idx = _wlIndexOf(pid);
  if(idx < 0) return;
  var entry = _watchList[idx];
  var current = entry.stars || 0;
  var finalValue = (current === newPriority) ? 0 : newPriority;
  _watchList[idx] = Object.assign({}, entry, { stars: finalValue });
  renderWatchList();
  /* PRIORITY_CARD_SYNC_V1 pattern carried: repaint every widget wearing this pid,
     so any future surface (card popup, quick edit) stays honest for free. */
  try {
    document.querySelectorAll('.priority-stars[data-pid="' + pid + '"]').forEach(function(w){
      w.outerHTML = renderPriorityStars(pid, finalValue);
    });
  } catch(_e){}
  autoSaveToPhoodNAS();
}
/* ============================================================================
   PRICE_COL_V1 (2026-08-15) - how expensive a spot is, one to four dollar signs.
   A straight clone of the Priority stars directly above: same widget shape, same
   click-to-set from the table row, same click-the-current-value-to-clear, same
   read-only gate, same repaint-every-widget-wearing-this-pid pattern.
   FOUR not five, per the Dude: Yelp and Google both top out at four, so a fifth
   sign reads wrong to anyone who has ever used a restaurant list.
   0 means NOBODY HAS PRICED IT and renders as a quiet dash. It does not mean cheap.
   This column is EXPENSE ONLY. Value is a separate idea and will live in a tag or
   in Matt's take, never here.
   ========================================================================== */
var PHOOD_PRICE_MAX = 4;
function renderPriceSigns(pid, currentPrice){
  var cur = currentPrice || 0;
  var html = '<span class="price-signs" data-pid="' + _esc(pid) + '">';
  if(!cur) html += '<span class="price-unset" title="Not priced yet">&mdash;</span>';
  for(var n = 1; n <= PHOOD_PRICE_MAX; n++){
    var filled = (n <= cur) ? ' filled' : '';
    html += '<span class="psign' + filled + '" data-value="' + n + '" title="Price ' + n + ' of ' + PHOOD_PRICE_MAX + '">$</span>';
  }
  html += '</span>';
  return html;
}
function setPrice(pid, newPrice){
  if(_blockIfReadOnly('setPrice')) return;
  var idx = _wlIndexOf(pid);
  if(idx < 0) return;
  var entry = _watchList[idx];
  var current = entry.price || 0;
  var finalValue = (current === newPrice) ? 0 : newPrice;   /* click the current one to clear */
  _watchList[idx] = Object.assign({}, entry, { price: finalValue });
  renderWatchList();
  try {
    document.querySelectorAll('.price-signs[data-pid="' + pid + '"]').forEach(function(w){
      w.outerHTML = renderPriceSigns(pid, finalValue);
    });
  } catch(_e){}
  autoSaveToPhoodNAS();
}
document.addEventListener('click', function(e){
  var sign = e.target.closest ? e.target.closest('.price-signs .psign') : null;
  if(!sign) return;
  var wrap = sign.closest('.price-signs');
  if(!wrap) return;
  var pid = wrap.getAttribute('data-pid');
  var value = parseInt(sign.getAttribute('data-value'), 10);
  if(!pid || !value) return;
  setPrice(pid, value);
});
document.addEventListener('click', function(e){
  var star = e.target.closest ? e.target.closest('.priority-stars .pstar') : null;
  if(!star) return;
  var wrap = star.closest('.priority-stars');
  if(!wrap) return;
  var pid = wrap.getAttribute('data-pid');
  var value = parseInt(star.getAttribute('data-value'), 10);
  if(!pid || !value) return;
  setPriority(pid, value);
});
function _dragEnabled(){
  /* Same gate as the twins: rank order only (no sort), admin only. */
  if(_sortField !== null) return false;
  if(typeof _isReadOnlyMode === 'function' && _isReadOnlyMode()) return false;
  return true;
}
/* ============================================================================
   PHOOD_TAGS_V1 (2026-08-15) - Matt's tag vocabulary, ported to BASEBALL'S MODEL.
   Spots store tag IDS in p.type_tags, never the emoji itself, exactly like
   mlb/index.html TYPE_TAGS_V1. That indirection is the whole point: when Matt
   renamed eight baseball tags on 8/5 every tagged player kept his tags, because
   the ids never moved. Change an emoji or a label here and every spot wearing it
   just re-renders. Retire a tag with retired:true and it leaves the picker while
   still rendering on anyone already wearing it. Never delete an entry.
   BYO is the one tag with no emoji - Unicode has no Y letter glyph - so it
   carries badge:'BYO' and paints as the red chip instead.
   ========================================================================== */
var PHOOD_TAGS_V1 = [
  { group:'Verdict', id:'must_visit', emoji:'🥇', label:'Must Visit', tagline:"Top of the list. Go out of your way for this one." },
  { group:'Verdict', id:'hot_now', emoji:'🔥', label:'Hot Right Now', tagline:"The city is talking about it this month." },
  { group:'Verdict', id:'just_opened', emoji:'🆕', label:'Just Opened', tagline:"New room. Worth seeing before the crowds find it." },
  { group:'Food', id:'cheap_eats', emoji:'💰', label:'Cheap Eats', tagline:"You will eat well and not think about the bill." },
  { group:'Food', id:'dessert', emoji:'🍰', label:'Dessert Stop', tagline:"Go for the sweets. Dinner optional." },
  { group:'Food', id:'vegetarian', emoji:'🌱', label:'Vegetarian Friendly', tagline:"A real menu for people who do not eat meat." },
  { group:'Food', id:'takeout', emoji:'🥡', label:'Takeout', tagline:"Good enough to carry home, not just eat in." },
  { group:'Drinks', id:'cocktails', emoji:'🍸', label:'Cocktails', tagline:"A proper cocktail program, not a well pour." },
  { group:'Drinks', id:'wine', emoji:'🍷', label:'Good Wine Selection', tagline:"The list is worth reading. Somebody built it on purpose." },
  { group:'Drinks', id:'bar', emoji:'🥃', label:'Bar Worth Waiting At', tagline:"Show up early. The wait for your table is the good part." },
  { group:'Drinks', id:'byo', emoji:null, label:'Bring Your Own', tagline:"No liquor license. Bring a bottle.", badge:'BYO' },
  { group:'Drinks', id:'brewery', emoji:'🍺', label:'Brewery', tagline:"They make the beer on site." },
  { group:'Logistics', id:'reservations', emoji:'🎟️', label:'Reservations Required', tagline:"Do not just show up. Book it." },
  { group:'Logistics', id:'walk_ins', emoji:'🚶', label:'Walk-ins Only', tagline:"No reservations taken. Get in line." },
  { group:'Logistics', id:'outdoor', emoji:'⛱️', label:'Outdoor Seating', tagline:"Tables outside when the weather cooperates." },
  { group:'Logistics', id:'big_groups', emoji:'🎉', label:'Good For Big Groups', tagline:"They can seat a party without a fight." },
  { group:'Logistics', id:'valet', emoji:'🔑', label:'Valet Parking', tagline:"Hand over the keys. Parking is somebody else's problem." },
  { group:'Logistics', id:'late_night', emoji:'🌙', label:'Late Night', tagline:"The kitchen is still going when everywhere else has closed." }
];
function _phoodTagById(id){
  for(var i=0;i<PHOOD_TAGS_V1.length;i++){ if(PHOOD_TAGS_V1[i].id===id) return PHOOD_TAGS_V1[i]; }
  return null;
}
/* Legacy emoji string -> ids. The pre-8/15 spots stored p.vibe as raw emoji.
   Runs once per spot at load, additive only: p.vibe is left on the object
   untouched so this is reversible. */
var _PHOOD_LEGACY_VIBE = {
  '🔥':'hot_now', '🥇':'must_visit', '💰':'cheap_eats',
  '🍸':'cocktails', '🍺':'brewery', '🍰':'dessert',
  '🌙':'late_night', '🆕':'just_opened', '🍷':'wine',
  '🥃':'bar'
};
function _migrateVibeToTags(p){
  if(!p || Array.isArray(p.type_tags)) return;
  var ids = [], v = p.vibe ? String(p.vibe) : '';
  if(/\bBYOB?\b/i.test(v)) ids.push('byo');
  var chars = Array.from(v.replace(/\uFE0F/g,''));
  for(var i=0;i<chars.length;i++){
    var id = _PHOOD_LEGACY_VIBE[chars[i]];
    if(id && ids.indexOf(id) === -1) ids.push(id);
  }
  p.type_tags = ids;
}
/* The Tags cell. Emojis inline exactly as before, so the table does not change
   shape; only the source of truth moved from a typed string to ids. */
function _tagChipsHtml(p){
  var ids = (p && Array.isArray(p.type_tags)) ? p.type_tags : [];
  if(!ids.length) return '';
  var out = '';
  for(var i=0;i<ids.length;i++){
    var d = _phoodTagById(ids[i]);
    if(!d) continue;
    if(d.badge) out += '<span class="byo-badge" title="' + _esc(d.tagline) + '">' + d.badge + '</span>';
    else out += '<span class="type-chip" title="' + _esc(d.label) + '">' + d.emoji + '</span>';
  }
  return out;
}
/* Tags column sorts on its LABELS, so the order is human and stable rather than
   whatever the emoji codepoints happen to be. */
function _phoodSortKey(p, f){
  if(f !== 'vibe') return p[f];
  var ids = Array.isArray(p.type_tags) ? p.type_tags : [], labels = [];
  for(var i=0;i<ids.length;i++){ var d=_phoodTagById(ids[i]); if(d) labels.push(d.label); }
  return labels.sort().join(' ');
}
/* The picker. Baseball's ppo-type-tag-row markup, grouped so eighteen rows stay
   scannable. Deliberate deviation from baseball: these do NOT autosave per click,
   because they live inside a modal that already has Save Spot and Cancel. */
function _spotTagsPickerHtml(selected){
  var sel = Array.isArray(selected) ? selected : [], html = '', lastGroup = null;
  for(var i=0;i<PHOOD_TAGS_V1.length;i++){
    var t = PHOOD_TAGS_V1[i];
    if(t.retired) continue;
    if(t.group !== lastGroup){ html += '<div class="spot-tag-group">' + t.group + '</div>'; lastGroup = t.group; }
    var glyph = t.badge ? '<span class="byo-badge">' + t.badge + '</span>' : t.emoji;
    html += '<label class="ppo-type-tag-row" title="' + _esc(t.tagline) + '">'
      + '<input type="checkbox" class="spot-tag-cb" data-tag-id="' + t.id + '"'
      + (sel.indexOf(t.id) >= 0 ? ' checked' : '') + '>'
      + '<span class="ppo-type-tag-emoji">' + glyph + '</span>'
      + '<span class="ppo-type-tag-label">' + t.label + '</span>'
      + '</label>';
  }
  return html;
}
function _readSpotTagPicker(){
  var out = [], cbs = document.querySelectorAll('#spot-tags-picker .spot-tag-cb');
  for(var i=0;i<cbs.length;i++){ if(cbs[i].checked) out.push(cbs[i].getAttribute('data-tag-id')); }
  return out;
}
function _rowHtml(p, rank){
  var drag = _dragEnabled();
  var trAttrs = drag
    ? ' draggable="true"'
      + ' ondragstart="phoodDragStart(event,\'' + p.pid + '\')"'
      + ' ondragover="phoodDragOver(event,\'' + p.pid + '\')"'
      + ' ondrop="phoodDrop(event,\'' + p.pid + '\')"'
      + ' ondragend="phoodDragEnd(event)"'
    : '';
  return '<tr data-phood-pid="' + p.pid + '"' + trAttrs + '>'
    + '<td class="c' + (drag ? ' drag-handle" title="Drag to re-rank' : '') + '"><span class="rank-cell">' + (drag ? '&#9776; ' : '') + rank + '</span></td>'
    + '<td class="l"><span class="player-name" onclick="openEditSpotModal(\'' + p.pid + '\')" style="cursor:pointer" title="Click to edit (admin only)">' + p.name + '</span>' + _freshTakeBadge(p) + '</td>'
    + '<td class="l">' + p.hood + '</td>'
    + '<td class="l vibe">' + _tagChipsHtml(p) + '</td>'
    + '<td class="c">' + renderPriorityStars(p.pid, p.stars || 0) + '</td>'
    + '<td class="c">' + renderPriceSigns(p.pid, p.price || 0) + '</td>'
    + _takeCellHtml(p)
    + '<td class="l">' + p.addr + '</td>'
    + (p.menu ? '<td class="c"><a class="pill" href="' + _esc(p.menu) + '" target="_blank" rel="noopener">MENU</a></td>'
               : '<td class="c"><a class="pill" href="#" onclick="return false;" style="opacity:0.45" title="No menu link yet">MENU</a></td>')
    + (p.pics ? '<td class="c"><a class="pill ig" href="' + _esc(p.pics) + '" target="_blank" rel="noopener">📸 PICS</a></td>'
               : '<td class="c"><a class="pill ig" href="#" onclick="return false;" style="opacity:0.45" title="No pictures link yet">📸 PICS</a></td>')
    + '</tr>';
}
function renderWatchList(){
  var q = '';
  var search = document.getElementById('player-search');
  if(search && search.value) q = search.value.trim().toLowerCase();
  var rows = _watchList.slice();
  if(_filterCat !== 'all') rows = rows.filter(function(p){ return p.cat === _filterCat; });
  if(q) rows = rows.filter(function(p){ return (p.name + ' ' + p.hood).toLowerCase().indexOf(q) !== -1; });
  if(_sortField !== null){
    var f = _sortField, num = (f === 'stars');
    rows.sort(function(a,b){
      /* PRICE_COL_V1: unpriced spots sink to the bottom in BOTH directions rather
         than pretending 0 is cheap. Same idea as baseball sinking nulls. */
      if(f === 'price'){
        var ap = a.price || 0, bp = b.price || 0;
        if(!ap && !bp) return 0;
        if(!ap) return 1;
        if(!bp) return -1;
        return (ap - bp) * _sortDir;
      }
      var av = _phoodSortKey(a,f), bv = _phoodSortKey(b,f);
      return (num ? (av - bv) : String(av).localeCompare(String(bv))) * _sortDir;
    });
  }
  var html = '';
  for(var i = 0; i < rows.length; i++){
    html += _rowHtml(rows[i], _watchList.indexOf(rows[i]) + 1);   /* rank = saved order, like the twins */
  }
  document.getElementById('watch-list-body').innerHTML = html;
  _setSortArrows();
  try { renderTiers(); } catch(e){}      /* the twins' paint hook — tiers repaint after every table paint */
}
function _setSortArrows(){
  var ars = document.querySelectorAll('th .arrow'), i;
  for(i = 0; i < ars.length; i++) ars[i].textContent = '';
  if(_sortField !== null){
    var el = document.getElementById('ar-' + _sortField);
    if(el) el.textContent = _sortDir === 1 ? '▲' : '▼';
  }
}
function sortBy(col){
  if(col === 'rank' || col === _sortField && _sortDir === -1){ _sortField = null; _sortDir = 1; }
  else if(_sortField === col){ _sortDir = -_sortDir; }
  else { _sortField = col; _sortDir = 1; }
  renderWatchList();
}
function setCat(cat, btn){
  _filterCat = cat;
  var tabs = document.querySelectorAll('.filter-tab'), i;
  for(i = 0; i < tabs.length; i++) tabs[i].classList.remove('active');
  if(btn) btn.classList.add('active');
  renderWatchList();
}
function toggleTheme(){
  var isDay = document.body.classList.toggle('day-mode');
  try { localStorage.setItem('watch101-theme', isDay ? 'day' : 'night'); } catch(e){}
  var btn = document.getElementById('theme-toggle');
  if(btn){
    btn.textContent = isDay ? '☀️' : '🌙';
    btn.title = isDay ? 'Switch to night mode' : 'Switch to day mode';
  }
}

/* MULTILIST — baseball's switchActiveList, foundation-sized. Storage is per
   list id, tiers ride along via _tiersLsKey(), so a switch is: point at the
   new id, reload, repaint. */
function _updateListLabels(){
  var l = WL_LISTS.find(function(x){ return x.id === currentListId; });
  if(!l) return;
  var t = document.getElementById('active-list-title');
  var st = document.getElementById('active-list-subtitle');
  if(t)  t.textContent  = l.title;
  if(st) st.textContent = l.subtitle;
  var sel = document.getElementById('list-switcher');
  if(sel && sel.value !== currentListId) sel.value = currentListId;
}
function _updateFilterTabs(){
  var l = WL_LISTS.find(function(x){ return x.id === currentListId; });
  var wrap = document.getElementById('filter-tabs');
  if(!l || !wrap) return;
  var html = '';
  l.tabs.forEach(function(tb){
    html += '<button class="filter-tab' + (tb.cat === _filterCat ? ' active' : '') + '" onclick="setCat(\'' + tb.cat + '\',this)">' + tb.label + '</button>';
  });
  wrap.innerHTML = html;
}
async function switchActiveList(newId){
  if(!WL_LISTS.find(function(l){ return l.id === newId; })) return;
  currentListId = newId;
  _sortField = null; _sortDir = 1; _filterCat = 'all';
  var search = document.getElementById('player-search');
  if(search) search.value = '';
  _updateListLabels();
  _updateFilterTabs();
  _watchList = [];
  renderWatchList();          /* instant clear so the old list never lingers, baseball's habit */
  await loadListFromStorage();
  renderWatchList();
}

/* ============================================================================
   PHOOD_DRAG_RANK_V1 (2026-08-14) — ported from NBA_DRAG_RANK_V1 (2026-06-05,
   itself baseball's personalDrag model) + DRAG_POLISH_V1 (undo, drop indicator
   bar + rank pill, edge auto-scroll). Renames: nba→phood, _wlPid(item)→item.pid,
   autoSaveToNbaNAS→autoSaveToPhoodNAS. Rank = array position, re-derived on
   every render; drop splices _watchList and persists to the NAS.
   ============================================================================ */
function _wlIndexOf(pid){ return _watchList.findIndex(function(p){ return p.pid === pid; }); }

/* ---- DRAG_POLISH_V1: undo ---- */
var _dragUndoStack = [];
var DRAG_UNDO_LIMIT = 20;
function snapshotForUndo(){
  _dragUndoStack.push(_watchList.slice());
  if(_dragUndoStack.length > DRAG_UNDO_LIMIT) _dragUndoStack.shift();
  updateUndoButton();
}
function undoLastMove(){
  if(_blockIfReadOnly('undoLastMove')) return;
  if(_dragUndoStack.length === 0) return;
  _watchList = _dragUndoStack.pop();
  updateUndoButton();
  renderWatchList();
  autoSaveToPhoodNAS();   // persist the restore the same way the mutation persisted
}
function updateUndoButton(){
  var btn = document.getElementById('undo-btn');
  if(!btn) return;
  var n = _dragUndoStack.length;
  btn.disabled = (n === 0);
  btn.title = n === 0 ? 'Nothing to undo yet' : ('Undo the last move (' + n + ' step' + (n === 1 ? '' : 's') + ' banked)');
}

/* ---- DRAG_POLISH_V1: drop indicator bar + rank pill ---- */
function _hideDropIndicator(){
  var bar = document.getElementById('drop-indicator-bar');
  if(bar) bar.style.display = 'none';
  var pill = document.getElementById('drop-indicator-pill');
  if(pill) pill.style.display = 'none';
}
function _positionDropIndicatorBar(rowEl, above){
  var bar = document.getElementById('drop-indicator-bar');
  if(!bar || !rowEl) return;
  var rect = rowEl.getBoundingClientRect();
  bar.style.top = ((above ? rect.top : rect.bottom) + window.scrollY - 2) + 'px';
  bar.style.left = (rect.left + window.scrollX) + 'px';
  bar.style.width = rect.width + 'px';
  bar.style.display = 'block';
}
function _showDropIndicatorPill(clientX, clientY, rankNum){
  var pill = document.getElementById('drop-indicator-pill');
  if(!pill) return;
  pill.textContent = '→ Rank ' + rankNum;
  pill.style.left = (clientX + 14) + 'px';
  pill.style.top  = (clientY + 18) + 'px';
  pill.style.display = 'block';
}
function _dragIndicatorOnOver(e, pid, srcPid){
  try {
    if(typeof _tierDragPayload !== 'undefined' && _tierDragPayload) return;   // TIER_DRAG owns indicators during a tier drag
    if(srcPid == null || srcPid === pid){ _hideDropIndicator(); return; }
    var si = _wlIndexOf(srcPid);
    var ti = _wlIndexOf(pid);
    if(si < 0 || ti < 0){ _hideDropIndicator(); return; }
    _positionDropIndicatorBar(e.currentTarget, si > ti);   // dragging up -> lands above target; down -> below
    _showDropIndicatorPill(e.clientX, e.clientY, ti + 1);
  } catch(err){ /* indicator is cosmetic -- never let it break a drag */ }
}

/* ---- the drag itself ---- */
var _phoodDragSrcPid = null;
function phoodDragStart(e, pid){
  if(_sortField !== null){ e.preventDefault(); return; }
  if(_blockIfReadOnly('phoodDragStart')){ e.preventDefault(); return; }
  _phoodDragSrcPid = pid;
  if(e.currentTarget && e.currentTarget.classList) e.currentTarget.classList.add('phood-dragging');
  try { e.dataTransfer.effectAllowed = 'move'; } catch(_){}
}
function phoodDragOver(e, pid){
  if(_sortField !== null) return;
  e.preventDefault();
  if(e.currentTarget && e.currentTarget.classList) e.currentTarget.classList.add('phood-drag-over');
  try { e.dataTransfer.dropEffect = 'move'; } catch(_){}
  _dragIndicatorOnOver(e, pid, _phoodDragSrcPid);
}
function phoodDrop(e, pid){
  e.preventDefault();
  if(e.currentTarget && e.currentTarget.classList) e.currentTarget.classList.remove('phood-drag-over');
  if(_sortField !== null) return;                 // never reorder while a sort is active
  if(_phoodDragSrcPid == null || _phoodDragSrcPid === pid) return;
  var si = _wlIndexOf(_phoodDragSrcPid);
  var ti = _wlIndexOf(pid);
  if(si < 0 || ti < 0) return;
  snapshotForUndo();
  _hideDropIndicator();
  var moved = _watchList.splice(si, 1)[0];
  _watchList.splice(ti, 0, moved);
  _phoodDragSrcPid = null;
  renderWatchList();        // rank is re-derived from array position on render
  autoSaveToPhoodNAS();
}
function phoodDragEnd(e){
  _phoodDragSrcPid = null;
  _hideDropIndicator();
  document.querySelectorAll('tr.phood-dragging, tr.phood-drag-over').forEach(function(tr){
    tr.classList.remove('phood-dragging'); tr.classList.remove('phood-drag-over');
  });
}
document.addEventListener('dragleave', function(e){
  if(e.target && e.target.classList && e.target.classList.contains('phood-drag-over')) e.target.classList.remove('phood-drag-over');
});

/* ---- edge auto-scroll during any HTML5 drag — baseball's scroller, ported intact ---- */
(function(){
  var EDGE_ZONE = 100, MAX_STEP = 20, MIN_STEP = 4, TICK_MS = 16;
  var intervalId = null, scrollDir = 0, scrollStep = 0;
  function stopEdgeScroll(){
    if(intervalId){ clearInterval(intervalId); intervalId = null; }
    scrollDir = 0; scrollStep = 0;
  }
  function tick(){ window.scrollBy(0, scrollDir * scrollStep); }
  document.addEventListener('dragover', function(e){
    var y = e.clientY, h = window.innerHeight;
    if(y < EDGE_ZONE){ scrollDir = -1; scrollStep = Math.max(MIN_STEP, Math.round(MAX_STEP * (1 - y / EDGE_ZONE))); }
    else if(y > h - EDGE_ZONE){ scrollDir = 1; scrollStep = Math.max(MIN_STEP, Math.round(MAX_STEP * (1 - (h - y) / EDGE_ZONE))); }
    else { stopEdgeScroll(); return; }
    if(!intervalId) intervalId = setInterval(tick, TICK_MS);
  });
  document.addEventListener('drop', stopEdgeScroll);
  document.addEventListener('dragend', stopEdgeScroll);
})();


/* ============================================================================
   SPOT_EDITOR_V1 (2026-08-14) — Add/Edit/Remove spots. New code (no baseball
   source to port: sports players come from stats APIs, PHOOD spots are typed).
   Follows the tier modal's conventions; saves through autoSaveToPhoodNAS.
   ============================================================================ */
function _esc(t){ return String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
var _spotEditingPid = null;
var _spotModalStars = 3;
function _spotStarsPaint(){
  var el = document.getElementById('spot-stars');
  if(!el) return;
  var h = '';
  for(var i = 1; i <= 5; i++){
    h += '<span data-star="' + i + '" style="color:' + (i <= _spotModalStars ? '#fbbf24' : '#3a3f4a') + '">★</span>';
  }
  el.innerHTML = h;
}
function _spotStarsWire(){
  var el = document.getElementById('spot-stars');
  if(!el || el._wired) return;
  el._wired = true;
  el.addEventListener('click', function(ev){
    var t = ev.target.closest('[data-star]');
    if(!t) return;
    _spotModalStars = parseInt(t.getAttribute('data-star'), 10) || 3;
    _spotStarsPaint();
  });
}
var _spotModalPrice = 0;   /* 0 = not priced, deliberately NOT a default of 2 */
function _spotPricePaint(){
  var el = document.getElementById('spot-price');
  if(!el) return;
  var h = '';
  for(var i = 1; i <= PHOOD_PRICE_MAX; i++){
    h += '<span data-price="' + i + '" style="color:' + (i <= _spotModalPrice ? '#22c55e' : '#3a3f4a') + '">$</span>';
  }
  h += '<span style="font-size:11px;color:var(--text3);margin-left:8px;font-style:italic">'
     + (_spotModalPrice ? 'click again to clear' : 'not priced yet') + '</span>';
  el.innerHTML = h;
}
function _spotPriceWire(){
  var el = document.getElementById('spot-price');
  if(!el || el._wired) return;
  el._wired = true;
  el.addEventListener('click', function(ev){
    var t = ev.target.closest('[data-price]');
    if(!t) return;
    var v = parseInt(t.getAttribute('data-price'), 10) || 0;
    _spotModalPrice = (_spotModalPrice === v) ? 0 : v;
    _spotPricePaint();
  });
}
function _spotShowErr(msg){
  var e = document.getElementById('spot-modal-error');
  if(e){ e.textContent = msg; e.style.display = msg ? 'block' : 'none'; }
}
function _spotFill(p){
  document.getElementById('spot-name').value = p ? (p.name || '') : '';
  document.getElementById('spot-cat').value  = p ? (p.cat || 'rest') : 'rest';
  document.getElementById('spot-hood').value = p ? (p.hood || '') : '';
  document.getElementById('spot-addr').value = p ? (p.addr === 'TBD' ? '' : (p.addr || '')) : '';
  if(p) _migrateVibeToTags(p);
  document.getElementById('spot-tags-picker').innerHTML =
    _spotTagsPickerHtml(p && Array.isArray(p.type_tags) ? p.type_tags : []);
  document.getElementById('spot-menu').value = p ? (p.menu || '') : '';
  document.getElementById('spot-pics').value = p ? (p.pics || '') : '';
  document.getElementById('spot-take').value = p ? (p.take || '') : '';
  _spotModalStars = p ? (p.stars || 3) : 3;
  _spotModalPrice = p ? (p.price || 0) : 0;
  _spotStarsPaint(); _spotStarsWire();
  _spotPricePaint(); _spotPriceWire(); _spotShowErr('');
}
function openAddSpotModal(){
  if(typeof _blockIfReadOnly === 'function' && _blockIfReadOnly('openAddSpotModal')) return;
  _spotEditingPid = null;
  document.getElementById('spot-modal-title').innerHTML = '&#10133; Add a Spot';
  document.getElementById('spot-delete-btn').style.display = 'none';
  _spotFill(null);
  document.getElementById('spot-modal').style.display = 'flex';
}
function openEditSpotModal(pid){
  if(typeof _blockIfReadOnly === 'function' && _blockIfReadOnly('openEditSpotModal')) return;
  var p = _watchList.find(function(x){ return x.pid === pid; });
  if(!p) return;
  _spotEditingPid = pid;
  document.getElementById('spot-modal-title').innerHTML = '&#9999;&#65039; Edit: ' + _esc(p.name);
  document.getElementById('spot-delete-btn').style.display = '';
  _spotFill(p);
  document.getElementById('spot-modal').style.display = 'flex';
}
function closeSpotModal(){
  document.getElementById('spot-modal').style.display = 'none';
  _spotEditingPid = null;
}
async function saveSpotFromModal(){
  var name = document.getElementById('spot-name').value.trim();
  if(!name){ _spotShowErr('The spot needs a name.'); return; }
  var vals = {
    name: name,
    cat:  document.getElementById('spot-cat').value,
    hood: document.getElementById('spot-hood').value.trim(),
    addr: document.getElementById('spot-addr').value.trim() || 'TBD',
    type_tags: _readSpotTagPicker(),
    menu: document.getElementById('spot-menu').value.trim(),
    pics: document.getElementById('spot-pics').value.trim(),
    take: document.getElementById('spot-take').value.trim(),
    stars: _spotModalStars,
    price: _spotModalPrice
  };
  if(_spotEditingPid){
    var p = _watchList.find(function(x){ return x.pid === _spotEditingPid; });
    if(!p){ _spotShowErr('Could not find that spot anymore.'); return; }
    Object.assign(p, vals);
    _playerDB[p.pid] = { full_name: p.name };
  } else {
    var np = Object.assign({ pid: 'r' + Date.now() }, vals);
    _watchList.push(np);                       /* new spots land at the bottom of the list */
    _playerDB[np.pid] = { full_name: np.name };
  }
  closeSpotModal();
  renderWatchList();
  try { await autoSaveToPhoodNAS(); } catch(e){}
}
async function deleteSpotFromModal(){
  if(!_spotEditingPid) return;
  var p = _watchList.find(function(x){ return x.pid === _spotEditingPid; });
  if(!p) return;
  var ok = confirm('Remove "' + p.name + '" from the list?\n\nAny tier anchored on it will stop drawing until its anchors are reset. This cannot be undone.');
  if(!ok) return;
  _watchList = _watchList.filter(function(x){ return x.pid !== _spotEditingPid; });
  delete _playerDB[_spotEditingPid];
  closeSpotModal();
  renderWatchList();
  try { await autoSaveToPhoodNAS(); } catch(e){}
}


/* ---- READONLY_V1/V2 — ported verbatim from the twins ---- */
function _isReadOnlyMode(){
  try {
    const host = (window.location && window.location.hostname) || '';
    return !host.toLowerCase().includes('github');
  } catch(e){ return false; }
}
function _blockIfReadOnly(actionName){
  try {
    if(_isReadOnlyMode()){
      console.log('[READONLY_V2] blocked admin action: ' + (actionName || 'unknown') + ' (read-only mode)');
      return true;
    }
  } catch(e){ /* fail-open so staging editing never breaks */ }
  return false;
}
function _applyReadOnlyBodyClass(){
  try {
    if(_isReadOnlyMode() && document.body){
      document.body.classList.add('readonly-mode');
      console.log('[READONLY_V1] read-only mode active — admin controls hidden');
    }
  } catch(e){ console.warn('[READONLY_V1] could not apply body class:', e); }
}
if(document.readyState === 'loading'){ document.addEventListener('DOMContentLoaded', _applyReadOnlyBodyClass); }
else { _applyReadOnlyBodyClass(); }

/* (twins' hideBackendListsOnFanView not ported -- PHOOD has no list switcher yet) */

// TIERS_V1 STAGE 1 (2026-08-03 — PC Walter, per the Dude). Baseball's editorial
// tier system ported: data model + anti-wipe guard + save/load + bracket render
// + Create/Edit/Delete modal. STAGE 2 (group drag + armed pulse) and STAGE 3
// (removal self-heal hardening) come later — see the parity checklist item 19.
// Tier shape matches the public-cut trim script: { id, name, color, start_pid,
// end_pid, created_at }. Order-anchored to the ACTIVE list, per list.
// ============================================================================
const TIER_COLOR_HEX = {
  // TIER_UNCHAINED_V1 (2026-08-19 -- mirrored from the twins the same night): 8 -> 26 colors.
  // Stored BY NAME in saved tiers; new names flow through save/load untouched; unknowns fall back gray.
  red:'#ef4444', orange:'#f97316', gold:'#eab308', green:'#22c55e',
  blue:'#3b82f6', purple:'#a855f7', pink:'#ec4899', gray:'#94a3b8',
  amber:'#f59e0b', yellow:'#facc15', lime:'#84cc16', emerald:'#10b981',
  teal:'#14b8a6', cyan:'#06b6d4', sky:'#0ea5e9', indigo:'#6366f1',
  violet:'#8b5cf6', fuchsia:'#d946ef', rose:'#f43f5e', crimson:'#b91c1c',
  maroon:'#881337', brown:'#92400e', forest:'#166534', navy:'#1e3a8a',
  slate:'#64748b', white:'#e2e8f0'
};
let currentTiers = [];
// TIERS_SNAPSHOT_GUARD_V1 — baseball's May 22 lesson, ported whole: tiers got
// silently wiped TWICE in one day by saves that ran while currentTiers was
// empty for the wrong reason. An empty tiers save is only trusted after an
// EXPLICIT user action (create/edit/delete). Otherwise rescue from the load
// snapshot or localStorage.
let _tiersLoadedOk = false;
let _tiersSnapshotAtLoad = [];
let _tiersUserMutated = false;
let _tierEditingId = null;

function _tiersLsKey(){ return _wlStorageKey() + '_tiers'; }

function _tiersForSave(){
  try {
    if(Array.isArray(currentTiers) && currentTiers.length > 0) return currentTiers;
    if(_tiersUserMutated) return [];   // the user really deleted them all
    if(Array.isArray(_tiersSnapshotAtLoad) && _tiersSnapshotAtLoad.length > 0){
      console.warn('[TIERS_SNAPSHOT_GUARD_V1] refusing to save empty tiers with no user action — rescued from the load snapshot.');
      return _tiersSnapshotAtLoad.slice();
    }
    try {
      const raw = localStorage.getItem(_tiersLsKey());
      if(raw){ const arr = JSON.parse(raw); if(Array.isArray(arr) && arr.length){ console.warn('[TIERS_SNAPSHOT_GUARD_V1] rescued tiers from localStorage.'); return arr; } }
    } catch(e){}
    return [];
  } catch(e){ return Array.isArray(currentTiers) ? currentTiers : []; }
}
function _tiersPersistLocal(){
  try { localStorage.setItem(_tiersLsKey(), JSON.stringify(Array.isArray(currentTiers) ? currentTiers : [])); } catch(e){}
}

// ---- Modal (baseball Phase C/E, adapted to the twins' overlay idiom) ----
function _tierPopulateForm(tierToEdit){
  var nameEl  = document.getElementById('tier-name');
  var colorEl = document.getElementById('tier-color');
  var startEl = document.getElementById('tier-start');
  var endEl   = document.getElementById('tier-end');
  var errEl   = document.getElementById('tier-error');
  if(nameEl)  nameEl.value  = '';
  if(colorEl) colorEl.value = '';
  if(errEl){  errEl.style.display = 'none'; errEl.textContent = ''; }
  document.querySelectorAll('#tier-color-swatches .tier-swatch.selected')
    .forEach(function(b){ b.classList.remove('selected'); });
  if(startEl && endEl && Array.isArray(_watchList)){
    var optsHtml = '<option value="">Select…</option>';
    _watchList.forEach(function(it, idx){
      var pid = it && it.pid;
      if(pid == null) return;
      var p = (_playerDB && _playerDB[pid]) || {};
      var nm = p.full_name || ((p.first_name||'') + ' ' + (p.last_name||'')).trim() || ('(pid ' + pid + ')');
      var label = '#' + (idx + 1) + '  ' + nm;
      optsHtml += '<option value="' + String(pid).replace(/"/g,'&quot;') + '">' + label.replace(/</g,'&lt;') + '</option>';
    });
    startEl.innerHTML = optsHtml;
    endEl.innerHTML   = optsHtml;
  }
  if(tierToEdit){
    if(nameEl)  nameEl.value  = tierToEdit.name || '';
    if(startEl) startEl.value = String(tierToEdit.start_pid || '');
    if(endEl)   endEl.value   = String(tierToEdit.end_pid || '');
    if(tierToEdit.color) selectTierColor(tierToEdit.color);
  }
}
function _tierConfigureMode(isEdit){
  var title   = document.getElementById('tier-modal-title');
  var saveBtn = document.getElementById('tier-save-btn');
  var delBtn  = document.getElementById('tier-delete-btn');
  if(title)   title.textContent   = isEdit ? '🏷️ Edit Tier' : '🏷️ Create a Tier';
  if(saveBtn) saveBtn.textContent = isEdit ? 'Save Changes' : 'Create Tier';
  if(delBtn)  delBtn.style.display = isEdit ? '' : 'none';
}

// ============================================================================
// TIER_DRAG_NBA_V1 (2026-08-08 - PC Walter, per the Dude): TIERS_V1 STAGE 2.
// Baseball's TIER_DRAG_V1 ported whole, with TIER_PULSE_OPACITY_V1 baked in
// (the 6/11 lag fix: the armed pulse animates OPACITY on a ::after overlay,
// compositor-only. NEVER animate box-shadow on the box itself - 33x drag lag).
// Arm via the "Draggable as a group" checkbox in the Edit Tier modal (edit
// mode only). The bracket box gets pointer-events:auto + a gold pulse; drag it
// and the whole block of players moves as a unit; auto-disarm after drop, Esc,
// or an outside click. Adapted from baseball's players[]-index model to the
// twins' _watchList/_wlPid pid model. Tier anchors (start_pid/end_pid) travel
// WITH the block, so tier membership never needs restamping after a move.
// ============================================================================
let _armedTierId = null;
let _tierDragPayload = null;   // { tierId, playerIds:[...], startIdx, endIdx } during a drag

function _tierDragRowSync(show){
  var row = document.getElementById('tier-drag-row');
  if(row) row.style.display = show ? '' : 'none';
  var cb = document.getElementById('tier-drag-checkbox');
  if(cb) cb.checked = false;
}
function _onTierDragCheckboxChanged(){
  try {
    var cb = document.getElementById('tier-drag-checkbox');
    var ticked = !!(cb && cb.checked);
    if(!ticked) return;            // unticking does nothing - modal stays open
    var tid = _tierEditingId;
    if(!tid){ console.warn('[TIER_DRAG_NBA_V1] checkbox ticked with no _tierEditingId - ignoring'); return; }
    closeCreateTierModal();        // auto-close, baseball's behavior
    armTier(tid);
  } catch(e){ console.warn('[TIER_DRAG_NBA_V1] _onTierDragCheckboxChanged failed:', e); }
}
function _tierGetBoxEl(tierId){
  return document.querySelector('.tier-bracket-box[data-tier-id="' + String(tierId).replace(/"/g,'\\"') + '"]');
}
function _wlTierIdx(pidVal){
  return _watchList.findIndex(function(item){ return String(_wlPid(item)) === String(pidVal); });
}
function armTier(tierId){
  if(_blockIfReadOnly('armTier')) return;
  if(!tierId) return;
  if(_armedTierId && _armedTierId !== tierId) disarmTier();
  var box = _tierGetBoxEl(tierId);
  if(!box){
    console.warn('[TIER_DRAG_NBA_V1] cannot arm - tier box not in DOM (list filtered or sorted?):', tierId);
    alert('Cannot arm this tier right now - make sure the list is in its default rank order (no sort, filter, or search active), then try again.');
    return;
  }
  _armedTierId = tierId;
  box.classList.add('tier-armed');
  box.setAttribute('draggable', 'true');
  box._tdv1_ondragstart = function(e){ tierDragStart(e, tierId); };
  box._tdv1_ondragend   = function(e){ tierDragEnd(e); };
  box.addEventListener('dragstart', box._tdv1_ondragstart);
  box.addEventListener('dragend',   box._tdv1_ondragend);
  console.log('[TIER_DRAG_NBA_V1] armed:', tierId);
}
function disarmTier(){
  if(!_armedTierId) return;
  var box = _tierGetBoxEl(_armedTierId);
  if(box){
    box.classList.remove('tier-armed');
    box.removeAttribute('draggable');
    if(box._tdv1_ondragstart) box.removeEventListener('dragstart', box._tdv1_ondragstart);
    if(box._tdv1_ondragend)   box.removeEventListener('dragend',   box._tdv1_ondragend);
    box._tdv1_ondragstart = null;
    box._tdv1_ondragend = null;
  }
  console.log('[TIER_DRAG_NBA_V1] disarmed:', _armedTierId);
  _armedTierId = null;
  _tierDragPayload = null;
}
function tierDragStart(e, tierId){
  try {
    var tier = (Array.isArray(currentTiers) ? currentTiers : []).find(function(t){ return t && t.id === tierId; });
    if(!tier){ console.warn('[TIER_DRAG_NBA_V1] dragstart - tier not found:', tierId); return; }
    var startIdx = _wlTierIdx(tier.start_pid);
    var endIdx   = _wlTierIdx(tier.end_pid);
    if(startIdx < 0 || endIdx < 0 || endIdx < startIdx){
      console.warn('[TIER_DRAG_NBA_V1] dragstart - invalid range, aborting drag');
      e.preventDefault();
      return;
    }
    var ids = [];
    for(var i = startIdx; i <= endIdx; i++) ids.push(String(_wlPid(_watchList[i])));
    _tierDragPayload = { tierId: tierId, playerIds: ids, startIdx: startIdx, endIdx: endIdx };
    if(e.dataTransfer){
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', 'tier:' + tierId); } catch(_){}
      // No setDragImage - the gold drop bar + rank pill do the visual work (baseball's DROP_INDICATOR unification).
    }
    console.log('[TIER_DRAG_NBA_V1] dragstart - tier', tierId, 'players:', ids.length);
  } catch(err){ console.warn('[TIER_DRAG_NBA_V1] tierDragStart failed:', err); }
}
function tierDragEnd(e){
  if(_armedTierId) disarmTier();
  if(typeof _hideDropIndicator === 'function') _hideDropIndicator();
}
// ============================================================================
// TIER_DROP_EDGE_V1 (2026-08-18 - PC Walter, per the Dude, who found it in ten
// seconds of real dragging that no test of mine would ever have caught).
//
// Bug #160's fix made the bottom of a list reachable IN THEORY. In practice it
// was not: it required the bottom half of the LAST row, about eighteen pixels,
// and overshooting even slightly past that row made `closest('tr[...]')` return
// null, at which point the drop was silently thrown away. So the natural gesture,
// drag past the end of the list, did nothing, and the careful gesture landed on
// the top half and put the block back where it started. His words: "it's always
// leaving one player below the tier, no matter how much I try to lower it."
//
// Dragging past either end of the list now means exactly what it looks like.
// Returns {row, above} or null when the cursor is genuinely inside the table,
// in which case the caller's own row lookup wins.
// ============================================================================
function _tierDropEdge(tbody, rowSel, clientY){
  try {
    if(!tbody) return null;
    var rows = Array.prototype.slice.call(tbody.querySelectorAll(rowSel));
    if(!rows.length) return null;
    var lastR = rows[rows.length - 1].getBoundingClientRect();
    if(clientY >= lastR.bottom) return { row: rows[rows.length - 1], above: false };
    var firstR = rows[0].getBoundingClientRect();
    if(clientY <= firstR.top) return { row: rows[0], above: true };
    return null;
  } catch(e){ return null; }
}

// ============================================================================
// TIER_DROP_RESOLVER_V1 (2026-08-18 - PC Walter, per the Dude). Bug #160's cure.
// THE SINGLE ANSWER to "where does this block land". Until tonight the drop
// indicator and the drop itself each ran their own arithmetic, and they disagreed:
// by one place on an ordinary group drag (the indicator knew which half of the row
// the cursor was in, the drop was never told), and by HALF THE WIDTH of any tier
// you dragged across (the drop snaps away from splitting a tier, the indicator had
// no idea that happened). Measured before fixing: 260 of 520 plain combinations
// wrong, and up to 16 places out when crossing a 32-man tier.
//
// Deliberately pure and surface-agnostic so baseball's players[], the twins'
// _watchList and the rankings _rankings[pos] all feed it identically and cannot
// drift apart again. Both the indicator and the drop call THIS and nothing else.
//
//   srcStart/srcEnd - the dragged block's current position
//   tgtIdx          - row the cursor is over, in the CURRENT (pre-move) order
//   above           - cursor is in the TOP half of that row
//   ranges          - [{id,startIdx,endIdx}] for every OTHER tier
// Returns { insertAt, destRank, noop, snappedTo }.
//
// ⚑ BEHAVIOUR CHANGE, the Dude's call 2026-08-18: the bottom half of a row now
// means BELOW that man. The old drop always inserted above, which is why the very
// bottom of a list could not be reached by a group drag at all.
// ============================================================================


function resolveTierDrop(srcStart, srcEnd, tgtIdx, above, ranges, listLen){
  var blockLen = (srcEnd - srcStart + 1);
  var insertAt = above ? tgtIdx : tgtIdx + 1;
  if(insertAt < 0) insertAt = 0;
  if(insertAt > listLen) insertAt = listLen;
  // Anywhere from its own start to just past its own end puts the block back where it was.
  if(insertAt >= srcStart && insertAt <= srcEnd + 1){
    return { insertAt: srcStart, destRank: srcStart + 1, noop: true, snappedTo: null };
  }
  // Never cut another tier in half. An insertion point STRICTLY inside one gets pushed
  // to the nearer edge; landing exactly ON an edge is already outside it and is left alone.
  var snappedTo = null;
  for(var i = 0; i < (ranges || []).length; i++){
    var r = ranges[i];
    if(!r) continue;
    if(insertAt > r.startIdx && insertAt <= r.endIdx){
      insertAt = ((insertAt - r.startIdx) < ((r.endIdx + 1) - insertAt)) ? r.startIdx : (r.endIdx + 1);
      snappedTo = r.id;
      break;
    }
  }
  // The snap can land the block exactly back where it started (it was already sitting
  // against that tier's edge). Re-check, so a no-op cannot slip through as a real move
  // and trigger a pointless save. Found by testing, not by reading.
  if(insertAt >= srcStart && insertAt <= srcEnd + 1){
    return { insertAt: srcStart, destRank: srcStart + 1, noop: true, snappedTo: snappedTo };
  }
  var adj = (insertAt > srcEnd) ? (insertAt - blockLen) : insertAt;
  if(adj < 0) adj = 0;
  return { insertAt: insertAt, destRank: adj + 1, noop: false, snappedTo: snappedTo };
}

// TIER_DROP_RESOLVER_V1 (Bug #160) - every OTHER tier as plain index ranges for the
// shared resolver. Replaces _tierIndexInOtherTier, whose only caller was tierDrop.
function _wlTierOtherRanges(excludeTierId){
  var out = [];
  if(!Array.isArray(currentTiers)) return out;
  for(var i = 0; i < currentTiers.length; i++){
    var t = currentTiers[i];
    if(!t || t.id === excludeTierId) continue;
    var sIdx = _wlTierIdx(t.start_pid);
    var eIdx = _wlTierIdx(t.end_pid);
    if(sIdx < 0 || eIdx < 0) continue;
    out.push({ id: t.id, startIdx: sIdx, endIdx: eIdx });
  }
  return out;
}
// Tier drags ride a capturing dragover/drop pair on the tbody so the existing
// row handlers stay untouched (baseball's interceptor pattern).
(function _wireTierDropInterceptor(){
  function attach(){
    var tbody = document.getElementById('watch-list-body');
    if(!tbody) return false;
    if(tbody._tdv1_wired) return true;
    tbody._tdv1_wired = true;
    tbody.addEventListener('dragover', function(e){
      if(!_tierDragPayload) return;
      e.preventDefault();
      if(e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      try {
        var row = e.target && e.target.closest ? e.target.closest('tr[data-phood-pid]') : null;
        // TIER_DROP_EDGE_V1 - past either end of the list counts as that end.
        var _edge = row ? null : _tierDropEdge(document.getElementById('watch-list-body'), 'tr[data-phood-pid]', e.clientY);
        if(!row && _edge) row = _edge.row;
        if(!row) return;
        var tgtIdx = _wlTierIdx(row.getAttribute('data-phood-pid'));
        if(tgtIdx < 0) return;
        var rect = row.getBoundingClientRect();
        var above = _edge ? _edge.above : (e.clientY < rect.top + (rect.height / 2));
        if(typeof _positionDropIndicatorBar === 'function') _positionDropIndicatorBar(row, above);
        // TIER_DROP_RESOLVER_V1 (Bug #160) - the pill asks the same resolver the drop will ask.
        var _res = resolveTierDrop(_tierDragPayload.startIdx, _tierDragPayload.endIdx, tgtIdx, above,
                                   _wlTierOtherRanges(_tierDragPayload.tierId), _watchList.length);
        if(typeof _showDropIndicatorPill === 'function') _showDropIndicatorPill(e.clientX, e.clientY, _res.destRank);
      } catch(_pillErr){ /* pill is cosmetic */ }
    }, true);
    tbody.addEventListener('drop', async function(e){
      if(!_tierDragPayload) return;
      e.preventDefault();
      e.stopPropagation();
      if(typeof _hideDropIndicator === 'function') _hideDropIndicator();
      var row = e.target && e.target.closest ? e.target.closest('tr[data-phood-pid]') : null;
      // TIER_DROP_EDGE_V1 - past either end counts as that end, instead of a discarded drop.
      var _edge = row ? null : _tierDropEdge(document.getElementById('watch-list-body'), 'tr[data-phood-pid]', e.clientY);
      if(!row && _edge) row = _edge.row;
      if(!row){ disarmTier(); return; }
      var dropIdx = _wlTierIdx(row.getAttribute('data-phood-pid'));
      if(dropIdx < 0){ disarmTier(); return; }
      var _dRect = row.getBoundingClientRect();
      var _dAbove = _edge ? _edge.above : (e.clientY < _dRect.top + (_dRect.height / 2));
      await tierDrop(dropIdx, _dAbove);
    }, true);
    return true;
  }
  if(!attach()){
    var poll = setInterval(function(){ if(attach()) clearInterval(poll); }, 250);
  }
})();
async function tierDrop(dropIdx, above){
  if(_blockIfReadOnly('tierDrop')){ disarmTier(); return; }
  if(!_tierDragPayload){ disarmTier(); return; }
  var payload = _tierDragPayload;
  var tier = (Array.isArray(currentTiers) ? currentTiers : []).find(function(t){ return t && t.id === payload.tierId; });
  if(!tier){ disarmTier(); return; }
  var srcIndices = payload.playerIds.map(function(pid){ return _wlTierIdx(pid); });
  if(srcIndices.some(function(i){ return i < 0; })){
    console.warn('[TIER_DRAG_NBA_V1] tierDrop - some players missing from list, aborting');
    disarmTier();
    return;
  }
  srcIndices.sort(function(a,b){ return a-b; });
  var srcStart = srcIndices[0];
  var srcEnd   = srcIndices[srcIndices.length - 1];
  // TIER_DROP_RESOLVER_V1 (Bug #160) - one resolver settles the landing spot, the no-op
  // case and the anti-splitting snap. `above` defaults to true for any older caller.
  var _res = resolveTierDrop(srcStart, srcEnd, dropIdx, (above !== false),
                             _wlTierOtherRanges(payload.tierId), _watchList.length);
  if(_res.noop){
    console.log('[TIER_DRAG_NBA_V1] drop lands where it started - no-op');
    disarmTier();
    return;
  }
  if(_res.snappedTo) console.log('[TIER_DRAG_NBA_V1] would have split tier', _res.snappedTo, '- snapped to idx', _res.insertAt);
  if(typeof snapshotForUndo === 'function') snapshotForUndo();
  var block = _watchList.splice(srcStart, srcEnd - srcStart + 1);
  var adjDropIdx = (_res.insertAt > srcEnd) ? (_res.insertAt - block.length) : _res.insertAt;
  if(adjDropIdx < 0) adjDropIdx = 0;
  if(adjDropIdx > _watchList.length) adjDropIdx = _watchList.length;
  _watchList.splice.apply(_watchList, [adjDropIdx, 0].concat(block));
  // start_pid/end_pid still point at the same players - they moved WITH the block.
  if(typeof renderWatchList === 'function') renderWatchList();
  if(typeof renderTiers === 'function') renderTiers();
  try { if(typeof autoSaveToPhoodNAS === 'function') await autoSaveToPhoodNAS(); }
  catch(err){ console.warn('[TIER_DRAG_NBA_V1] autosave after tier drop failed:', err); }
  console.log('[TIER_DRAG_NBA_V1] tier moved:', payload.tierId, '- ' + block.length + ' players to idx', adjDropIdx);
  disarmTier();
}
// Disarm escape hatches: click outside the armed tier box, or press Escape (baseball's pair).
document.addEventListener('click', function(e){
  if(!_armedTierId) return;
  var box = _tierGetBoxEl(_armedTierId);
  if(!box) return;
  if(box.contains(e.target)) return;
  var tab = document.querySelector('.tier-bracket-tab[data-tier-id="' + String(_armedTierId).replace(/"/g,'\\"') + '"]');
  if(tab && tab.contains(e.target)) return;
  var modal = document.getElementById('create-tier-modal');
  if(modal && modal.contains(e.target)) return;
  disarmTier();
}, true);
document.addEventListener('keydown', function(e){
  if(!_armedTierId) return;
  if(e.key === 'Escape' || e.key === 'Esc'){ e.preventDefault(); disarmTier(); }
});

function openCreateTierModal(){
  if(_blockIfReadOnly('openCreateTierModal')) return;
  try {
    _tierEditingId = null;
    _tierPopulateForm(null);
    _tierConfigureMode(false);
    _tierDragRowSync(false);   // TIER_DRAG: create mode - row hidden, checkbox reset
    var modal = document.getElementById('create-tier-modal');
    if(modal) modal.style.display = 'flex';
    setTimeout(function(){ var n = document.getElementById('tier-name'); if(n) n.focus(); }, 50);
  } catch(e){ console.warn('[TIERS_V1] openCreateTierModal failed:', e); }
}
function openEditTierModal(tierId){
  if(_blockIfReadOnly('openEditTierModal')) return;
  try {
    var tier = (Array.isArray(currentTiers) ? currentTiers : []).find(function(t){ return t && t.id === tierId; });
    if(!tier){ console.warn('[TIERS_V1] openEditTierModal — tier not found:', tierId); return; }
    _tierEditingId = tierId;
    _tierPopulateForm(tier);
    _tierConfigureMode(true);
    _tierDragRowSync(true);    // TIER_DRAG: edit mode - row shown, checkbox reset
    var modal = document.getElementById('create-tier-modal');
    if(modal) modal.style.display = 'flex';
    setTimeout(function(){ var n = document.getElementById('tier-name'); if(n) n.focus(); }, 50);
  } catch(e){ console.warn('[TIERS_V1] openEditTierModal failed:', e); }
}
function selectTierColor(color){
  try {
    var hidden = document.getElementById('tier-color');
    if(hidden) hidden.value = color;
    document.querySelectorAll('#tier-color-swatches .tier-swatch')
      .forEach(function(b){
        if(b.getAttribute('data-color') === color) b.classList.add('selected');
        else b.classList.remove('selected');
      });
  } catch(e){ console.warn('[TIERS_V1] selectTierColor failed:', e); }
}
async function saveTierFromModal(){
  if(_blockIfReadOnly('saveTierFromModal')) return;
  var errEl = document.getElementById('tier-error');
  function showErr(msg){ if(errEl){ errEl.textContent = msg; errEl.style.display = 'block'; } }
  try {
    var name  = (document.getElementById('tier-name').value || '').trim();
    var color = (document.getElementById('tier-color').value || '').trim();
    var startId = document.getElementById('tier-start').value;
    var endId   = document.getElementById('tier-end').value;
    if(!name)    { showErr('Tier name is required.'); return; }
    if(!color)   { showErr('Pick a color from the palette.'); return; }
    if(!startId) { showErr('Pick a Start Player.'); return; }
    if(!endId)   { showErr('Pick an End Player.'); return; }
    var startIdx = _wlIndexOf(startId);
    var endIdx   = _wlIndexOf(endId);
    if(startIdx < 0 || endIdx < 0){ showErr('Could not find one of the selected players. Try reopening the modal.'); return; }
    if(endIdx < startIdx){ showErr('End Player must be the same as or below the Start Player on the list.'); return; }
    if(!Array.isArray(currentTiers)) currentTiers = [];
    if(_tierEditingId){
      var existing = currentTiers.find(function(t){ return t && t.id === _tierEditingId; });
      if(!existing){ showErr('Could not find the tier to update. It may have been deleted in another tab.'); return; }
      existing.name = name;
      existing.color = color;
      existing.start_pid = String(startId);
      existing.end_pid   = String(endId);
      existing.updated_at = new Date().toISOString();
      _tiersUserMutated = true;
    } else {
      currentTiers.push({
        id: 'tier_' + Date.now(),
        name: name,
        color: color,
        start_pid: String(startId),
        end_pid: String(endId),
        created_at: new Date().toISOString(),
        created_by: 'matt'
      });
      _tiersUserMutated = true;
    }
    _tiersPersistLocal();
    try { if(typeof autoSaveToPhoodNAS === 'function'){ await autoSaveToPhoodNAS(); } } catch(e){ console.warn('[TIERS_V1] autosave failed:', e); }
    closeCreateTierModal();
    try { if(typeof renderTiers === 'function') renderTiers(); } catch(e){}
  } catch(e){
    console.warn('[TIERS_V1] saveTierFromModal failed:', e);
    showErr('Something went wrong. Check the console for details.');
  }
}
async function deleteTierFromModal(){
  if(_blockIfReadOnly('deleteTierFromModal')) return;
  if(!_tierEditingId) return;
  try {
    var idx = (Array.isArray(currentTiers) ? currentTiers : []).findIndex(function(t){ return t && t.id === _tierEditingId; });
    if(idx < 0){ closeCreateTierModal(); return; }
    var doomed = currentTiers[idx];
    var ok = confirm('Delete tier "' + (doomed.name || '(untitled)') + '"?\n\nThe players stay on the list — only the colored bracket disappears. This cannot be undone.');
    if(!ok) return;
    currentTiers.splice(idx, 1);
    _tiersUserMutated = true;
    _tiersPersistLocal();
    try { if(typeof autoSaveToPhoodNAS === 'function'){ await autoSaveToPhoodNAS(); } } catch(e){ console.warn('[TIERS_V1] autosave after delete failed:', e); }
    closeCreateTierModal();
    try { if(typeof renderTiers === 'function') renderTiers(); } catch(e){}
  } catch(e){ console.warn('[TIERS_V1] deleteTierFromModal failed:', e); }
}
function closeCreateTierModal(){
  try {
    var modal = document.getElementById('create-tier-modal');
    if(modal) modal.style.display = 'none';
    _tierEditingId = null;
  } catch(e){}
}

// ---- Render subsystem (baseball's overlay + spacer rows + self-heal resolver) ----
function _tiersDefaultOrder(){
  // Brackets only make sense in the saved rank order: any sort, search, or
  // stat filter scrambles rows, so hide the boxes until the list is back.
  try {
    if(typeof _sortField !== 'undefined' && _sortField !== null) return false;
    var search = document.getElementById('player-search');
    if(search && search.value && search.value.trim() !== '') return false;
    if(typeof _wlFilterActive === 'function' && _wlFilterActive()) return false;
    return true;
  } catch(e){ return false; }
}
function _tiersClearOverlay(){
  var layer = document.getElementById('tier-overlay-layer');
  if(layer) layer.innerHTML = '';
}
function _tiersClearSpacerRows(){
  var tbody = document.getElementById('watch-list-body');
  if(!tbody) return;
  var spacers = tbody.querySelectorAll('tr.tier-spacer-row');
  for(var i = 0; i < spacers.length; i++){ spacers[i].parentNode.removeChild(spacers[i]); }
}
// TIER_SELFHEAL_V1 (baseball June 8, ported): one shared resolver so the spacer
// and the box always agree. Both anchors must survive on the CURRENT table or
// the tier draws nothing (no orphan gaps).
function _tiersResolveRange(tier){
  var tbody = document.getElementById('watch-list-body');
  if(!tbody || !tier) return null;
  var rows = Array.prototype.slice.call(tbody.querySelectorAll('tr[data-phood-pid]'));
  if(rows.length === 0) return null;
  var idOf = function(r){ return String(r.getAttribute('data-phood-pid')); };
  var startId = String(tier.start_pid);
  var endId   = String(tier.end_pid);
  var si = -1, ei = -1;
  for(var i=0;i<rows.length;i++){ if(idOf(rows[i])===startId){ si=i; break; } }
  for(var j=0;j<rows.length;j++){ if(idOf(rows[j])===endId){ ei=j; } }
  if(si !== -1 && ei !== -1 && si <= ei){ return { startRow: rows[si], endRow: rows[ei] }; }
  return null;
}
function _tiersInjectSpacerRows(){
  _tiersClearSpacerRows();
  if(!Array.isArray(currentTiers) || currentTiers.length === 0) return;
  if(!_tiersDefaultOrder()) return;
  var tbody = document.getElementById('watch-list-body');
  if(!tbody) return;
  var firstRow = tbody.querySelector('tr[data-phood-pid]');
  if(!firstRow) return;
  var colCount = firstRow.children.length;
  currentTiers.forEach(function(tier){
    try {
      var range = _tiersResolveRange(tier);
      if(!range || !range.startRow) return;
      var spacer = document.createElement('tr');
      spacer.className = 'tier-spacer-row';
      spacer.setAttribute('data-tier-spacer-for', String(tier.id));
      var td = document.createElement('td');
      td.colSpan = colCount;
      spacer.appendChild(td);
      var _shPh = (window._tierSpacerHeights || {})['ph:' + tier.id];   // TIER_UNCHAINED_V1: learned multi-line height
      if(_shPh) spacer.style.height = _shPh + 'px';
      tbody.insertBefore(spacer, range.startRow);
    } catch(e){ console.warn('[TIER_SPACER_ROW_V1] spacer inject failed:', tier, e); }
  });
}
function _tiersGetOrCreateLayer(){
  var tbody = document.getElementById('watch-list-body');
  if(!tbody) return null;
  var table = tbody.closest('table');
  if(!table) return null;
  var anchor = table.parentElement;
  if(!anchor) return null;
  var cs = window.getComputedStyle(anchor);
  if(cs.position === 'static') anchor.style.position = 'relative';
  var layer = document.getElementById('tier-overlay-layer');
  if(!layer){
    layer = document.createElement('div');
    layer.id = 'tier-overlay-layer';
    layer.style.cssText = 'position:absolute;top:0;left:0;width:0;height:0;pointer-events:none;z-index:5';
    anchor.appendChild(layer);
  } else if(layer.parentElement !== anchor){
    anchor.appendChild(layer);
  }
  return { layer: layer, anchor: anchor };
}
function renderTiers(){
  _tiersClearOverlay();
  try { _tiersInjectSpacerRows(); } catch(e){ console.warn('[TIER_SPACER_ROW_V1] inject crashed:', e); }
  if(!Array.isArray(currentTiers) || currentTiers.length === 0) return;
  if(!_tiersDefaultOrder()){ try { _tiersClearSpacerRows(); } catch(e){} return; }
  var ctx = _tiersGetOrCreateLayer();
  if(!ctx) return;
  var layer = ctx.layer;
  var anchor = ctx.anchor;
  var anchorRect = anchor.getBoundingClientRect();
  currentTiers.forEach(function(tier){
    try {
      var _range = _tiersResolveRange(tier);
      if(!_range) return;
      var startRow = _range.startRow, endRow = _range.endRow;
      if(!startRow || !endRow) return;
      var sRect = startRow.getBoundingClientRect();
      var eRect = endRow.getBoundingClientRect();
      var top    = sRect.top - anchorRect.top + anchor.scrollTop;
      var bottom = eRect.bottom - anchorRect.top + anchor.scrollTop;
      var height = bottom - top;
      if(height <= 0) return;
      var hex = TIER_COLOR_HEX[tier.color] || '#94a3b8';
      var tbodyRect = document.getElementById('watch-list-body').getBoundingClientRect();
      var boxLeft   = tbodyRect.left  - anchorRect.left + anchor.scrollLeft;
      var boxRight  = tbodyRect.right - anchorRect.left + anchor.scrollLeft;
      var boxWidth  = boxRight - boxLeft;
      var pad = 4;
      var box = document.createElement('div');
      box.className = 'tier-bracket-box';
      box.setAttribute('data-tier-id', tier.id);
      box.style.cssText =
        'position:absolute;top:' + (top - pad) + 'px;left:' + (boxLeft - pad) + 'px;' +
        'width:' + (boxWidth + pad * 2) + 'px;height:' + (height + pad * 2) + 'px;' +
        'border:3px solid ' + hex + ';border-radius:6px;' +
        'box-shadow:0 0 8px ' + hex + '55, inset 0 0 4px ' + hex + '22;' +
        'background:transparent;pointer-events:none;box-sizing:border-box;';
      box.title = tier.name;
      var tab = document.createElement('div');
      tab.className = 'tier-bracket-tab';
      tab.setAttribute('data-tier-id', tier.id);
      tab.textContent = tier.name;
      var spacerRow = document.querySelector('tr.tier-spacer-row[data-tier-spacer-for="' + String(tier.id).replace(/"/g,'\\"') + '"]');
      var tabTop, tabRadius, tabShadow;
      if(spacerRow){
        var spacerRect = spacerRow.getBoundingClientRect();
        tabTop = (spacerRect.top - anchorRect.top + anchor.scrollTop) + 5;
        tabRadius = '4px';
        tabShadow = '0 1px 4px ' + hex + '55';
      } else {
        var firstTbodyRow = document.querySelector('#watch-list-body tr[data-phood-pid]');
        if(firstTbodyRow && firstTbodyRow === startRow){
          tabTop = (top + height + pad - 2); tabRadius = '0 0 6px 6px'; tabShadow = '0 1px 4px ' + hex + '55';
        } else {
          tabTop = (top - pad - 14); tabRadius = '6px 6px 0 0'; tabShadow = '0 -1px 4px ' + hex + '55';
        }
      }
      tab.style.cssText =
        'position:absolute;top:' + tabTop + 'px;left:' + (boxLeft - pad) + 'px;' +
        'background:' + hex + ';color:#fff;font-family:"Nunito Sans",sans-serif;' +
        'font-size:11px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;' +
        'padding:2px 10px;border-radius:' + tabRadius + ';box-shadow:' + tabShadow + ';' +
        'pointer-events:auto;cursor:pointer;white-space:nowrap;';   // TIER_UNCHAINED_V2: nowrap by DEFAULT (the original proven byte); the post-append check flips a genuinely-long name to wrapping with an explicit px width
      var isFan = (typeof _isReadOnlyMode === 'function') ? _isReadOnlyMode() : false;
      if(isFan){
        tab.title = 'Tier: ' + tier.name;
        tab.style.cursor = 'default';
      } else {
        tab.title = 'Tier: ' + tier.name + ' — click to edit or delete';
        (function(tid){
          tab.addEventListener('click', function(ev){ ev.stopPropagation(); openEditTierModal(tid); });
        })(tier.id);
      }
      layer.appendChild(box);
      layer.appendChild(tab);
      // TIER_UNCHAINED_V1: measured fit for multi-line tabs (learned spacer heights; one repaint converges).
      try {
        var _maxW = Math.max(220, boxWidth - 40);   // TIER_UNCHAINED_V2: wrap ONLY when the name is genuinely too long, with an EXPLICIT px width -- V1's width:max-content on the abspos tab is the suspect for baseball's mystery horizontal growth, so it is gone everywhere
        if(tab.scrollWidth > _maxW){ tab.style.whiteSpace = 'normal'; tab.style.width = _maxW + 'px'; tab.style.lineHeight = '1.3'; }
        var _th = tab.offsetHeight || 0;
        var _store = (window._tierSpacerHeights = window._tierSpacerHeights || {});
        if(spacerRow){
          var _need = _th + 8;
          if(_need > 28 && _store['ph:' + tier.id] !== _need){
            _store['ph:' + tier.id] = _need;
            spacerRow.style.height = _need + 'px';
            if(!window._tierRepaintQueued){
              window._tierRepaintQueued = true;
              requestAnimationFrame(function(){ window._tierRepaintQueued = false; try { renderTiers(); } catch(e){} });
            }
          }
        } else if(tabRadius === '6px 6px 0 0' && _th > 16){
          tab.style.top = (top - pad - _th) + 'px';
        }
      } catch(e){}
    } catch(e){ console.warn('[TIERS_V1] failed to render tier:', tier, e); }
  });
}
window.addEventListener('resize', function(){ try { renderTiers(); } catch(e){} });

/* ---- init ---- */
(async function(){
  var ths = document.querySelectorAll('thead th'), i;
  for(i = 0; i < ths.length; i++){
    (function(th){ th.addEventListener('click', function(){ sortBy(th.getAttribute('data-col')); }); })(ths[i]);
  }
  _applyReadOnlyBodyClass();
  _updateListLabels();
  _updateFilterTabs();
  renderWatchList();          /* paint the empty shell instantly, then fill from the NAS */
  await loadListFromStorage();
  renderWatchList();
  if(document.body.classList.contains('day-mode')){
    var btn = document.getElementById('theme-toggle');
    if(btn){ btn.textContent = '☀️'; }
  }
})();
