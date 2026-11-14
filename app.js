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

function sortChronologically(albums) {
    return [...albums].sort(
        (a, b) => normalizeReleaseTimestamp(a.release_date) - normalizeReleaseTimestamp(b.release_date)
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

// Generátor reálného Sharpie podpisu + ručně napsaného názvu alba na CD
// Generátor reálného Sharpie podpisu + čitelného názvu alba ve viditelné části CD
function generateSharpieDiscSVG(artistName, albumName, rating) {
    const artistSeed = hashSeed((artistName || "artist").toLowerCase());
    const albumSeed = hashSeed((albumName || "album").toLowerCase());
    const randA = createRng(artistSeed);
    const randB = createRng(albumSeed);

    // 1) Autogram interpreta v horním pravém srpku (x: 144..186, y: 42..82) — celý viditelný i v klidu
    const startX = 146 + randA() * 6;
    const startY = 64 + randA() * 8;
    const loopH = 22 + randA() * 10;
    const loopW = 10 + randA() * 7;

    let sigPath = `M ${startX.toFixed(1)},${startY.toFixed(1)} `;
    sigPath += `C ${(startX + loopW * 1.3).toFixed(1)},${(startY - loopH).toFixed(1)} `;
    sigPath += `${(startX - loopW * 0.4).toFixed(1)},${(startY - loopH * 0.85).toFixed(1)} `;
    sigPath += `${(startX + 3).toFixed(1)},${(startY + 4).toFixed(1)} `;

    const peak2X = startX + 10 + randA() * 6;
    const peak2Y = startY - (16 + randA() * 9);
    sigPath += `Q ${(startX + 6).toFixed(1)},${(peak2Y - 2).toFixed(1)} ${peak2X.toFixed(1)},${(startY + 2).toFixed(1)} `;

    let curX = peak2X;
    let curY = startY + 1;
    const steps = 4 + Math.floor(randA() * 3);
    for (let i = 0; i < steps; i++) {
        const dx = 3.5 + randA() * 4;
        const upH = (i % 2 === 0 ? -1 : 1) * (4 + randA() * 7);
        const cpX = curX + dx * 0.5 + 2;
        const cpY = curY + upH;
        curX = Math.min(187, curX + dx);
        curY = startY + (randA() - 0.45) * 6;
        sigPath += `Q ${cpX.toFixed(1)},${cpY.toFixed(1)} ${curX.toFixed(1)},${curY.toFixed(1)} `;
    }

    const slashStartX = startX - 3;
    const slashStartY = startY + 8 + randA() * 3;
    const slashEndX = Math.min(188, curX + 2);
    const slashEndY = slashStartY - (5 + randA() * 5);
    const slashCtrlX = (slashStartX + slashEndX) * 0.5;
    const slashCtrlY = slashStartY + 3 + randA() * 3;
    const flourishPath = `M ${slashStartX.toFixed(1)},${slashStartY.toFixed(1)} Q ${slashCtrlX.toFixed(1)},${slashCtrlY.toFixed(1)} ${slashEndX.toFixed(1)},${slashEndY.toFixed(1)}`;

    // 2) Ručně psaný název alba podél pravého oblouku disku (x: 168, y: 122) — 100% čitelný v defaultu
    const albumLabel = escapeHtml(truncateLabel(albumName, 16));
    const labelX = 168;
    const labelY = 122;
    const labelAngle = 78 + (randB() - 0.5) * 10;

    // 3) Značka hodnocení (#8.5) na opačné straně disku (objeví se při roztočení)
    const scoreTag = rating ? `#${rating}` : "";
    const scoreAngle = -16 + (randB() - 0.5) * 20;

    return `
        <svg class="cd-sharpie-svg" viewBox="0 0 200 200">
            <path class="sharpie-stroke-main" stroke-width="3.2" d="${sigPath}" />
            <path class="sharpie-stroke-thin" stroke-width="2.2" d="${flourishPath}" />
            <text class="sharpie-tag-album" x="${labelX}" y="${labelY}" text-anchor="middle" transform="rotate(${labelAngle.toFixed(1)} ${labelX} ${labelY})">${albumLabel}</text>
            ${scoreTag ? `<text class="sharpie-tag-score" x="58" y="136" text-anchor="middle" transform="rotate(${scoreAngle.toFixed(1)} 58 136)">${escapeHtml(scoreTag)}</text>` : ""}
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

// 3D CD JEWEL CASE KARTA S SHARPIE PODPISEM A ROTACÍ PŘI HOVERU
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
            <span class="cd-obi-year">${year || "CD"}</span>
            ${rating ? `<span class="cd-obi-line"></span><span class="cd-obi-score">${rating}</span>` : ""}
        </div>`
        : "";

    const sharpieSvg = generateSharpieDiscSVG(artistName || album.artistName || "", album.name, rating);

    div.innerHTML = `
        <div class="cd-stage">
            <div class="cd-3d-rig">
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

        const rotateY = (nx - 0.5) * 22;
        const rotateX = (0.5 - ny) * 20;
        const discAngle = 35 + (nx - 0.5) * 95 + (ny - 0.5) * 45;

        div.style.setProperty("--rx", `${rotateX.toFixed(2)}deg`);
        div.style.setProperty("--ry", `${rotateY.toFixed(2)}deg`);
        div.style.setProperty("--gx", `${(nx * 100).toFixed(1)}%`);
        div.style.setProperty("--gy", `${(ny * 100).toFixed(1)}%`);
        div.style.setProperty("--disc-angle", `${discAngle.toFixed(1)}deg`);
    });

    div.addEventListener("pointerleave", () => {
        div.style.setProperty("--rx", "0deg");
        div.style.setProperty("--ry", "0deg");
        div.style.setProperty("--gx", "30%");
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
