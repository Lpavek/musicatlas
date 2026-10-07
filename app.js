// Aplikativní stav
let categories = JSON.parse(localStorage.getItem('atlas_categories')) || [null, null, null, null];
let savedMusic = JSON.parse(localStorage.getItem('atlas_music')) || []; 
// Ukládáme si tvoje recenze v objektu podle ID alba: { "album_id": { listened: true, rating: "8.5", review: "Skvělý" } }
let userReviews = JSON.parse(localStorage.getItem('atlas_user_reviews')) || {};

let currentCategoryIndex = null;
let currentMode = 'artists'; 
let myUserPlaylists = []; 
let currentArtistFocus = null; 
let currentReviewAlbum = null;

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

// --- STRÁNKA KATEGORIE (SEZNAM INTERPRETŮ) ---
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
        contentGrid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: #666; margin-top: 40px;">Zatím žádní ${currentMode === 'artists' ? 'interpreti' : 'alba'}. Přidej je tlačítkem nahoře.</div>`;
        return;
    }

    items.forEach(item => {
        const card = document.createElement('div');
        card.className = 'artist-simple-card';
        card.innerHTML = `
            <img src="${item.image}" alt="${item.name}">
            <h3>${item.name}</h3>
        `;
        card.onclick = () => openArtistDetail(item);
        contentGrid.appendChild(card);
    });
}

// --- DETAIL INTERPRETA (ŽIVÉ NAČTENÍ DISKOGRAFIE ZE SPOTIFY) ---
const chkAlbum = document.getElementById('filter-album');
const chkSingle = document.getElementById('filter-single');
const chkFeature = document.getElementById('filter-features');

[chkAlbum, chkSingle, chkFeature].forEach(chk => {
    if (chk) chk.addEventListener('change', () => renderArtistDiscography());
});

let loadedDiscography = [];

async function openArtistDetail(artistItem) {
    currentArtistFocus = artistItem;
    const titleEl = document.getElementById('artist-detail-title');
    if (titleEl) titleEl.innerText = artistItem.name;
    
    switchView('artistDetail');
    discoGrid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: #1db954; font-size: 18px; margin-top: 40px;">Načítám diskografii ze Spotify...</div>`;
    
    // Načtení diskografie živě ze Spotify
    loadedDiscography = await SpotifyAPI.getArtistDiscography(artistItem.id);
    renderArtistDiscography();
}

function renderArtistDiscography() {
    if (!discoGrid) return;
    discoGrid.innerHTML = '';
    
    if (loadedDiscography.length === 0) {
        discoGrid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: #888; margin-top: 40px;">Nepodařilo se načíst žádná alba ze Spotify.</div>`;
        return;
    }

    const showAlbum = chkAlbum ? chkAlbum.checked : true;
    const showSingle = chkSingle ? chkSingle.checked : false;
    const showFeature = chkFeature ? chkFeature.checked : false;

    const filtered = loadedDiscography.filter(a => {
        if (a.group === 'album' && showAlbum) return true;
        if (a.group === 'single' && showSingle) return true;
        if (a.group === 'appears_on' && showFeature) return true;
        return false;
    });

    filtered.forEach(album => {
        const div = document.createElement('div');
        
        // Zkontrolujeme, zda má uživatel pro toto album uloženou recenzi
        const userReview = userReviews[album.id] || {};
        const isListened = !!userReview.listened;
        const rating = userReview.rating || null;

        div.className = `disco-item ${isListened ? 'unlocked' : 'locked'}`;
        let ratingHtml = rating ? `<div class="rating-badge">⭐ ${rating}</div>` : '';
        
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

// --- MODAL RECENZE A HODNOCENÍ ---
const revListened = document.getElementById('review-listened');
const revRating = document.getElementById('review-rating');
const revText = document.getElementById('review-text');

function openReviewModal(album) {
    currentReviewAlbum = album;
    const coverEl = document.getElementById('review-cover');
    const titleEl = document.getElementById('review-title');
    
    if (coverEl) coverEl.src = album.image;
    if (titleEl) titleEl.innerText = album.name;
    
    const review = userReviews[album.id] || {};
    if (revListened) revListened.checked = !!review.listened;
    if (revRating) revRating.value = review.rating || '';
    if (revText) revText.value = review.review || '';
    
    toggleReviewInputs(!!review.listened);
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
            localStorage.setItem('atlas_user_reviews', JSON.stringify(userReviews));
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
                
                div.onclick = () => {
                    savedMusic.push({ 
                        catIndex: currentCategoryIndex, 
                        type: type === 'artist' ? 'artists' : 'albums', 
                        id: res.id, 
                        name: res.name, 
                        image: img
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

document.querySelectorAll('.close-modal').forEach(btn => {
    btn.addEventListener('click', (e) => e.target.closest('.modal').classList.remove('active'));
});
