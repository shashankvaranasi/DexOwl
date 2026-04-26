const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');

class ProxyManager {
    constructor() {
        this.proxies = this._parseLocalProxies();
        this.currentIndex = 0;
        this.refreshInterval = 30 * 60 * 1000; // 30 minutes
    }

    _parseLocalProxies() {
        const proxyList = process.env.PROXY_LIST || process.env.PROXY_URL;
        if (!proxyList) return [];

        const lines = proxyList.split(',').map(p => p.trim()).filter(p => p.length > 0);
        return this._parseProxyLines(lines);
    }

    /**
     * Shared parsing logic for proxy strings
     */
    _parseProxyLines(lines) {
        const parsed = [];
        for (const p of lines) {
            const cleanLine = p.trim();
            if (!cleanLine) continue;

            const parts = cleanLine.split(':');
            if (parts.length === 4) {
                // Reformat IP:PORT:USER:PASS to http://USER:PASS@IP:PORT
                const [ip, port, user, pass] = parts.map(s => s.trim());
                // Encode user/pass to handle special characters (@, :, etc.)
                const encodedUser = encodeURIComponent(user);
                const encodedPass = encodeURIComponent(pass);
                parsed.push(`http://${encodedUser}:${encodedPass}@${ip}:${port}`);
            } else if (cleanLine.startsWith('http')) {
                parsed.push(cleanLine);
            } else if (cleanLine.includes(':')) {
                // Standard IP:PORT (no auth)
                parsed.push(`http://${cleanLine}`);
            }
        }
        return parsed;
    }

    /**
     * Initializes the proxy manager and starts periodic refreshes
     */
    async initialize() {
        if (process.env.PROXY_LINK) {
            console.log('📡 [ProxyManager] PROXY_LINK detected, fetching initial proxy list...');
            await this.fetchProxies();
            
            // Set up periodic refresh
            setInterval(() => this.fetchProxies(), this.refreshInterval);
        } else if (this.proxies.length > 0) {
            console.log(`📡 [ProxyManager] Loaded ${this.proxies.length} proxies from local config`);
        }
    }

    /**
     * Fetches proxies from the remote PROXY_LINK
     */
    async fetchProxies() {
        const link = process.env.PROXY_LINK;
        if (!link) return;

        try {
            const response = await axios.get(link, { timeout: 10000 });
            let content = response.data;

            if (typeof content !== 'string') {
                content = JSON.stringify(content);
            }

            const lines = content.split(/[\n,]/).map(p => p.trim()).filter(p => p.length > 0);
            const newProxies = this._parseProxyLines(lines);

            if (newProxies.length > 0) {
                this.proxies = newProxies;
                console.log(`✅ [ProxyManager] Successfully fetched ${this.proxies.length} proxies from remote link`);
            }
        } catch (error) {
            console.error(`❌ [ProxyManager] Failed to fetch proxies from link:`, error.message);
        }
    }

    /**
     * Gets the next proxy agent in rotation
     * @returns {HttpsProxyAgent|null}
     */
    getNextAgent() {
        if (this.proxies.length === 0) return null;

        const proxyUrl = this.proxies[this.currentIndex];
        this.currentIndex = (this.currentIndex + 1) % this.proxies.length;
        
        try {
            return new HttpsProxyAgent(proxyUrl);
        } catch (error) {
            console.error(`[ProxyManager] Error creating agent for proxy ${proxyUrl}:`, error.message);
            return null;
        }
    }

    /**
     * Returns true if any proxies are configured
     */
    isEnabled() {
        return this.proxies.length > 0;
    }
}

// Singleton instance
module.exports = new ProxyManager();
