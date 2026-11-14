// Stav aplikace
let savedMusic = JSON.parse(localStorage.getItem("atlas_music")) || [];
// Ručně kurátorované diskografie podle ID interpreta: { [artistId]: [ { id, name, image, group, release_date }, ... ] }
let artistDiscographies = JSON.parse(localStorage.getItem("atlas_artist_discographies")) || {};
// Osobní záznamy poslechu podle ID alba: { [albumId]: { listened: true, rating: "8.5", review: "..." } }
let userReviews = JSON.parse(localStorage.getItem("atlas_user_reviews")) || {};

let currentMode = "artists";
let currentArtistFocus = null;
let currentReviewAlbum = null;
let currentReviewContext = "artist"; // "artist" | "standalone"
let availableArtistReleases = [];
let pickerGroupFilter = "all";
let freshlyUnboxedAlbumId = null;

// DOM
const views = {
    library: document.getElementById("library-view"),
    artistDetail: document.getElementById("artist-detail-view")
};

const contentGrid = document.getElementById("content-grid");
const discoGrid = document.getElementById("discography-grid");

const modals = {
    search: document.getElementById("modal-search"),
    artistAlbums: document.getElementById("modal-artist-albums"),
    review: document.getElementById("modal-review")
};

// Pomocné funkce
function normalizeReleaseTimestamp(dateStr) {
    if (!dateStr) return 0;
    const parts = String(dateStr).split("-");
    const year = parts[0] || "1900";
    const month = (parts[1] || "01").padStart(2, "0");
    const day = (parts[2] || "01").padStart(2, "0");
    return new Date(`${year}-${month}-${day}T00:00:00Z`).getTime() || 0;
}

function getReleaseYear(dateStr) {
    return dateStr ? String(dateStr).slice(0, 4) : "";
}

// Chronologické řazení od nejnovějšího po nejstarší
function sortChronologically(albums) {
    return [...albums].sort(
        (a, b) => normalizeReleaseTimestamp(b.release_date) - normalizeReleaseTimestamp(a.release_date)
    );
}

