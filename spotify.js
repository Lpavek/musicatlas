const CLIENT_ID = "TVOJE_CLIENT_ID_ZDE";
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
        
        // Obnova expirovaného tokenu
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
            } catch(e) { console.error("Refresh selhal", e); }
        }
        return null;
    },
    async getUserPlaylists() {
        const token = await this.getToken();
        if (!token) return [];

        try {
            // Zjistíme tvoje ID pro odfiltrování cizích sledovaných playlistů
            const userResponse = await fetch("https://api.spotify.com/v1/me", {
                headers: { Authorization: "Bearer " + token }
            });
            const userData = await userResponse.json();
            const myUserId = userData.id;

            // Načteme bez omezení VŠECHNY tvoje playlisty (stránkováním)
            let allPlaylists = [];
            let url = "https://api.spotify.com/v1/me/playlists?limit=50";

            while (url) {
                const response = await fetch(url, {
                    headers: { Authorization: "Bearer " + token }
                });
                const data = await response.json();
                
                if (data.items) {
                    allPlaylists = allPlaylists.concat(data.items);
                }
                url = data.next; // Načte další stránku, pokud existuje
            }

            // Vracíme výhradně playlisty vytvořené tebou
            return allPlaylists.filter(pl => pl && pl.owner && pl.owner.id === myUserId);

        } catch (error) {
            console.error("Chyba při načítání playlistů:", error);
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
    }
};
