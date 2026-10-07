const CLIENT_ID = "d12d1f6a79ab4d7fbdf00435566ed35d"; // ZDE DOPLŇ SVÉ ID Z DEVELOPER DASHBOARDU
const REDIRECT_URI = window.location.origin + window.location.pathname;
const AUTH_KEY = "atlas_spotify_token";

const SpotifyAPI = {
    async pkceChallenge(v) {
        const d = new TextEncoder().encode(v);
        const h = await crypto.subtle.digest("SHA-256", d);
        return btoa(String.fromCharCode(...new Uint8Array(h))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    },
    rand() {
        const a = new Uint8Array(64);
        crypto.getRandomValues(a);
        return btoa(String.fromCharCode(...a)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    },
    async login() {
        if (!CLIENT_ID || CLIENT_ID === "TVOJE_CLIENT_ID_ZDE") { 
            alert("Nezapomeň zevnitř souboru spotify.js nastavit tvoje Client ID!"); 
            return; 
        }
        const verifier = this.rand();
        const challenge = await this.pkceChallenge(verifier);
        sessionStorage.setItem("spotify_verifier", verifier);
        
        const p = new URLSearchParams({
            client_id: CLIENT_ID, 
            response_type: "code", 
            redirect_uri: REDIRECT_URI,
            scope: "user-read-private playlist-read-private", 
            code_challenge_method: "S256", 
            code_challenge: challenge
        });
        location.href = "https://accounts.spotify.com/authorize?" + p;
    },
    async finishAuth() {
        const urlParams = new URLSearchParams(location.search);
        const code = urlParams.get("code");
        if (!code) return;
        const verifier = sessionStorage.getItem("spotify_verifier");
        
        const p = new URLSearchParams({
            client_id: CLIENT_ID, 
            grant_type: "authorization_code", 
            code: code,
            redirect_uri: REDIRECT_URI, 
            code_verifier: verifier
        });
        try {
            const r = await fetch("https://accounts.spotify.com/api/token", {
                method: "POST", 
                headers: { "Content-Type": "application/x-www-form-urlencoded" }, 
                body: p
            });
            const d = await r.json();
            if (d.access_token) {
                localStorage.setItem(AUTH_KEY, JSON.stringify({ 
                    access_token: d.access_token, 
                    expires_at: Date.now() + d.expires_in * 1000, 
                    refresh_token: d.refresh_token 
                }));
                window.history.replaceState({}, document.title, window.location.pathname);
            }
        } catch(e) { 
            console.error("Auth error", e); 
        }
    },
    async getToken() {
        const a = JSON.parse(localStorage.getItem(AUTH_KEY) || "null");
        if (!a) return null;
        if (a.expires_at > Date.now() + 60000) return a.access_token;
        if (a.refresh_token) {
            const p = new URLSearchParams({ 
                client_id: CLIENT_ID, 
                grant_type: "refresh_token", 
                refresh_token: a.refresh_token 
            });
            try {
                const r = await fetch("https://accounts.spotify.com/api/token", { 
                    method: "POST", 
                    headers: { "Content-Type": "application/x-www-form-urlencoded" }, 
                    body: p 
                });
                const d = await r.json();
                if (d.access_token) {
                    a.access_token = d.access_token; 
                    a.expires_at = Date.now() + d.expires_in * 1000;
                    if (d.refresh_token) a.refresh_token = d.refresh_token;
                    localStorage.setItem(AUTH_KEY, JSON.stringify(a));
                    return a.access_token;
                }
            } catch(e) { 
                console.error("Refresh selhal", e); 
            }
        }
        return null;
    },
    async getUserPlaylists() {
        const token = await this.getToken();
        if (!token) return [];
        try {
            const userResponse = await fetch("https://api.spotify.com/v1/me", { 
                headers: { Authorization: "Bearer " + token }
            });
            const userData = await userResponse.json();
            const myUserId = userData.id;
            let allPlaylists = [];
            let url = "https://api.spotify.com/v1/me/playlists?limit=50";
            while (url) {
                const response = await fetch(url, { 
                    headers: { Authorization: "Bearer " + token }
                });
                const data = await response.json();
                if (data.items) allPlaylists = allPlaylists.concat(data.items);
                url = data.next;
            }
            return allPlaylists.filter(pl => pl && pl.owner && pl.owner.id === myUserId);
        } catch (error) { 
            return []; 
        }
    },
    async search(query, type) {
        const token = await this.getToken();
        if (!token) return [];
        const r = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=${type}&limit=10`, { 
            headers: { Authorization: "Bearer " + token }
        });
        const data = await r.json();
        return type === 'artist' ? data.artists.items : data.albums.items;
    },

async getArtistDiscography(artistId) {
        const token = await this.getToken();
        if (!token) return [];
        try {
            // Skladani URL pomoci URLSearchParams vyluci jakekoliv mezery
            const params = new URLSearchParams({
                include_groups: 'album,single,appears_on',
                limit: '20'
            });

            const response = await fetch(`https://api.spotify.com/v1/artists/${artistId}/albums?${params.toString()}`, {
                headers: { Authorization: "Bearer " + token }
            });

            if (!response.ok) {
                const errText = await response.text();
                console.error("Spotify API vratilo chybu:", response.status, errText);
                return [];
            }

            const data = await response.json();
            if (!data.items) return [];

            const unique = [];
            const seen = new Set();

            data.items.forEach(item => {
                if (item && !seen.has(item.name)) {
                    seen.add(item.name);
                    unique.push({
                        id: item.id,
                        name: item.name,
                        image: (item.images && item.images.length > 0) ? item.images[0].url : 'https://via.placeholder.com/150',
                        group: item.album_group || 'album',
                        release_date: item.release_date || '2000-01-01',
                        listened: false,
                        rating: null,
                        review: ""
                    });
                }
            });

            return unique.sort((a, b) => new Date(b.release_date) - new Date(a.release_date));
        } catch (e) {
            console.error("Chyba při stahování diskografie:", e);
            return [];
        }
    }
};