function escapeHtml(str) {
    return String(str || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function truncateLabel(str, maxLen) {
    const clean = String(str || "").trim();
    return clean.length > maxLen ? clean.slice(0, maxLen - 1).trim() + "…" : clean;
}

// Deterministický hash a generátor pro autentický Sharpie autogram
function hashSeed(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

function createRng(seed) {
    let s = seed || 123456789;
    return () => {
        s = (s + 0x6D2B79F5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// Generátor reálného Sharpie podpisu + čitelného názvu alba ve viditelné části CD
// Generátor velkého Sharpie autogramu interpreta přes téměř celé CD + názvu alba
// Kaligrafický tvar iniciály pro Sharpie autogram
function buildInitialGlyph(ch, x, y, scale, rand) {
    const c = (ch || "A").toUpperCase();
    const s = scale;
    const tilt = 6 + rand() * 5;

    if ("VWU".includes(c)) {
        return `M ${(x - 6 * s).toFixed(1)},${(y - 26 * s).toFixed(1)} `
            + `C ${(x - 2 * s).toFixed(1)},${(y - 8 * s).toFixed(1)} ${(x - 1 * s).toFixed(1)},${(y + 10 * s).toFixed(1)} ${(x + 2 * s).toFixed(1)},${(y + 12 * s).toFixed(1)} `
            + `C ${(x + 7 * s).toFixed(1)},${(y + 6 * s).toFixed(1)} ${(x + 15 * s + tilt).toFixed(1)},${(y - 22 * s).toFixed(1)} ${(x + 22 * s + tilt).toFixed(1)},${(y - 34 * s).toFixed(1)} `
            + `C ${(x + 24 * s + tilt).toFixed(1)},${(y - 36 * s).toFixed(1)} ${(x + 14 * s).toFixed(1)},${(y - 6 * s).toFixed(1)} ${(x + 16 * s).toFixed(1)},${(y + 4 * s).toFixed(1)} `;
    }
    if ("SCG".includes(c)) {
        return `M ${(x + 18 * s + tilt).toFixed(1)},${(y - 26 * s).toFixed(1)} `
            + `C ${(x + 4 * s).toFixed(1)},${(y - 36 * s).toFixed(1)} ${(x - 10 * s).toFixed(1)},${(y - 20 * s).toFixed(1)} ${(x + 6 * s).toFixed(1)},${(y - 10 * s).toFixed(1)} `
            + `C ${(x + 22 * s).toFixed(1)},${(y - 1 * s).toFixed(1)} ${(x + 12 * s).toFixed(1)},${(y + 16 * s).toFixed(1)} ${(x - 6 * s).toFixed(1)},${(y + 10 * s).toFixed(1)} `
            + `C ${(x - 12 * s).toFixed(1)},${(y + 7 * s).toFixed(1)} ${(x + 4 * s).toFixed(1)},${(y - 2 * s).toFixed(1)} ${(x + 16 * s).toFixed(1)},${(y + 2 * s).toFixed(1)} `;
    }
    if ("PBRDK".includes(c)) {
        return `M ${(x + 4 * s).toFixed(1)},${(y + 14 * s).toFixed(1)} `
            + `L ${(x + 12 * s + tilt).toFixed(1)},${(y - 34 * s).toFixed(1)} `
            + `C ${(x + 28 * s + tilt).toFixed(1)},${(y - 36 * s).toFixed(1)} ${(x + 28 * s).toFixed(1)},${(y - 14 * s).toFixed(1)} ${(x + 8 * s).toFixed(1)},${(y - 11 * s).toFixed(1)} `
            + `C ${(x + 18 * s).toFixed(1)},${(y - 6 * s).toFixed(1)} ${(x + 18 * s).toFixed(1)},${(y + 4 * s).toFixed(1)} ${(x + 22 * s).toFixed(1)},${(y + 5 * s).toFixed(1)} `;
    }
    if ("MNHA".includes(c)) {
        return `M ${(x - 4 * s).toFixed(1)},${(y + 10 * s).toFixed(1)} `
            + `C ${(x + 2 * s).toFixed(1)},${(y - 12 * s).toFixed(1)} ${(x + 8 * s + tilt).toFixed(1)},${(y - 32 * s).toFixed(1)} ${(x + 10 * s + tilt).toFixed(1)},${(y - 32 * s).toFixed(1)} `
            + `L ${(x + 11 * s).toFixed(1)},${(y + 4 * s).toFixed(1)} `
            + `C ${(x + 15 * s).toFixed(1)},${(y - 10 * s).toFixed(1)} ${(x + 20 * s + tilt).toFixed(1)},${(y - 24 * s).toFixed(1)} ${(x + 22 * s + tilt).toFixed(1)},${(y - 24 * s).toFixed(1)} `
            + `L ${(x + 23 * s).toFixed(1)},${(y + 4 * s).toFixed(1)} `;
    }
    if ("JLTFI".includes(c)) {
        return `M ${(x + 2 * s).toFixed(1)},${(y - 24 * s).toFixed(1)} `
            + `C ${(x + 12 * s).toFixed(1)},${(y - 30 * s).toFixed(1)} ${(x + 24 * s + tilt).toFixed(1)},${(y - 32 * s).toFixed(1)} ${(x + 20 * s + tilt).toFixed(1)},${(y - 30 * s).toFixed(1)} `
            + `L ${(x + 9 * s).toFixed(1)},${(y + 14 * s).toFixed(1)} `
            + `C ${(x + 5 * s).toFixed(1)},${(y + 22 * s).toFixed(1)} ${(x - 4 * s).toFixed(1)},${(y + 14 * s).toFixed(1)} ${(x + 14 * s).toFixed(1)},${(y + 2 * s).toFixed(1)} `;
    }
    // Výchozí velká smyčka (E, O, Q, Z, Y, X...)
    return `M ${(x + 16 * s + tilt).toFixed(1)},${(y - 28 * s).toFixed(1)} `
        + `C ${(x - 4 * s).toFixed(1)},${(y - 34 * s).toFixed(1)} ${(x - 10 * s).toFixed(1)},${(y + 12 * s).toFixed(1)} ${(x + 10 * s).toFixed(1)},${(y + 10 * s).toFixed(1)} `
        + `C ${(x + 22 * s).toFixed(1)},${(y + 8 * s).toFixed(1)} ${(x + 16 * s).toFixed(1)},${(y - 8 * s).toFixed(1)} ${(x + 6 * s).toFixed(1)},${(y - 4 * s).toFixed(1)} `
        + `C ${(x + 12 * s).toFixed(1)},${(y + 2 * s).toFixed(1)} ${(x + 18 * s).toFixed(1)},${(y + 4 * s).toFixed(1)} ${(x + 22 * s).toFixed(1)},${(y + 3 * s).toFixed(1)} `;
}

// Generátor autentického kaligrafického Sharpie podpisu přes celé CD
function generateSharpieDiscSVG(artistName, albumName, rating) {
    const cleanArtist = String(artistName || "Artist").trim();
    const cleanAlbum = String(albumName || "Album").trim();

    const artistSeed = hashSeed(cleanArtist.toLowerCase());
    const albumSeed = hashSeed(cleanAlbum.toLowerCase());
    const randA = createRng(artistSeed);
    const randB = createRng(albumSeed);

    const words = cleanArtist.split(/\s+/).filter(Boolean);
    const firstInitial = words[0]?.[0] || "A";
    const secondInitial = words.length > 1 ? words[words.length - 1][0] : (cleanArtist[1] || "s");

    // Podpis jde úhlopříčně z levého spodního okraje (x: 34, y: 128) do pravého horního srpku (x: 186, y: 54)
    let curX = 36 + randA() * 6;
    let curY = 124 + randA() * 6;
    const slope = -0.44; // stoupání úhlopříčky směrem doprava nahoru

    // 1) První velká iniciála (např. "V")
    let sigPath = buildInitialGlyph(firstInitial, curX, curY, 1.15, randA);
    curX += 26;
    curY += 26 * slope;

    // 2) Rychlý kurzívní dozvuk prvního jména (ostrý cik-cak tahy fixou)
    const midWaves = 3 + Math.floor(randA() * 2);
    for (let i = 0; i < midWaves; i++) {
        const dx = 6 + randA() * 4;
        const spike = (i % 2 === 0 ? -1 : 1) * (7 + randA() * 8);
        const cpX = curX + dx * 0.4 + 4;
        const cpY = curY + dx * slope + spike;
        curX += dx;
        curY += dx * slope;
        sigPath += `Q ${cpX.toFixed(1)},${cpY.toFixed(1)} ${curX.toFixed(1)},${curY.toFixed(1)} `;
    }

    // 3) Druhá velká iniciála (např. "S") — posazená blízko pravé poloviny disku
    curX += 6;
    curY += 6 * slope;
    sigPath += buildInitialGlyph(secondInitial, curX, curY, 1.22, randA);
    curX += 28;
    curY += 28 * slope;

    // 4) Závěrečné rychlé vlny a dlouhý výjezd fixy až do vykukujícího pravého okraje CD
    const endWaves = 4 + Math.floor(randA() * 3);
    for (let i = 0; i < endWaves; i++) {
        const dx = 6.5 + randA() * 4.5;
        const spike = (i % 2 === 0 ? -1 : 1) * (8 + randA() * 11);
        const cpX = curX + dx * 0.35 + 5;
        const cpY = curY + dx * slope + spike;
        curX = Math.min(184, curX + dx);
        curY += dx * slope;
        sigPath += `Q ${cpX.toFixed(1)},${cpY.toFixed(1)} ${curX.toFixed(1)},${curY.toFixed(1)} `;
    }
    // Ostrý závěrečný švih ven
    sigPath += `Q ${(curX + 7).toFixed(1)},${(curY - 12).toFixed(1)} ${Math.min(189, curX + 12).toFixed(1)},${(curY - 5).toFixed(1)}`;

    // 5) Dlouhý podtrhávací tah fixou přes celé CD rovnoběžně s podpisem
    const uStartX = 34 + randA() * 6;
    const uStartY = 142 + randA() * 5;
    const uEndX = 185 - randA() * 4;
    const uEndY = 74 + randA() * 6;
    const uCtrlX = 112 + (randA() - 0.5) * 14;
    const uCtrlY = 114 + (randA() - 0.5) * 10;
    const underlineSlash = `M ${uStartX.toFixed(1)},${uStartY.toFixed(1)} Q ${uCtrlX.toFixed(1)},${uCtrlY.toFixed(1)} ${uEndX.toFixed(1)},${uEndY.toFixed(1)}`;

    // 6) Ručně připsaný název alba u spodního pravého okraje
    const albumLabel = escapeHtml(truncateLabel(cleanAlbum, 16));
    const labelX = 162;
    const labelY = 138;
    const labelAngle = 62 + (randB() - 0.5) * 8;

    // 7) Hodnocení (#8.5) na opačné straně disku
    const scoreTag = rating ? `#${rating}` : "";
    const scoreAngle = -18 + (randB() - 0.5) * 18;

    return `
        <svg class="cd-sharpie-svg" viewBox="0 0 200 200">
            <path class="sharpie-stroke-main" stroke-width="3.5" d="${sigPath}" />
            <path class="sharpie-stroke-thin" stroke-width="2.4" d="${underlineSlash}" />
            <text class="sharpie-tag-album" x="${labelX}" y="${labelY}" text-anchor="middle" transform="rotate(${labelAngle.toFixed(1)} ${labelX} ${labelY})">${albumLabel}</text>
            ${scoreTag ? `<text class="sharpie-tag-score" x="66" y="162" text-anchor="middle" transform="rotate(${scoreAngle.toFixed(1)} 66 162)">${escapeHtml(scoreTag)}</text>` : ""}
        </svg>
    `;
}
// Start
document.addEventListener("DOMContentLoaded", async () => {
    await SpotifyAPI.finishAuth();
    const token = await SpotifyAPI.getToken();
    const loginBtn = document.getElementById("login-btn");
    if (loginBtn) loginBtn.style.display = token ? "none" : "inline-block";
    renderLibrary();
});

document.getElementById("login-btn")?.addEventListener("click", () => SpotifyAPI.login());

function switchView(viewName) {
    Object.values(views).forEach(v => v?.classList.remove("active"));
    views[viewName]?.classList.add("active");
}

document.getElementById("back-to-library")?.addEventListener("click", () => {
    currentArtistFocus = null;
    switchView("library");
    renderLibrary();
});

// --- HLAVNÍ KARTOTÉKA (INTERPRETI / SAMOSTATNÁ ALBA) ---
document.getElementById("toggle-artists")?.addEventListener("click", (e) => {
    currentMode = "artists";
    updateToggleUI(e.target);
});

document.getElementById("toggle-albums")?.addEventListener("click", (e) => {
    currentMode = "albums";
    updateToggleUI(e.target);
});

function updateToggleUI(activeBtn) {
    document.querySelectorAll(".toggle-btn").forEach(btn => btn.classList.remove("active"));
    activeBtn?.classList.add("active");
    renderLibrary();
}

function renderLibrary() {
    if (!contentGrid) return;
    contentGrid.innerHTML = "";

    const seenIds = new Set();
    const items = savedMusic.filter(item => {
        if (item.type !== currentMode || seenIds.has(item.id)) return false;
        seenIds.add(item.id);
        return true;
    });

    if (items.length === 0) {
        contentGrid.innerHTML = `<div class="empty-state">Zatím tu nemáš žádné ${currentMode === "artists" ? "interprety" : "alba"}. Přidej první přes tlačítko nahoře.</div>`;
        return;
    }

    if (currentMode === "artists") {
        contentGrid.className = "content-grid";
        items.forEach(artist => {
            const count = (artistDiscographies[artist.id] || []).length;
            const card = document.createElement("div");
            card.className = "artist-simple-card";
            card.innerHTML = `
                <img src="${artist.image}" alt="${escapeHtml(artist.name)}">
                <h3>${escapeHtml(artist.name)}</h3>
                <div class="card-sub">${count > 0 ? `${count} ${count === 1 ? "nahrávka" : count < 5 ? "nahrávky" : "nahrávek"}` : "Prázdná diskografie"}</div>
            `;
            card.onclick = () => openArtistDetail(artist);
            contentGrid.appendChild(card);
        });
    } else {
        contentGrid.className = "disco-grid";
        const sortedAlbums = sortChronologically(items);
        sortedAlbums.forEach(album => {
            const card = createAlbumCard(album, "standalone", album.artistName || "");
            contentGrid.appendChild(card);
        });
        freshlyUnboxedAlbumId = null;
    }
}

// --- DETAIL INTERPRETA (RUČNĚ DOPLŇOVANÁ DISKOGRAFIE) ---
const chkAlbum = document.getElementById("filter-album");
const chkSingle = document.getElementById("filter-single");
const chkFeature = document.getElementById("filter-features");

[chkAlbum, chkSingle, chkFeature].forEach(chk => {
    chk?.addEventListener("change", () => renderArtistDiscography());
});

function openArtistDetail(artistItem) {
    currentArtistFocus = artistItem;
    document.getElementById("artist-detail-title").innerText = artistItem.name;
    const avatar = document.getElementById("artist-detail-avatar");
    if (avatar) avatar.src = artistItem.image;

    switchView("artistDetail");
    renderArtistDiscography();
}

function updateFilterCounts(curatedList) {
    const albumCount = curatedList.filter(a => a.group === "album").length;
    const singleCount = curatedList.filter(a => a.group === "single").length;
    const featureCount = curatedList.filter(a => a.group === "appears_on").length;

    document.getElementById("count-album").innerText = albumCount ? `(${albumCount})` : "";
    document.getElementById("count-single").innerText = singleCount ? `(${singleCount})` : "";
    document.getElementById("count-features").innerText = featureCount ? `(${featureCount})` : "";
}

function renderArtistDiscography() {
    if (!discoGrid || !currentArtistFocus) return;
    discoGrid.innerHTML = "";

    const rawList = artistDiscographies[currentArtistFocus.id] || [];
    const chronologicalList = sortChronologically(rawList);
    updateFilterCounts(chronologicalList);

    if (chronologicalList.length === 0) {
        discoGrid.innerHTML = `<div class="empty-state">Diskografie tohoto interpreta je zatím prázdná. Klikni na <strong>+ Přidat alba</strong> a poskládej si ji podle sebe.</div>`;
        return;
    }

    const showAlbum = chkAlbum ? chkAlbum.checked : true;
    const showSingle = chkSingle ? chkSingle.checked : true;
    const showFeature = chkFeature ? chkFeature.checked : true;

    const filtered = chronologicalList.filter(a => {
        if (a.group === "album" && showAlbum) return true;
        if (a.group === "single" && showSingle) return true;
        if (a.group === "appears_on" && showFeature) return true;
        return false;
    });

    if (filtered.length === 0) {
        discoGrid.innerHTML = `<div class="empty-state">Žádná přidaná nahrávka neodpovídá aktivním filtrům.</div>`;
        return;
    }

    filtered.forEach(album => {
        discoGrid.appendChild(createAlbumCard(album, "artist", currentArtistFocus.name));
    });
    freshlyUnboxedAlbumId = null;
}

// 3D CD JEWEL CASE KARTA S REÁLNOU HLOUBKOU A ARCHIVNÍM OBI PÁSKEM
function createAlbumCard(album, context, artistName = "") {
    const review = userReviews[album.id] || {};
    const isListened = !!review.listened;
    const rating = review.rating;
    const year = getReleaseYear(album.release_date);
    const isJustUnboxed = isListened && freshlyUnboxedAlbumId === album.id;

    const div = document.createElement("div");
    div.className = `disco-item ${isListened ? "listened" : ""} ${isJustUnboxed ? "just-unboxed" : ""}`;

    const shrinkwrapHtml = !isListened
        ? `<div class="cd-shrinkwrap"><span class="cd-hype-sticker">SEALED</span></div>`
        : "";

    const obiHtml = isListened
        ? `
        <div class="cd-obi">
            <div class="cd-obi-top">
                <span class="cd-obi-kicker">REL</span>
                <span class="cd-obi-year">${year || "CD"}</span>
            </div>
            <div class="cd-obi-mid">
                <span class="cd-obi-rule"></span>
                <span class="cd-obi-stamp">ATLAS</span>
                <span class="cd-obi-rule"></span>
            </div>
            <div class="cd-obi-bottom">
                ${rating ? `<span class="cd-obi-score">${rating}</span>` : `<span class="cd-obi-stamp">STEREO</span>`}
            </div>
        </div>`
        : "";

    const sharpieSvg = generateSharpieDiscSVG(artistName || album.artistName || "", album.name, rating);

    div.innerHTML = `
        <div class="cd-stage">
            <div class="cd-3d-rig">
                <div class="cd-back-tray"></div>
                <div class="cd-side-left"></div>
                <div class="cd-side-top"></div>
                <div class="cd-side-bottom"></div>
                <div class="cd-disc-slot">
                    <div class="cd-disc">
                        ${sharpieSvg}
                    </div>
                </div>
                <div class="cd-jewel-case">
                    <div class="cd-spine"></div>
                    <div class="cd-booklet">
                        <img src="${album.image}" alt="${escapeHtml(album.name)}" loading="lazy">
                    </div>
                    <div class="cd-acrylic-lid"></div>
                    ${shrinkwrapHtml}
                    ${obiHtml}
                </div>
            </div>
        </div>
        <div class="disco-meta">
            <h4>${escapeHtml(album.name)}</h4>
            <div class="disco-subline">
                ${year ? `<span>${year}</span>` : ""}
                ${isListened && rating ? `<span>· ${rating} / 10</span>` : ""}
            </div>
        </div>
    `;

    div.addEventListener("pointermove", (e) => {
        const rect = div.getBoundingClientRect();
        const nx = (e.clientX - rect.left) / rect.width;
        const ny = (e.clientY - rect.top) / rect.height;

        const rotateY = -7 + (nx - 0.5) * 24;
        const rotateX = 2 + (0.5 - ny) * 22;
        const discAngle = 35 + (nx - 0.5) * 95 + (ny - 0.5) * 45;

        div.style.setProperty("--rx", `${rotateX.toFixed(2)}deg`);
        div.style.setProperty("--ry", `${rotateY.toFixed(2)}deg`);
        div.style.setProperty("--gx", `${(nx * 100).toFixed(1)}%`);
        div.style.setProperty("--gy", `${(ny * 100).toFixed(1)}%`);
        div.style.setProperty("--disc-angle", `${discAngle.toFixed(1)}deg`);
    });

    div.addEventListener("pointerleave", () => {
        div.style.setProperty("--rx", "2deg");
        div.style.setProperty("--ry", "-7deg");
        div.style.setProperty("--gx", "28%");
        div.style.setProperty("--gy", "20%");
        div.style.setProperty("--disc-angle", "35deg");
    });

    div.onclick = () => openReviewModal(album, context);
    return div;
}

// --- SMOOTH PICKER PRO PŘIDÁVÁNÍ ALB DO DISKOGRAFIE ---
document.getElementById("open-album-picker-btn")?.addEventListener("click", openArtistAlbumPicker);

document.querySelectorAll(".picker-tab").forEach(tab => {
    tab.addEventListener("click", (e) => {
        document.querySelectorAll(".picker-tab").forEach(t => t.classList.remove("active"));
        e.target.classList.add("active");
        pickerGroupFilter = e.target.dataset.group;
        renderArtistAlbumPickerList();
    });
});

document.getElementById("picker-filter-input")?.addEventListener("input", () => {
    renderArtistAlbumPickerList();
});

async function openArtistAlbumPicker() {
    if (!currentArtistFocus) return;
    modals.artistAlbums.classList.add("active");

    document.getElementById("picker-subtitle").innerText = `Výběr nahrávek interpreta ${currentArtistFocus.name}`;
    const filterInput = document.getElementById("picker-filter-input");
    if (filterInput) filterInput.value = "";

    const list = document.getElementById("artist-album-results");
    list.innerHTML = `<div class="empty-state" style="padding: 32px;">Načítám katalog ze Spotify...</div>`;

    availableArtistReleases = await SpotifyAPI.getArtistReleases(currentArtistFocus.id);

    const releaseMap = new Map(availableArtistReleases.map(r => [r.id, r.group]));
    const existing = artistDiscographies[currentArtistFocus.id];
    if (existing && existing.length > 0) {
        artistDiscographies[currentArtistFocus.id] = existing.map(item => ({
            ...item,
            group: releaseMap.get(item.id) || item.group
        }));
        localStorage.setItem("atlas_artist_discographies", JSON.stringify(artistDiscographies));
        renderArtistDiscography();
    }

    renderArtistAlbumPickerList();
}

function renderArtistAlbumPickerList() {
    const list = document.getElementById("artist-album-results");
    if (!list || !currentArtistFocus) return;

    const query = (document.getElementById("picker-filter-input")?.value || "").toLowerCase().trim();
    const curatedIds = new Set((artistDiscographies[currentArtistFocus.id] || []).map(a => a.id));

    const filtered = sortChronologically(availableArtistReleases).filter(item => {
        const matchesGroup = pickerGroupFilter === "all" || item.group === pickerGroupFilter;
        const matchesText = !query || item.name.toLowerCase().includes(query);
        return matchesGroup && matchesText;
    });

    list.innerHTML = "";
    if (filtered.length === 0) {
        list.innerHTML = `<div class="empty-state" style="padding: 32px;">Žádné nahrávky nenalezeny.</div>`;
        return;
    }

    const groupLabels = {
        album: "Album",
        single: "Singl / EP",
        appears_on: "Feature"
    };

    filtered.forEach(release => {
        const isAdded = curatedIds.has(release.id);
        const row = document.createElement("div");
        row.className = `list-item ${isAdded ? "is-added" : ""}`;
        row.innerHTML = `
            <div class="list-item-left">
                <img src="${release.image}" alt="">
                <div class="list-item-info">
                    <span class="list-item-title">${escapeHtml(release.name)}</span>
                    <span class="list-item-sub">${getReleaseYear(release.release_date)} · ${groupLabels[release.group] || "Album"}</span>
                </div>
            </div>
            <span class="picker-badge">${isAdded ? "Zařazeno" : "+ Přidat"}</span>
        `;

        row.onclick = () => {
            const artistId = currentArtistFocus.id;
            const currentList = artistDiscographies[artistId] || [];

            if (curatedIds.has(release.id)) {
                artistDiscographies[artistId] = currentList.filter(a => a.id !== release.id);
            } else {
                artistDiscographies[artistId] = sortChronologically([...currentList, release]);
            }

            localStorage.setItem("atlas_artist_discographies", JSON.stringify(artistDiscographies));
            renderArtistDiscography();
            renderArtistAlbumPickerList();
        };

        list.appendChild(row);
    });
}

// --- MODAL ZÁZNAMU POSLECHU A HODNOCENÍ ---
const revListened = document.getElementById("review-listened");
const revRating = document.getElementById("review-rating");
const revText = document.getElementById("review-text");

function openReviewModal(album, context) {
    currentReviewAlbum = album;
    currentReviewContext = context;

    document.getElementById("review-cover").src = album.image;
    document.getElementById("review-title").innerText = album.name;
    document.getElementById("review-year").innerText = getReleaseYear(album.release_date);

    const review = userReviews[album.id] || {};
    revListened.checked = !!review.listened;
    revRating.value = review.rating || "";
    revText.value = review.review || "";

    toggleReviewInputs(!!review.listened);
    modals.review.classList.add("active");
}

revListened?.addEventListener("change", (e) => toggleReviewInputs(e.target.checked));

function toggleReviewInputs(enabled) {
    revRating.disabled = !enabled;
    revText.disabled = !enabled;
}

document.getElementById("save-review-btn")?.addEventListener("click", () => {
    if (currentReviewAlbum) {
        const albumId = currentReviewAlbum.id;
        const wasListened = !!userReviews[albumId]?.listened;

        if (revListened.checked) {
            userReviews[albumId] = {
                listened: true,
                rating: revRating.value || null,
                review: revText.value || ""
            };
            if (!wasListened) {
                freshlyUnboxedAlbumId = albumId;
            }
        } else {
            delete userReviews[albumId];
        }
        localStorage.setItem("atlas_user_reviews", JSON.stringify(userReviews));
    }

    modals.review.classList.remove("active");
    if (currentReviewContext === "artist") {
        renderArtistDiscography();
    } else {
        renderLibrary();
    }
});

document.getElementById("remove-album-btn")?.addEventListener("click", () => {
    if (!currentReviewAlbum) return;

    if (currentReviewContext === "artist" && currentArtistFocus) {
        const artistId = currentArtistFocus.id;
        artistDiscographies[artistId] = (artistDiscographies[artistId] || []).filter(
            a => a.id !== currentReviewAlbum.id
        );
        localStorage.setItem("atlas_artist_discographies", JSON.stringify(artistDiscographies));
        modals.review.classList.remove("active");
        renderArtistDiscography();
    } else {
        savedMusic = savedMusic.filter(item => !(item.type === "albums" && item.id === currentReviewAlbum.id));
        localStorage.setItem("atlas_music", JSON.stringify(savedMusic));
        modals.review.classList.remove("active");
        renderLibrary();
    }
});

// --- HLEDÁNÍ A PŘIDÁVÁNÍ DO HLAVNÍ KARTOTÉKY ---
document.getElementById("add-item-btn")?.addEventListener("click", () => {
    const input = document.getElementById("search-input");
    const results = document.getElementById("search-results");
    if (input) input.value = "";
    if (results) results.innerHTML = "";
    modals.search.classList.add("active");
    input?.focus();
});

let searchTimeout;
document.getElementById("search-input")?.addEventListener("input", (e) => {
    clearTimeout(searchTimeout);
    const query = e.target.value.trim();
    const type = document.querySelector('input[name="search-type"]:checked')?.value || "artist";
    if (query.length < 2) return;

    searchTimeout = setTimeout(async () => {
        const results = await SpotifyAPI.search(query, type);
        const list = document.getElementById("search-results");
        if (!list) return;
        list.innerHTML = "";

        results.forEach(res => {
            const img = res.images?.[0]?.url || "https://via.placeholder.com/150";
            const artistNames = (res.artists || []).map(a => a.name).join(", ");
            const div = document.createElement("div");
            div.className = "list-item";
            div.innerHTML = `
                <div class="list-item-left">
                    <img src="${img}" alt="">
                    <div class="list-item-info">
                        <span class="list-item-title">${escapeHtml(res.name)}</span>
                        ${type === "album" ? `<span class="list-item-sub">${escapeHtml(artistNames)}${artistNames ? " · " : ""}${getReleaseYear(res.release_date)}</span>` : ""}
                    </div>
                </div>
                <span class="picker-badge">+ Přidat</span>
            `;

            div.onclick = () => {
                const targetType = type === "artist" ? "artists" : "albums";
                const exists = savedMusic.some(m => m.type === targetType && m.id === res.id);

                if (!exists) {
                    savedMusic.push({
                        type: targetType,
                        id: res.id,
                        name: res.name,
                        artistName: type === "album" ? artistNames : "",
                        image: img,
                        release_date: res.release_date || null
                    });
                    localStorage.setItem("atlas_music", JSON.stringify(savedMusic));
                }

                currentMode = targetType;
                updateToggleUI(document.getElementById(targetType === "artists" ? "toggle-artists" : "toggle-albums"));
                modals.search.classList.remove("active");
            };
            list.appendChild(div);
        });
    }, 350);
});

document.querySelectorAll(".close-modal").forEach(btn => {
    btn.addEventListener("click", (e) => e.target.closest(".modal")?.classList.remove("active"));
});
