// Aplikativní stav
let categories = JSON.parse(localStorage.getItem('atlas_categories')) || [null, null, null, null];
let savedMusic = JSON.parse(localStorage.getItem('atlas_music')) || []; 
let currentCategoryIndex = null;
let currentMode = 'artists'; 
let myUserPlaylists = []; 
let currentArtistFocus = null; 
let currentReviewAlbumId = null;

// DOM Elementy
const views = { 
    home: document.getElementById('home-view'), 
    category: document.getElementById('category-view'),
    artistDetail: document.getElementById('artist-detail-view')
};
const dashboardGrid = document.getElementById('dashboard-grid');
const contentGrid = document.getElementById('content-grid');
const discoGrid = document.getElementById('discography-grid');
const modals = { 
    playlist: document.getElementById('modal-playlist'), 
    search: document.getElementById('modal-search'),
    review: document.getElementById('modal-review')
};

// Start
document.addEventListener('DOMContentLoaded', async () => {
    await SpotifyAPI.finishAuth();
    const token = await SpotifyAPI.getToken();
    const loginBtn = document.getElementById('login-btn');
    if (loginBtn) loginBtn.style.display = token ? 'none' : 'block';
    renderDashboard();
});

const loginBtn = document.getElementById('login-btn');
if (loginBtn) loginBtn.addEventListener('click', () => SpotifyAPI.login());

// Navigace zpět
document.querySelectorAll('.view-back-btn').forEach(btn => {
    btn.addEventListener('click', (e) => switchView(e.target.dataset.target));
});

function switchView(viewName) {
    Object.values(views).forEach(v => { if (v) v.classList.remove('active'); });
    if (views[viewName]) views[viewName].classList.add('active');
}

// --- DASHBOARD ---
function renderDashboard() {
    if (!dashboardGrid) return;
    dashboardGrid.innerHTML = '';
    for (let i = 0; i < 4; i++) {
        const cat = categories[i];
        const tile = document.createElement('div');
        tile.className = 'dash-tile ' + (cat ? 'filled' : 'empty');
        if (cat) {
            tile.innerHTML = `<img src="${cat.image}" alt=""><h2>${cat.name}</h2>`;
            tile.onclick = () => {
                currentCategoryIndex = i;
                const titleEl = document.getElementById('cat-title');
                if (titleEl) titleEl.innerText = cat.name;
                switchView('category');
                renderCategoryContent();
            };
        } else {
            tile.innerHTML = `<div class="plus-icon">+</div>`;
            tile.onclick = () => openPlaylistModal(i);
        }
        dashboardGrid.appendChild(tile);
    }
}

// --- STRÁNKA KATEGORIE ---
const toggleArt = document.getElementById('toggle-artists');
const toggleAlb = document.getElementById('toggle-albums');

if (toggleArt) toggleArt.addEventListener('click', (e) => { currentMode = 'artists'; updateToggleUI(e.target); });
if (toggleAlb) toggleAlb.addEventListener('click', (e) => { currentMode = 'albums'; updateToggleUI(e.target); });

function updateToggleUI(activeBtn) {
    document.querySelectorAll('.toggle-btn').forEach(btn => btn.classList.remove('active'));
    if (activeBtn) activeBtn.classList.add('active');
    renderCategoryContent();
}

function renderCategoryContent() {
    if (!contentGrid) return;
    contentGrid.innerHTML = '';
    const items = savedMusic.filter(item => item.catIndex === currentCategoryIndex && item.type === currentMode);
    
    if (items.length === 0) {
        contentGrid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: #666; margin-top: 40px;">Žádní ${currentMode === 'artists' ? 'interpreti' : 'alba'}. Přidej je tlačítkem nahoře.</div>`;
        return;
    }

    items.forEach(item => {
        if (item.type === 'artists') {
            const card = document.createElement('div');
            card.className = 'artist-card';
            
            // Bezpečná kontrola discography
            const disco = Array.isArray(item.discography) ? item.discography : [];
            const previewAlbums = disco.slice(0, 4);
            let albumsHtml = previewAlbums.map(a => `<img src="${a.image}" class="album-mini-cover">`).join('');
            
            while (previewAlbums.length < 4) {
                albumsHtml += `<div class="album-mini-cover"></div>`;
                previewAlbums.push(null);
            }

            card.innerHTML = `
                <div class="artist-header">
                    <img src="${item.image}" class="artist-avatar" alt="${item.name}">
                    <div class="artist-name">${item.name}</div>
                </div>
                <div class="artist-albums-preview">
                    ${albumsHtml}
                </div>
            `;
            
            card.onclick = () => openArtistDetail(item);
            contentGrid.appendChild(card);
        } else {
            const card = document.createElement('div');
            card.className = 'album-card-standalone';
            card.innerHTML = `<img src="${item.image}"><h3>${item.name}</h3>`;
            contentGrid.appendChild(card);
        }
    });
}

