const CLIENT_ID = "d12d1f6a79ab4d7fbdf00435566ed35d";
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
        if (!CLIENT_ID || CLIENT_ID === "TVOJE_CLIENT_ID_ZDE") { alert("Vlož Client ID do spotify.js!"); return; }
        const verifier = this.rand();
        const challenge = await this.pkceChallenge(verifier);
        sessionStorage.setItem("spotify_verifier", verifier);
        
        const p = new URLSearchParams({
            client_id: CLIENT_ID, response_type: "code", redirect_uri: REDIRECT_URI,
            scope: "user-read-private playlist-read-private", code_challenge_method: "S256", code_challenge: challenge
        });
        location.href = "https://accounts.spotify.com/authorize?" + p;
    },
    async finishAuth() {
        const urlParams = new URLSearchParams(location.search);
        const code = urlParams.get("code");
        if (!code) return;
        const verifier = sessionStorage.getItem("spotify_verifier");
        
        const p = new URLSearchParams({
            client_id: CLIENT_ID, grant_type: "authorization_code", code: code,
            redirect_uri: REDIRECT_URI, code_verifier: verifier
        });
        try {
            const r = await fetch("https://accounts.spotify.com/api/token", {
                method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: p
            });
            const d = await r.json();
            if (d.access_token) {
                localStorage.setItem(AUTH_KEY, JSON.stringify({ access_token: d.access_token, expires_at: Date.now() + d.expires_in * 1000, refresh_token: d.refresh_token }));
                window.history.replaceState({}, document.title, window.location.pathname);
            }
        } catch(e) { console.error("Auth error", e); }
    },
    async getToken() {
        const a = JSON.parse(localStorage.getItem(AUTH_KEY) || "null");
        if (!a) return null;
        if (a.expires_at > Date.now() + 60000) return a.access_token;
        // Zjednodušeno pro prototyp: pokud token vyprší, vrací null. (Implementace refresh tokenu viz tvůj předchozí kód)
        return null;
    },
    async getUserPlaylists() {
        const token = await this.getToken();
        if (!token) return [];
        const r = await fetch("https://api.spotify.com/v1/me/playlists?limit=50", { headers: { Authorization: "Bearer " + token }});
        const data = await r.json();
        return data.items || [];
    },
    async search(query, type) {
        const token = await this.getToken();
        if (!token) return [];
        const r = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=${type}&limit=10`, { headers: { Authorization: "Bearer " + token }});
        const data = await r.json();
        return type === 'artist' ? data.artists.items : data.albums.items;
    }
};
