/**
 * 3D Manager Pro — Bridge de Acesso aos Dados com Suporte Offline Resiliente (IndexedDB)
 */
(function () {
    const PATHS = {
        Venda: '/api/data/vendas',
        Estoque: '/api/data/estoque',
        Modelo: '/api/data/modelos',
        CustoItem: '/api/data/custos',
        Impressora: '/api/data/impressoras',
        Fila: '/api/data/fila',
        Desperdicio: '/api/data/desperdicios'
    };

    const STORE_NAMES = {
        Venda: 'vendas',
        Estoque: 'estoque',
        Modelo: 'modelos',
        CustoItem: 'custos',
        Impressora: 'impressoras',
        Fila: 'fila',
        Desperdicio: 'desperdicios'
    };

    let online = false;
    const fakeMongoose = {
        connection: {
            readyState: 0,
            on() {}
        }
    };

    function wrapDoc(path, doc, modelName) {
        const copy = { ...doc, _id: doc._id || doc.id || ('temp_' + Math.random().toString(36).substring(2, 9)) };
        copy.save = async function () {
            const store = STORE_NAMES[modelName] || 'geral';
            try {
                const updated = await window.apiClient.patch(`${path}/${copy._id}`, { ...this, _id: undefined });
                Object.assign(copy, updated);
                return copy;
            } catch (err) {
                console.warn(`[db-bridge] Salvamento offline para ${modelName} ID ${copy._id}:`, err);
                if (window.OfflineSyncModulo) {
                    await window.OfflineSyncModulo.enfileirarAcaoOffline({
                        tipo: 'PATCH',
                        path: `${path}/${copy._id}`,
                        body: { ...this, _id: undefined }
                    });
                }
                return copy;
            }
        };
        copy.toObject = () => ({ ...copy });
        return copy;
    }

    function createApiModel(name) {
        const path = PATHS[name];
        const storeName = STORE_NAMES[name] || name.toLowerCase();

        function ModelConstructor(data) {
            if (data) Object.assign(this, data);
            this._isNew = true;
        }

        ModelConstructor.prototype.save = async function () {
            const user = window.apiClient?.getUser?.();
            if (user?.tenantId && !this.tenantId) {
                this.tenantId = user.tenantId;
            }

            if (this._id && !this._isNew) {
                try {
                    const updated = await window.apiClient.patch(`${path}/${String(this._id)}`, { ...this, _id: undefined, _isNew: undefined });
                    Object.assign(this, updated);
                    return this;
                } catch (err) {
                    console.warn(`[db-bridge] Atualização offline [${name}]:`, err);
                    if (window.OfflineSyncModulo) {
                        await window.OfflineSyncModulo.enfileirarAcaoOffline({
                            tipo: 'PATCH',
                            path: `${path}/${String(this._id)}`,
                            body: { ...this, _id: undefined, _isNew: undefined }
                        });
                    }
                    return this;
                }
            }

            const body = { ...this, _id: undefined, _isNew: undefined };
            try {
                const created = await window.apiClient.post(path, body);
                Object.assign(this, created);
                this._isNew = false;
                return this;
            } catch (err) {
                console.warn(`[db-bridge] Criação offline [${name}]:`, err);
                const tempId = 'temp_' + Math.random().toString(36).substring(2, 9);
                this._id = tempId;
                this._isNew = false;
                if (window.OfflineSyncModulo) {
                    await window.OfflineSyncModulo.enfileirarAcaoOffline({
                        tipo: 'POST',
                        path,
                        body
                    });
                }
                return this;
            }
        };

        ModelConstructor.find = function (filter = {}) {
            const query = {
                _sort: null,
                _limit: null,
                sort(sortObj) {
                    if (sortObj && sortObj.data === -1) query._sort = 'data';
                    else if (sortObj && sortObj.nome === 1) query._sort = 'nome';
                    return query;
                },
                limit(n) {
                    query._limit = typeof n === 'number' ? n : parseInt(n, 10);
                    return query;
                },
                lean() {
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

                    let list = [];
                    try {
                        list = await window.apiClient.get(url);
                        // Atualiza cache local IndexedDB em segundo plano
                        if (window.OfflineSyncModulo && Array.isArray(list)) {
                            window.OfflineSyncModulo.salvarCacheColecao(storeName, list);
                        }
                    } catch (err) {
                        console.warn(`[db-bridge] API indisponível para ${name}. Carregando do cache local IndexedDB...`);
                        if (window.OfflineSyncModulo) {
                            list = await window.OfflineSyncModulo.obterCacheColecao(storeName);
                        }
                    }

                    if (query._limit != null && Number.isFinite(query._limit)) {
                        list = list.slice(0, query._limit);
                    }
                    return list.map(d => wrapDoc(path, d, name));
                },
                then(resolve, reject) {
                    return query.exec().then(resolve, reject);
                }
            };
            return query;
        };

        ModelConstructor.countDocuments = async function () {
            try {
                const list = await window.apiClient.get(path);
                return list.length;
            } catch {
                if (window.OfflineSyncModulo) {
                    const cached = await window.OfflineSyncModulo.obterCacheColecao(storeName);
                    return cached.length;
                }
                return 0;
            }
        };

        ModelConstructor.create = async function (doc) {
            const body = { ...doc };
            const user = window.apiClient?.getUser?.();
            if (user?.tenantId && !body.tenantId) {
                body.tenantId = user.tenantId;
            }

            try {
                const created = await window.apiClient.post(path, body);
                return wrapDoc(path, created, name);
            } catch (err) {
                console.warn(`[db-bridge] create offline [${name}]:`, err);
                const tempId = 'temp_' + Math.random().toString(36).substring(2, 9);
                const fallbackDoc = { ...body, _id: tempId };
                if (window.OfflineSyncModulo) {
                    await window.OfflineSyncModulo.enfileirarAcaoOffline({
                        tipo: 'POST',
                        path,
                        body
                    });
                }
                return wrapDoc(path, fallbackDoc, name);
            }
        };

        ModelConstructor.findById = async function (id) {
            let list = [];
            try {
                list = await window.apiClient.get(path);
            } catch {
                if (window.OfflineSyncModulo) {
                    list = await window.OfflineSyncModulo.obterCacheColecao(storeName);
                }
            }
            const doc = list.find(d => String(d._id) === String(id) || String(d.id) === String(id));
            return doc ? wrapDoc(path, doc, name) : null;
        };

        ModelConstructor.findByIdAndUpdate = async function (id, update) {
            try {
                const updated = await window.apiClient.patch(`${path}/${String(id)}`, update);
                return updated;
            } catch (err) {
                if (window.OfflineSyncModulo) {
                    await window.OfflineSyncModulo.enfileirarAcaoOffline({
                        tipo: 'PATCH',
                        path: `${path}/${String(id)}`,
                        body: update
                    });
                }
                return { ...update, _id: id };
            }
        };

        ModelConstructor.findByIdAndDelete = async function (id) {
            if (window.OfflineSyncModulo && typeof window.OfflineSyncModulo.removerItemCache === 'function') {
                await window.OfflineSyncModulo.removerItemCache(storeName, id);
            }
            try {
                await window.apiClient.delete(`${path}/${id}`);
            } catch (err) {
                // Se o status for 404, o item já foi removido no servidor
                if (err && (err.status === 404 || err.message?.includes('404') || err.message?.includes('Não encontrado'))) {
                    return;
                }
                if (window.OfflineSyncModulo) {
                    await window.OfflineSyncModulo.enfileirarAcaoOffline({
                        tipo: 'DELETE',
                        path: `${path}/${id}`
                    });
                }
            }
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
        getImpressoraModel: () => createApiModel('Impressora'),
        getFilaModel: () => createApiModel('Fila'),
        getDesperdicioModel: () => createApiModel('Desperdicio'),
        getMongoose: () => fakeMongoose,
        startPing,
        setOnline(state) {
            online = state;
            fakeMongoose.connection.readyState = state ? 1 : 0;
        }
    };

    window.getVendaModel = window.dbBridge.getVendaModel;
    window.getEstoqueModel = window.dbBridge.getEstoqueModel;
    window.getModeloModel = window.dbBridge.getModeloModel;
    window.getCustoItemModel = window.dbBridge.getCustoItemModel;
    window.getImpressoraModel = window.dbBridge.getImpressoraModel;
    window.getFilaModel = window.dbBridge.getFilaModel;
    window.getDesperdicioModel = window.dbBridge.getDesperdicioModel;
    window.getMongoose = window.dbBridge.getMongoose;
})();
