// Data State
let categories = JSON.parse(localStorage.getItem('atlas_categories')) || [null, null, null, null];
let savedMusic = JSON.parse(localStorage.getItem('atlas_music')) || []; 
let currentCategoryIndex = null;
let currentMode = 'artists'; // 'artists' nebo 'albums'

// DOM Elements
const views = { home: document.getElementById('home-view'), category: document.getElementById('category-view') };
const dashboardGrid = document.getElementById('dashboard-grid');
const contentGrid = document.getElementById('content-grid');
const modals = { playlist: document.getElementById('modal-playlist'), search: document.getElementById('modal-search') };

// Init
document.addEventListener('DOMContentLoaded', async () => {
    await SpotifyAPI.finishAuth();
    const token = await SpotifyAPI.getToken();
    document.getElementById('login-btn').style.display = token ? 'none' : 'block';
    renderDashboard();
});

document.getElementById('login-btn').addEventListener('click', () => SpotifyAPI.login());

// --- DASHBOARD LOGIC ---
function renderDashboard() {
    dashboardGrid.innerHTML = '';
    for (let i = 0; i < 4; i++) {
        const cat = categories[i];
        const tile = document.createElement('div');
        tile.className = 'dash-tile ' + (cat ? 'filled' : 'empty');
        
        if (cat) {
            tile.innerHTML = `<img src="${cat.image}" alt=""><h2 class="shadow-text">${cat.name}</h2>`;
            tile.onclick = () => openCategory(i);
        } else {
            tile.innerHTML = `<div class="plus-icon">+</div>`;
            tile.onclick = () => openPlaylistModal(i);
        }
        dashboardGrid.appendChild(tile);
    }
}

// --- CATEGORY VIEW LOGIC ---
function openCategory(index) {
    currentCategoryIndex = index;
    const cat = categories[index];
    document.getElementById('cat-title').innerText = cat.name;
    switchView('category');
    renderCategoryContent();
}

document.getElementById('back-btn').addEventListener('click', () => switchView('home'));

// Toggle Interpreti / Alba
document.getElementById('toggle-artists').addEventListener('click', (e) => {
    currentMode = 'artists';
    updateToggleUI(e.target);
    renderCategoryContent();
});
document.getElementById('toggle-albums').addEventListener('click', (e) => {
    currentMode = 'albums';
    updateToggleUI(e.target);
    renderCategoryContent();
});

function updateToggleUI(activeBtn) {
    document.querySelectorAll('.toggle-btn').forEach(btn => btn.classList.remove('active'));
    activeBtn.classList.add('active');
    contentGrid.className = `content-grid ${currentMode}-mode`;
}

function renderCategoryContent() {
    contentGrid.innerHTML = '';
    // Filtrace položek patřících do aktuální kategorie a aktuálního módu (interpret/album)
    const items = savedMusic.filter(item => item.catIndex === currentCategoryIndex && item.type === currentMode);
    
    // Zde bychom ideálně ještě přidali logiku: pokud jsem v módu 'Alba', ukaž všechna alba, která jsem si uložil, 
    // PLUS teoreticky alba interpretů, co mám uložené. Pro zjednodušení teď bereme věci výslovně uložené.
    
    items.forEach(item => {
        const card = document.createElement('div');
        card.className = 'item-card';
        card.innerHTML = `<img src="${item.image}" alt="${item.name}"><h3>${item.name}</h3>`;
        contentGrid.appendChild(card);
    });
}

// --- MODALS & ADDING DATA ---
async function openPlaylistModal(slotIndex) {
    modals.playlist.classList.add('active');
    const list = document.getElementById('playlist-list');
    list.innerHTML = 'Načítám tvé playlisty...';
    
    const playlists = await SpotifyAPI.getUserPlaylists();
    list.innerHTML = '';
    
    playlists.forEach(pl => {
        const div = document.createElement('div');
        div.className = 'list-item';
        const img = pl.images.length > 0 ? pl.images[0].url : '';
        div.innerHTML = `<img src="${img}"><span>${pl.name}</span>`;
        div.onclick = () => {
            categories[slotIndex] = { name: pl.name, image: img, id: pl.id };
            localStorage.setItem('atlas_categories', JSON.stringify(categories));
            modals.playlist.classList.remove('active');
            renderDashboard();
        };
        list.appendChild(div);
    });
}

document.getElementById('add-item-btn').addEventListener('click', () => {
    modals.search.classList.add('active');
});

// Vyhledávání interpretů a alb
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
            const img = res.images?.length > 0 ? res.images[0].url : '';
            div.innerHTML = `<img src="${img}"><span>${res.name}</span>`;
            div.onclick = () => {
                savedMusic.push({ catIndex: currentCategoryIndex, type: type, id: res.id, name: res.name, image: img });
                localStorage.setItem('atlas_music', JSON.stringify(savedMusic));
                modals.search.classList.remove('active');
                renderCategoryContent();
            };
            list.appendChild(div);
        });
    }, 500);
});

// Univerzální zavírání modalů
document.querySelectorAll('.close-modal').forEach(btn => {
    btn.addEventListener('click', (e) => e.target.closest('.modal').classList.remove('active'));
});

// Utilities
function switchView(viewName) {
    Object.values(views).forEach(v => v.classList.remove('active'));
    views[viewName].classList.add('active');
}