// Aplikativní stav
let categories = JSON.parse(localStorage.getItem('atlas_categories')) || [null, null, null, null];
let savedMusic = JSON.parse(localStorage.getItem('atlas_music')) || []; 
let currentCategoryIndex = null;
let currentMode = 'artists'; // 'artists' nebo 'albums'
let myUserPlaylists = []; // Paměť pro prohledávání playlistů

// DOM elementy
const views = { 
    home: document.getElementById('home-view'), 
    category: document.getElementById('category-view') 
};
const dashboardGrid = document.getElementById('dashboard-grid');
const contentGrid = document.getElementById('content-grid');
const modals = { 
    playlist: document.getElementById('modal-playlist'), 
    search: document.getElementById('modal-search') 
};

// Inicializace po načtení
document.addEventListener('DOMContentLoaded', async () => {
    await SpotifyAPI.finishAuth();
    const token = await SpotifyAPI.getToken();
    document.getElementById('login-btn').style.display = token ? 'none' : 'block';
    renderDashboard();
});

document.getElementById('login-btn').addEventListener('click', () => SpotifyAPI.login());

// --- DOMOVSKÁ STRÁNKA (GRID 4 DLAŽDIC) ---
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

// --- STRÁNKA KATEGORIE ---
function openCategory(index) {
    currentCategoryIndex = index;
    const cat = categories[index];
    document.getElementById('cat-title').innerText = cat.name;
    switchView('category');
    renderCategoryContent();
}

document.getElementById('back-btn').addEventListener('click', () => switchView('home'));

// Přepínání módu: Interpreti / Alba
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
    // Odfiltrovat položky patřící do otevřené kategorie a módu
    const items = savedMusic.filter(item => item.catIndex === currentCategoryIndex && item.type === currentMode);
    
    if (items.length === 0) {
        contentGrid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: #666; margin-top: 40px;">Zatím zde nemáš žádné ${currentMode === 'artists' ? 'interprety' : 'alba'}. Přidej je tlačítkem nahoře.</div>`;
        return;
    }

    items.forEach(item => {
        const card = document.createElement('div');
        card.className = 'item-card';
        card.innerHTML = `<img src="${item.image}" alt="${item.name}"><h3>${item.name}</h3>`;
        contentGrid.appendChild(card);
    });
}

// --- MODÁLNÍ OKNO: VÝBĚR PLAYLISTU PRO DLAŽDICI ---
async function openPlaylistModal(slotIndex) {
    modals.playlist.classList.add('active');
    const list = document.getElementById('playlist-list');
    const searchInput = document.getElementById('playlist-search-input');
    
    searchInput.value = '';
    list.innerHTML = '<div style="text-align: center; color: #888; padding: 20px;">Načítám všechny tvoje vlastní playlisty...</div>';
    
    // Načtení všech vlastních playlistů
    myUserPlaylists = await SpotifyAPI.getUserPlaylists();
    renderPlaylistSelection(myUserPlaylists, slotIndex);

    // Vyhledávání v reálném čase podle názvu
    searchInput.oninput = (e) => {
        const query = e.target.value.toLowerCase().trim();
        const filtered = myUserPlaylists.filter(pl => pl.name.toLowerCase().includes(query));
        renderPlaylistSelection(filtered, slotIndex);
    };
}

function renderPlaylistSelection(playlists, slotIndex) {
    const list = document.getElementById('playlist-list');
    list.innerHTML = '';
    
    if (playlists.length === 0) {
        list.innerHTML = '<div style="padding: 15px; color: #888; text-align: center;">Žádný playlist nenalezen.</div>';
        return;
    }
    
    playlists.forEach(pl => {
        const div = document.createElement('div');
        div.className = 'list-item';
        const img = (pl.images && pl.images.length > 0) ? pl.images[0].url : 'https://via.placeholder.com/150?text=Bez+Obrázku';
        
        div.innerHTML = `
            <img src="${img}" alt="${pl.name}">
            <div style="display: flex; flex-direction: column;">
                <span style="font-weight: bold; color: white;">${pl.name}</span>
                <span style="font-size: 12px; color: #888;">${pl.tracks?.total || 0} skladeb</span>
            </div>
        `;
        
        div.onclick = () => {
            categories[slotIndex] = { name: pl.name, image: img, id: pl.id };
            localStorage.setItem('atlas_categories', JSON.stringify(categories));
            modals.playlist.classList.remove('active');
            renderDashboard();
        };
        list.appendChild(div);
    });
}

// --- MODÁLNÍ OKNO: PRIDAVANI HUDY (SEARCH) ---
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
            const img = res.images?.length > 0 ? res.images[0].url : '';
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
                modals.search.classList.remove('active');
                renderCategoryContent();
            };
            list.appendChild(div);
        });
    }, 500);
});

// Zavírání modalů
document.querySelectorAll('.close-modal').forEach(btn => {
    btn.addEventListener('click', (e) => e.target.closest('.modal').classList.remove('active'));
});

// Přepínání pohledů
function switchView(viewName) {
    Object.values(views).forEach(v => v.classList.remove('active'));
    views[viewName].classList.add('active');
}
