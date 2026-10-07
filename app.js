// Aplikativní stav
let categories = JSON.parse(localStorage.getItem('atlas_categories')) || [null, null, null, null];
let savedMusic = JSON.parse(localStorage.getItem('atlas_music')) || []; 
let currentCategoryIndex = null;
let currentMode = 'artists'; 
let myUserPlaylists = []; 
let currentArtistFocus = null; // ID interpreta v detailu
let currentReviewAlbumId = null;

// DOM
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
    document.getElementById('login-btn').style.display = token ? 'none' : 'block';
    renderDashboard();
});

document.getElementById('login-btn').addEventListener('click', () => SpotifyAPI.login());

// View navigace
document.querySelectorAll('.view-back-btn').forEach(btn => {
    btn.addEventListener('click', (e) => switchView(e.target.dataset.target));
});

function switchView(viewName) {
    Object.values(views).forEach(v => v.classList.remove('active'));
    views[viewName].classList.add('active');
}

// --- DASHBOARD ---
function renderDashboard() {
    dashboardGrid.innerHTML = '';
    for (let i = 0; i < 4; i++) {
        const cat = categories[i];
        const tile = document.createElement('div');
        tile.className = 'dash-tile ' + (cat ? 'filled' : 'empty');
        if (cat) {
            tile.innerHTML = `<img src="${cat.image}" alt=""><h2>${cat.name}</h2>`;
            tile.onclick = () => {
                currentCategoryIndex = i;
                document.getElementById('cat-title').innerText = cat.name;
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

// --- KATEGORIE (Vykreslení interpretů) ---
document.getElementById('toggle-artists').addEventListener('click', (e) => { currentMode = 'artists'; updateToggleUI(e.target); });
document.getElementById('toggle-albums').addEventListener('click', (e) => { currentMode = 'albums'; updateToggleUI(e.target); });

function updateToggleUI(activeBtn) {
    document.querySelectorAll('.toggle-btn').forEach(btn => btn.classList.remove('active'));
    activeBtn.classList.add('active');
    renderCategoryContent();
}

function renderCategoryContent() {
    contentGrid.innerHTML = '';
    const items = savedMusic.filter(item => item.catIndex === currentCategoryIndex && item.type === currentMode);
    
    if (items.length === 0) {
        contentGrid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: #666;">Prázdno.</div>`;
        return;
    }

    items.forEach(item => {
        if (item.type === 'artists') {
            // VYKRESLENÍ PROFI KARTY INTERPRETA
            const card = document.createElement('div');
            card.className = 'artist-card-pro';
            
            // Vybereme z jeho diskografie první 4 alba pro náhled
            const mainAlbums = (item.discography || []).filter(d => d.group === 'album').slice(0, 4);
            let albumsHtml = mainAlbums.map(a => `<img src="${a.image}" class="ac-album-mini">`).join('');
            
            card.innerHTML = `
                <div class="ac-header">
                    <img src="${item.image}">
                    <h3>${item.name}</h3>
                </div>
                <div class="ac-albums-grid">${albumsHtml}</div>
            `;
            
            card.onclick = () => openArtistDetail(item);
            contentGrid.appendChild(card);
        } else {
            // Normální album mimo interpreta
            const card = document.createElement('div');
            card.className = 'item-card';
            card.innerHTML = `<img src="${item.image}" style="border-radius:8px"><h3>${item.name}</h3>`;
            contentGrid.appendChild(card);
        }
    });
}

// --- DETAIL INTERPRETA (Odemykací grid) ---
const chkAlbum = document.getElementById('filter-album');
const chkSingle = document.getElementById('filter-single');
const chkFeature = document.getElementById('filter-features');

[chkAlbum, chkSingle, chkFeature].forEach(chk => chk.addEventListener('change', renderArtistDiscography));

function openArtistDetail(artistItem) {
    currentArtistFocus = artistItem;
    document.getElementById('artist-detail-title').innerText = artistItem.name;
    switchView('artistDetail');
    renderArtistDiscography();
}

function renderArtistDiscography() {
    if (!currentArtistFocus) return;
    discoGrid.innerHTML = '';
    
    const showAlbum = chkAlbum.checked;
    const showSingle = chkSingle.checked;
    const showFeature = chkFeature.checked;

    const filtered = currentArtistFocus.discography.filter(a => {
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

// --- HODNOCENÍ ALBA ---
const revListened = document.getElementById('review-listened');
const revRating = document.getElementById('review-rating');
const revText = document.getElementById('review-text');

function openReviewModal(album) {
    currentReviewAlbumId = album.id;
    document.getElementById('review-cover').src = album.image;
    document.getElementById('review-title').innerText = album.name;
    
    revListened.checked = album.listened;
    revRating.value = album.rating || '';
    revText.value = album.review || '';
    
    toggleReviewInputs(album.listened);
    modals.review.classList.add('active');
}

revListened.addEventListener('change', (e) => {
    toggleReviewInputs(e.target.checked);
});

function toggleReviewInputs(enabled) {
    revRating.disabled = !enabled;
    revText.disabled = !enabled;
}

document.getElementById('save-review-btn').addEventListener('click', () => {
    // Najdeme album v daném interpretovi a uložíme
    const album = currentArtistFocus.discography.find(a => a.id === currentReviewAlbumId);
    if (album) {
        album.listened = revListened.checked;
        album.rating = revListened.checked ? (revRating.value || null) : null;
        album.review = revListened.checked ? (revText.value || "") : "";
        localStorage.setItem('atlas_music', JSON.stringify(savedMusic));
    }
    modals.review.classList.remove('active');
    renderArtistDiscography(); // Znovu vyrenderuje, aby problikla barva a fajfka
});


// --- PŘIDÁVÁNÍ DO KNIHOVNY (Search) ---
document.getElementById('add-item-btn').addEventListener('click', () => {
    modals.search.classList.add('active');
});

let searchTimeout;
document.getElementById('search-input').addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    const query = e.target.value;
    const type = document.querySelector('input[name="search-type"]:checked').value;
    if (query.length < 2) return;
    
    searchTimeout = setTimeout(async () => {
        const results = await SpotifyAPI.search(query, type);
        const list = document.getElementById('search-results');
        list.innerHTML = '';
        
        results.forEach(res => {
            const div = document.createElement('div');
            div.className = 'list-item';
            const img = res.images?.length > 0 ? res.images[0].url : 'https://via.placeholder.com/150';
            div.innerHTML = `<img src="${img}"><span>${res.name}</span>`;
            
            div.onclick = async () => {
                // Pokud přidáváme interpreta, stáhneme celou diskografii
                div.innerHTML = '<span>Stahuji diskografii...</span>';
                
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
                    discography: discography // Tady se to uloží!
                });
                localStorage.setItem('atlas_music', JSON.stringify(savedMusic));
                modals.search.classList.remove('active');
                renderCategoryContent();
            };
            list.appendChild(div);
        });
    }, 500);
});

// Zbytek (Modal playlisty atd.)
async function openPlaylistModal(slotIndex) {
    modals.playlist.classList.add('active');
    document.getElementById('playlist-search-input').value = '';
    document.getElementById('playlist-list').innerHTML = '<div style="padding: 20px; color: #888;">Načítám...</div>';
    myUserPlaylists = await SpotifyAPI.getUserPlaylists();
    renderPlaylistSelection(myUserPlaylists, slotIndex);

    document.getElementById('playlist-search-input').oninput = (e) => {
        const q = e.target.value.toLowerCase().trim();
        renderPlaylistSelection(myUserPlaylists.filter(pl => (pl?.name||'').toLowerCase().includes(q)), slotIndex);
    };
}

function renderPlaylistSelection(playlists, slotIndex) {
    const list = document.getElementById('playlist-list');
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
            modals.playlist.classList.remove('active');
            renderDashboard();
        };
        list.appendChild(div);
    });
}

document.querySelectorAll('.close-modal').forEach(btn => {
    btn.addEventListener('click', (e) => e.target.closest('.modal').classList.remove('active'));
});
