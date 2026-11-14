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

// Pomocná funkce pro přesné chronologické řazení (od nejstaršího po nejnovější)
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

    // Deduplikace podle ID zachová i dříve uložené položky bez závislosti na playlistech
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
                <img src="${artist.image}" alt="${artist.name}">
                <h3>${artist.name}</h3>
                <div class="card-sub">${count > 0 ? `${count} ${count === 1 ? "nahrávka" : count < 5 ? "nahrávky" : "nahrávek"}` : "Prázdná diskografie"}</div>
            `;
            card.onclick = () => openArtistDetail(artist);
            contentGrid.appendChild(card);
        });
    } else {
        contentGrid.className = "disco-grid";
        const sortedAlbums = sortChronologically(items);
        sortedAlbums.forEach(album => {
            const card = createAlbumCard(album, "standalone");
            contentGrid.appendChild(card);
        });
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
        discoGrid.appendChild(createAlbumCard(album, "artist"));
    });
}

function createAlbumCard(album, context) {
    const review = userReviews[album.id] || {};
    const isListened = !!review.listened;
    const rating = review.rating;
    const year = getReleaseYear(album.release_date);

    const div = document.createElement("div");
    div.className = `disco-item ${isListened ? "listened" : ""}`;

    const dotHtml = isListened ? `<span class="listened-dot" title="Poslechnuto"></span>` : "";
    const scoreHtml = isListened && rating ? `<span class="score-tag">${rating}</span>` : "";
    const yearHtml = year ? `<span>${year}</span>` : "";

    div.innerHTML = `
        <div class="cover-frame">
            <img src="${album.image}" alt="${album.name}">
            <div class="cover-hover-hint">${isListened ? "Upravit záznam" : "Zapsat poslech"}</div>
        </div>
        <div class="disco-meta">
            <div class="disco-title-row">
                <h4>${album.name}</h4>
            </div>
            <div class="disco-subline">
                ${dotHtml}
                ${yearHtml}
                ${scoreHtml}
            </div>
        </div>
    `;

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

    // Aktualizuje typ (Album / Singl / Feature) i u dříve zařazených položek
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
                    <span class="list-item-title">${release.name}</span>
                    <span class="list-item-sub">${getReleaseYear(release.release_date)} · ${groupLabels[release.group] || "Album"}</span>
                </div>
            </div>
            <span class="picker-badge">${isAdded ? "Zařazeno" : "+ Přidat"}</span>
        `;

        // Kliknutím plynule přidáš nebo odebereš bez zavírání okna; diskografie na pozadí se hned seřadí chronologicky
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
        if (revListened.checked) {
            userReviews[albumId] = {
                listened: true,
                rating: revRating.value || null,
                review: revText.value || ""
            };
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
            const div = document.createElement("div");
            div.className = "list-item";
            div.innerHTML = `
                <div class="list-item-left">
                    <img src="${img}" alt="">
                    <div class="list-item-info">
                        <span class="list-item-title">${res.name}</span>
                        ${type === "album" ? `<span class="list-item-sub">${getReleaseYear(res.release_date)}</span>` : ""}
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
