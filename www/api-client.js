(function () {
    function getToken() {
        return localStorage.getItem('3dm_token');
    }

    function setToken(token) {
        if (token) localStorage.setItem('3dm_token', token);
        else localStorage.removeItem('3dm_token');
    }

    function getUser() {
        try {
            return JSON.parse(localStorage.getItem('3dm_user') || 'null');
        } catch {
            return null;
        }
    }

    function setUser(user) {
        if (user) localStorage.setItem('3dm_user', JSON.stringify(user));
        else localStorage.removeItem('3dm_user');
    }

    function buildUrl(path) {
        if (!path) return window.APP_CONFIG.getApiUrl();
        if (/^https?:\/\//i.test(path)) return path;
        return window.APP_CONFIG.getApiUrl().replace(/\/$/, '') + path;
    }

    function isNativeHttpAvailable() {
        return typeof window !== 'undefined'
            && window.Capacitor
            && window.Capacitor.Plugins
            && window.Capacitor.Plugins.Http
            && typeof window.Capacitor.Plugins.Http.request === 'function';
    }

    async function nativeHttpRequest(method, url, headers, body) {
        const Http = window.Capacitor.Plugins.Http;
        const options = {
            method,
            url,
            headers,
            data: body !== undefined ? body : undefined,
            connectTimeout: 15000,
            readTimeout: 15000
        };
        const res = await Http.request(options);
        let data = res.data;
        if (typeof data === 'string' && data) {
            try {
                data = JSON.parse(data);
            } catch {
                data = { erro: data };
            }
        }
        return {
            status: res.status,
            data
        };
    }

    async function request(method, path, body) {
        const headers = { 'Content-Type': 'application/json' };
        const token = getToken();
        if (token) headers.Authorization = 'Bearer ' + token;

        const url = buildUrl(path);
        let res;
        let data = null;

        if (isNativeHttpAvailable()) {
            res = await nativeHttpRequest(method, url, headers, body);
            data = res.data;
        } else {
            const webResponse = await fetch(url, {
                method,
                headers,
                body: body !== undefined ? JSON.stringify(body) : undefined
            });
            const text = await webResponse.text();
            if (text) {
                try {
                    data = JSON.parse(text);
                } catch {
                    data = { erro: text };
                }
            }
            res = { status: webResponse.status, statusText: webResponse.statusText };
        }

        if (res.status < 200 || res.status >= 300) {
            const err = new Error(data?.erro || res.statusText || 'Erro na requisição');
            err.status = res.status;
            err.data = data;
            throw err;
        }

        return data;
    }

    window.httpClient = {
        get: (path) => request('GET', path),
        post: (path, body) => request('POST', path, body),
        patch: (path, body) => request('PATCH', path, body),
        delete: (path) => request('DELETE', path)
    };

    window.apiClient = {
        getToken,
        setToken,
        getUser,
        setUser,
        get: (path) => request('GET', path),
        post: (path, body) => request('POST', path, body),
        patch: (path, body) => request('PATCH', path, body),
        delete: (path) => request('DELETE', path),
        logout() {
            setToken(null);
            setUser(null);
        }
    };
})();
