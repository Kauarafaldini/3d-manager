/**
 * Acesso aos dados via API (Electron, Android, iOS).
 */
(function () {
    const PATHS = {
        Venda: '/api/data/vendas',
        Estoque: '/api/data/estoque',
        Modelo: '/api/data/modelos',
        CustoItem: '/api/data/custos'
    };

    let online = false;
    const fakeMongoose = {
        connection: {
            readyState: 0,
            on() {}
        }
    };

    function wrapDoc(path, doc) {
        const copy = { ...doc, _id: doc._id };
        copy.save = async function () {
            const updated = await window.apiClient.patch(`${path}/${copy._id}`, { ...this, _id: undefined });
            Object.assign(copy, updated);
            return copy;
        };
        copy.toObject = () => ({ ...copy });
        return copy;
    }

    function createApiModel(name) {
        const path = PATHS[name];
        const sortMap = { data: '-data', nome: 'nome' };

        function ModelConstructor(data) {
            if (data) Object.assign(this, data);
            this._isNew = true;
        }

        ModelConstructor.prototype.save = async function () {
            if (this._id && !this._isNew) {
                const updated = await window.apiClient.patch(`${path}/${this._id}`, { ...this, _id: undefined });
                Object.assign(this, updated);
                return this;
            }
            const created = await window.apiClient.post(path, { ...this, _id: undefined });
            Object.assign(this, created);
            this._isNew = false;
            return this;
        };

        ModelConstructor.find = function (filter = {}) {
            const query = {
                _sort: null,
                sort(sortObj) {
                    if (sortObj && sortObj.data === -1) query._sort = 'data';
                    else if (sortObj && sortObj.nome === 1) query._sort = 'nome';
                    return query;
                },
                async exec() {
                    const params = [];
                    if (query._sort === 'data') params.push('sort=-data');
                    else if (query._sort === 'nome') params.push('sort=nome');
                    if (name === 'CustoItem' && filter.ativo && filter.ativo.$ne === false) {
                        params.push('ativos=1');
                    }
                    const url = params.length ? `${path}?${params.join('&')}` : path;
                    const list = await window.apiClient.get(url);
                    return list.map(d => wrapDoc(path, d));
                },
                then(resolve, reject) {
                    return query.exec().then(resolve, reject);
                }
            };
            return query;
        };

        ModelConstructor.countDocuments = async function () {
            const list = await window.apiClient.get(path);
            return list.length;
        };

        ModelConstructor.create = async function (doc) {
            const created = await window.apiClient.post(path, doc);
            return wrapDoc(path, created);
        };

        ModelConstructor.findById = async function (id) {
            const list = await window.apiClient.get(path);
            const doc = list.find(d => d._id === id || d._id === String(id));
            return doc ? wrapDoc(path, doc) : null;
        };

        ModelConstructor.findByIdAndUpdate = async function (id, update) {
            const updated = await window.apiClient.patch(`${path}/${id}`, update);
            return updated;
        };

        ModelConstructor.findByIdAndDelete = async function (id) {
            await window.apiClient.delete(`${path}/${id}`);
        };

        return ModelConstructor;
    }

    async function conectarBanco() {
        try {
            const h = await window.apiClient.get('/api/health');
            online = !!h.ok;
            fakeMongoose.connection.readyState = online ? 1 : 0;
            return online;
        } catch {
            online = false;
            fakeMongoose.connection.readyState = 0;
            return false;
        }
    }

    async function inicializarDadosPadrao() {
        return true;
    }

    function startPing() {
        if (window._pingInterval) clearInterval(window._pingInterval);
        window._pingInterval = setInterval(async () => {
            if (!window.apiClient.getToken()) return;
            try {
                await window.apiClient.post('/api/auth/ping');
            } catch { /* sessão expirada */ }
        }, 60000);
    }

    window.dbBridge = {
        isLocalMobile: false,
        isApi: true,
        conectarBanco,
        inicializarDadosPadrao,
        getVendaModel: () => createApiModel('Venda'),
        getEstoqueModel: () => createApiModel('Estoque'),
        getModeloModel: () => createApiModel('Modelo'),
        getCustoItemModel: () => createApiModel('CustoItem'),
        getMongoose: () => fakeMongoose,
        startPing,
        setOnline(state) {
            online = state;
            fakeMongoose.connection.readyState = state ? 1 : 0;
        }
    };
})();