// --- DETAIL INTERPRETA (DISKOGRAFIE) ---
const chkAlbum = document.getElementById('filter-album');
const chkSingle = document.getElementById('filter-single');
const chkFeature = document.getElementById('filter-features');

[chkAlbum, chkSingle, chkFeature].forEach(chk => {
    if (chk) chk.addEventListener('change', renderArtistDiscography);
});

function openArtistDetail(artistItem) {
    currentArtistFocus = artistItem;
    // Pojistka pro stará data
    if (!Array.isArray(currentArtistFocus.discography)) {
        currentArtistFocus.discography = [];
    }
    
    const titleEl = document.getElementById('artist-detail-title');
    if (titleEl) titleEl.innerText = artistItem.name;
    switchView('artistDetail');
    renderArtistDiscography();
}

function renderArtistDiscography() {
    if (!currentArtistFocus || !discoGrid) return;
    discoGrid.innerHTML = '';
    
    const disco = Array.isArray(currentArtistFocus.discography) ? currentArtistFocus.discography : [];

    if (disco.length === 0) {
        discoGrid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: #888; margin-top: 40px;">Žádná alba nebyla načtena. Zkus interpreta odebrat a přidat znovu.</div>`;
        return;
    }

    const showAlbum = chkAlbum ? chkAlbum.checked : true;
    const showSingle = chkSingle ? chkSingle.checked : false;
    const showFeature = chkFeature ? chkFeature.checked : false;

    const filtered = disco.filter(a => {
        if (a.group === 'album' && showAlbum) return true;
        if (a.group === 'single' && showSingle) return true;
        if (a.group === 'appears_on' && showFeature) return true;
        return false;
    });

    filtered.forEach(album => {
        const div = document.createElement('div');
        const stateClass = album.listened ? 'unlocked' : 'locked';
        div.className = `disco-item ${stateClass}`;
        
        let ratingHtml = album.rating ? `<div class="rating-badge">⭐ ${album.rating}</div>` : '';
        
        div.innerHTML = `
            <img src="${album.image}">
            <div class="checkmark">✓</div>
            ${ratingHtml}
            <h4>${album.name}</h4>
        `;
        div.onclick = () => openReviewModal(album);
        discoGrid.appendChild(div);
    });
}

// --- REVIEW MODAL ---
const revListened = document.getElementById('review-listened');
const revRating = document.getElementById('review-rating');
const revText = document.getElementById('review-text');

function openReviewModal(album) {
    currentReviewAlbumId = album.id;
    const coverEl = document.getElementById('review-cover');
    const titleEl = document.getElementById('review-title');
    
    if (coverEl) coverEl.src = album.image;
    if (titleEl) titleEl.innerText = album.name;
    
    if (revListened) revListened.checked = album.listened;
    if (revRating) revRating.value = album.rating || '';
    if (revText) revText.value = album.review || '';
    
    toggleReviewInputs(album.listened);
    if (modals.review) modals.review.classList.add('active');
}

if (revListened) {
    revListened.addEventListener('change', (e) => toggleReviewInputs(e.target.checked));
}

function toggleReviewInputs(enabled) {
    if (revRating) revRating.disabled = !enabled;
    if (revText) revText.disabled = !enabled;
}

