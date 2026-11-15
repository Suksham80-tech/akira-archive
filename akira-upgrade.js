/* AKIRA // ARCHIVE — additive upgrade. Load AFTER your original <script>. */

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const FALLBACK = "data:image/svg+xml;utf8," + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="420"><rect width="100%" height="100%" fill="#222226"/><text x="50%" y="52%" fill="#F6F2E9" font-family="sans-serif" font-size="64" text-anchor="middle">録</text></svg>');
const showcaseBox = document.querySelector(".anime-showcase");
let feedToken = 0, searchToken = 0, searchTimer;

/* Image fallback for the big cover */
currentCover.onerror = () => { currentCover.onerror = null; currentCover.src = FALLBACK; };

/* ---- Feed: loading skeleton, stale-response guard, error handling ---- */
async function fetchFeed(mode = "top") {
  const token = ++feedToken;
  showcaseBox.classList.add("loading");
  try {
    const res = await fetch(`/api/feed?mode=${mode}`);
    if (!res.ok) throw new Error("bad response");
    const data = await res.json();
    if (token !== feedToken) return;
    if (!data.length) throw new Error("empty");
    deckQueue = data; deckIndex = 0;
    renderShowcase();
  } catch (err) {
    if (token !== feedToken) return;
    currentTitle.textContent = "Server Connection Error";
    currentSynopsis.textContent = "Make sure server.py is running on http://localhost:8000";
  } finally {
    if (token === feedToken) showcaseBox.classList.remove("loading");
  }
}

/* ---- Showcase: animation, saved-state highlight, preload next cover ---- */
function renderShowcase(override = null) {
  if (override) currentAnime = override;
  else {
    if (!deckQueue.length) return;
    currentAnime = deckQueue[deckIndex % deckQueue.length];
  }
  const a = currentAnime;
  currentCover.onerror = () => { currentCover.onerror = null; currentCover.src = FALLBACK; };
  currentCover.src = a.image || FALLBACK;
  currentScore.textContent = `★ ${a.score}`;
  currentMeta.textContent = a.meta;
  currentTitle.textContent = a.title;
  currentJp.textContent = a.title_japanese || "";
  currentSynopsis.textContent = a.synopsis || "No synopsis available.";
  currentSynopsis.scrollTop = 0;

  showcaseBox.classList.remove("swap"); void showcaseBox.offsetWidth; showcaseBox.classList.add("swap");

  const saved = watchlist.find(w => w.mal_id === a.mal_id);
  document.querySelectorAll(".triage-btn").forEach(b =>
    b.classList.toggle("current", !!saved && saved.category === b.dataset.category));

  if (deckQueue.length > 1) {
    const next = deckQueue[(deckIndex + 1) % deckQueue.length];
    if (next && next.image) new Image().src = next.image;
  }
}

