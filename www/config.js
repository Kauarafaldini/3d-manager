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
        return 'https://threed-manager-q1tc.onrender.com';
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
