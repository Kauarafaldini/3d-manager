(function () {
    function normalizeApiUrl(url) {
        if (!url) return '';
        const trimmed = String(url).trim().replace(/\/$/, '');
        if (!/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(trimmed)) {
            return 'http://' + trimmed;
        }
        return trimmed;
    }

    function detectApiUrl() {
        const saved = localStorage.getItem('3dm_api_url');
        if (saved) return saved.replace(/\/$/, '');

        if (typeof window !== 'undefined' && window.Capacitor) {
            return '';
        }
        if (typeof process !== 'undefined' && process.versions && process.versions.electron) {
            return 'http://127.0.0.1:5657';
        }
        if (window.location.protocol === 'file:' || window.location.protocol === 'capacitor:') {
            return 'http://127.0.0.1:5657';
        }
        return window.location.origin;
    }

    window.APP_CONFIG = {
        getApiUrl() {
            return detectApiUrl();
        },
        setApiUrl(url) {
            if (url) localStorage.setItem('3dm_api_url', normalizeApiUrl(url));
            else localStorage.removeItem('3dm_api_url');
        }
    };
})();