/* ---- Search: live (debounced), stale-guard, escaped output ---- */
async function searchAnime(query) {
  query = (query || "").trim();
  if (!query) { searchResultsDrawer.style.display = "none"; return; }
  const token = ++searchToken;
  searchResultsDrawer.style.display = "block";
  searchResultsDrawer.innerHTML = `<div style="padding:.75rem;font-size:.85rem;">Searching…</div>`;
  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
    if (!res.ok) throw new Error();
    const items = await res.json();
    if (token !== searchToken) return;
    searchResultsDrawer.innerHTML = "";
    if (!items.length) {
      searchResultsDrawer.innerHTML = `<div style="padding:.75rem;font-size:.85rem;">No anime found matching "${esc(query)}".</div>`;
      return;
    }
    items.forEach(anime => {
      const row = document.createElement("div");
      row.className = "search-result-item";
      row.innerHTML = `
        <img src="${esc(anime.image)}" alt="" onerror="this.onerror=null;this.src=FALLBACK" />
        <div>
          <div style="font-weight:700;font-size:.83rem;">${esc(anime.title)}</div>
          <div style="font-size:.7rem;opacity:.8;">${esc(anime.meta)} • ★ ${esc(anime.score)}</div>
        </div>`;
      row.addEventListener("click", () => {
        renderShowcase(anime);
        searchResultsDrawer.style.display = "none";
        showcaseBox.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
      searchResultsDrawer.appendChild(row);
    });
  } catch (e) {
    if (token !== searchToken) return;
    searchResultsDrawer.style.display = "none";
    showToast("Search failed.");
  }
}

const searchInputEl = document.getElementById("searchInput");
searchInputEl.addEventListener("input", () => {
  clearTimeout(searchTimer);
  const q = searchInputEl.value;
  if (q.trim().length < 2) { searchResultsDrawer.style.display = "none"; return; }
  searchTimer = setTimeout(() => searchAnime(q), 350);
});
document.addEventListener("click", e => {
  if (!searchResultsDrawer.contains(e.target) && e.target !== searchInputEl)
    searchResultsDrawer.style.display = "none";
});

/* ---- Stats count-up ---- */
function animateNum(el, to) {
  const from = parseInt(el.textContent, 10) || 0;
  if (from === to) { el.textContent = to; return; }
  const start = performance.now(), dur = 350;
  (function tick(now) {
    const t = Math.min((now - start) / dur, 1);
    el.textContent = Math.round(from + (to - from) * t);
    if (t < 1) requestAnimationFrame(tick);
  })(start);
}

/* ---- Vault render: escaped, image fallback, animated stats, empty state ---- */
function saveAndRender() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(watchlist)); } catch (e) { showToast("Storage full — export a backup!"); }

  animateNum(document.getElementById("statTotal"), watchlist.length);
  animateNum(document.getElementById("statWatched"), watchlist.filter(a => a.category === "watched").length);
  animateNum(document.getElementById("statMaybe"), watchlist.filter(a => a.category === "maybe").length);
  animateNum(document.getElementById("statRatherNot"), watchlist.filter(a => a.category === "rather_not").length);

  const keyword = document.getElementById("vaultFilterInput").value.trim().toLowerCase();
  const filtered = watchlist.filter(item =>
    (activeFilter === "all" || item.category === activeFilter) &&
    (!keyword || (item.title || "").toLowerCase().includes(keyword)));

  collectionGrid.innerHTML = "";
  if (!filtered.length) {
    collectionGrid.innerHTML = `
      <div class="empty-state">
        <h3>${keyword ? "Nothing Matches" : "No Records Found"}</h3>
        <p style="font-size:.85rem;color:var(--muted);">${keyword ? "Try a different search term." : "Triage anime from the left panel to build your vault."}</p>
      </div>`;
    return;
  }

  filtered.forEach((item, i) => {
    const card = document.createElement("div");
    card.className = "record-card";
    card.style.animationDelay = `${Math.min(i * 25, 250)}ms`;
    card.innerHTML = `
      <div class="record-cover">
        <img src="${esc(item.image)}" alt="${esc(item.title)}" loading="lazy" onerror="this.onerror=null;this.src=FALLBACK" />
        <span class="category-ribbon ribbon-${esc(item.category)}">${formatCat(item.category)}</span>
      </div>
      <div class="record-body">
        <div>
          <div class="record-title">${esc(item.title)}</div>
          <div class="record-meta">${esc(item.meta)} • ★ ${esc(item.score)}</div>
        </div>
        <div class="record-controls">
          <select class="category-select" aria-label="Change category">
            <option value="watched" ${item.category === "watched" ? "selected" : ""}>✓ Watched</option>
            <option value="maybe" ${item.category === "maybe" ? "selected" : ""}>⏳ Maybe Later</option>
            <option value="rather_not" ${item.category === "rather_not" ? "selected" : ""}>✕ Rather Not</option>
          </select>
          <button class="delete-btn" aria-label="Remove">✕</button>
        </div>
      </div>`;

    card.querySelector(".category-select").addEventListener("change", e => {
      item.category = e.target.value;
      item.updatedAt = new Date().toISOString();
      saveAndRender();
      renderShowcaseState();
      showToast(`Moved "${item.title}" → ${formatCat(item.category)}`);
    });
    card.querySelector(".delete-btn").addEventListener("click", () => {
      watchlist = watchlist.filter(a => a.mal_id !== item.mal_id);
      saveAndRender();
      renderShowcaseState();
      showToast(`Removed "${item.title}"`);
    });
    collectionGrid.appendChild(card);
  });
}

/* Keep the "SAVED" highlight on the triage buttons in sync without re-animating */
function renderShowcaseState() {
  if (!currentAnime) return;
  const saved = watchlist.find(w => w.mal_id === currentAnime.mal_id);
  document.querySelectorAll(".triage-btn").forEach(b =>
    b.classList.toggle("current", !!saved && saved.category === b.dataset.category));
}

/* ---- "Surprise Me" also highlights the Random chip ---- */
document.getElementById("nextRandomBtn").addEventListener("click", () => {
  document.querySelectorAll(".chip").forEach(c => c.classList.toggle("active", c.dataset.feed === "random"));
});

/* ---- Keyboard shortcuts: 1/2/3 triage, → or N skip, / search, Esc close ---- */
const triageKeys = { "1": "watched", "2": "maybe", "3": "rather_not" };
document.addEventListener("keydown", e => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const tag = (e.target.tagName || "").toLowerCase();
  if (e.key === "Escape") { searchResultsDrawer.style.display = "none"; e.target.blur?.(); return; }
  if (["input", "textarea", "select"].includes(tag)) return;
  if (triageKeys[e.key]) { recordAnime(currentAnime, triageKeys[e.key]); }
  else if (e.key === "ArrowRight" || e.key.toLowerCase() === "n") { advanceDeck(); }
  else if (e.key === "/") { e.preventDefault(); searchInputEl.focus(); }
});

/* Small hint under the skip button (hidden on touch/mobile via CSS) */
document.getElementById("skipBtn").insertAdjacentHTML("afterend",
  `<div class="kbd-hint"><kbd>1</kbd>Watched <kbd>2</kbd>Maybe <kbd>3</kbd>Rather not <kbd>→</kbd>Skip <kbd>/</kbd>Search</div>`);

/* ---- Swipe left on the card to skip (mobile) ---- */
let touchX = null;
showcaseBox.addEventListener("touchstart", e => { touchX = e.touches[0].clientX; }, { passive: true });
showcaseBox.addEventListener("touchend", e => {
  if (touchX === null) return;
  const dx = e.changedTouches[0].clientX - touchX;
  touchX = null;
  if (Math.abs(dx) > 70) advanceDeck();
}, { passive: true });

/* First paint with the upgraded renderer */
saveAndRender();
renderShowcaseState();