const saveRevBtn = document.getElementById('save-review-btn');
if (saveRevBtn) {
    saveRevBtn.addEventListener('click', () => {
        if (currentArtistFocus && Array.isArray(currentArtistFocus.discography)) {
            const album = currentArtistFocus.discography.find(a => a.id === currentReviewAlbumId);
            if (album) {
                album.listened = revListened.checked;
                album.rating = revListened.checked ? (revRating.value || null) : null;
                album.review = revListened.checked ? (revText.value || "") : "";
                localStorage.setItem('atlas_music', JSON.stringify(savedMusic));
            }
        }
        if (modals.review) modals.review.classList.remove('active');
        renderArtistDiscography();
    });
}

// --- SEARCH & PŘIDÁNÍ ---
const addItemBtn = document.getElementById('add-item-btn');
if (addItemBtn) {
    addItemBtn.addEventListener('click', () => {
        if (modals.search) modals.search.classList.add('active');
    });
}

let searchTimeout;
const searchInput = document.getElementById('search-input');
if (searchInput) {
    searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        const query = e.target.value;
        const typeEl = document.querySelector('input[name="search-type"]:checked');
        const type = typeEl ? typeEl.value : 'artist';
        if (query.length < 2) return;
        
        searchTimeout = setTimeout(async () => {
            const results = await SpotifyAPI.search(query, type);
            const list = document.getElementById('search-results');
            if (!list) return;
            list.innerHTML = '';
            
            results.forEach(res => {
                const div = document.createElement('div');
                div.className = 'list-item';
                const img = res.images?.length > 0 ? res.images[0].url : 'https://via.placeholder.com/150';
                div.innerHTML = `<img src="${img}"><span>${res.name}</span>`;
                
                div.onclick = async () => {
                    div.innerHTML = '<span style="color:#1db954; font-weight:bold;">Načítám celou diskografii...</span>';
                    
                    let discography = [];
                    if (type === 'artist') {
                        discography = await SpotifyAPI.getArtistDiscography(res.id);
                    }
                    
                    savedMusic.push({ 
                        catIndex: currentCategoryIndex, 
                        type: type === 'artist' ? 'artists' : 'albums', 
                        id: res.id, 
                        name: res.name, 
                        image: img,
                        discography: discography 
                    });
                    localStorage.setItem('atlas_music', JSON.stringify(savedMusic));
                    if (modals.search) modals.search.classList.remove('active');
                    renderCategoryContent();
                };
                list.appendChild(div);
            });
        }, 500);
    });
}

// Playlist Modal
async function openPlaylistModal(slotIndex) {
    if (modals.playlist) modals.playlist.classList.add('active');
    const input = document.getElementById('playlist-search-input');
    const list = document.getElementById('playlist-list');
    if (input) input.value = '';
    if (list) list.innerHTML = '<div style="padding: 20px; color: #888;">Načítám...</div>';
    
    myUserPlaylists = await SpotifyAPI.getUserPlaylists();
    renderPlaylistSelection(myUserPlaylists, slotIndex);

    if (input) {
        input.oninput = (e) => {
            const q = e.target.value.toLowerCase().trim();
            renderPlaylistSelection(myUserPlaylists.filter(pl => (pl?.name||'').toLowerCase().includes(q)), slotIndex);
        };
    }
}

function renderPlaylistSelection(playlists, slotIndex) {
    const list = document.getElementById('playlist-list');
    if (!list) return;
    list.innerHTML = '';
    playlists.forEach(pl => {
        if (!pl) return;
        const div = document.createElement('div');
        div.className = 'list-item';
        const img = (pl.images && pl.images[0]?.url) ? pl.images[0].url : 'https://via.placeholder.com/150';
        div.innerHTML = `<img src="${img}"><div><span style="font-weight:bold;color:white;">${pl.name}</span></div>`;
        div.onclick = () => {
            categories[slotIndex] = { name: pl.name, image: img, id: pl.id };
            localStorage.setItem('atlas_categories', JSON.stringify(categories));
            if (modals.playlist) modals.playlist.classList.remove('active');
            renderDashboard();
        };
        list.appendChild(div);
    });
}

// Zavírání
document.querySelectorAll('.close-modal').forEach(btn => {
    btn.addEventListener('click', (e) => e.target.closest('.modal').classList.remove('active'));
});
