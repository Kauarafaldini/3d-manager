/**
 * 3D Manager Pro — Modo Offline Resiliente & Sincronização Local (IndexedDB)
 * Permite que a oficina continue operando sem internet e sincroniza com o MongoDB Atlas ao reconectar.
 */

window.OfflineSyncModulo = (function () {

    const DB_NAME = '3d_manager_offline_cache';
    const DB_VERSION = 1;
    const STORES = ['vendas', 'estoque', 'modelos', 'custos', 'impressoras', 'fila', 'desperdicios', 'sync_queue'];

    let dbInstance = null;
    let isSyncing = false;
    let listeners = new Set();

    /**
     * Inicializa o banco IndexedDB
     */
    async function initDB() {
        if (dbInstance) return dbInstance;

        return new Promise((resolve, reject) => {
            if (!('indexedDB' in window)) {
                console.warn('[offline-sync] IndexedDB não suportado. Usando fallback LocalStorage.');
                resolve(null);
                return;
            }

            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                STORES.forEach(storeName => {
                    if (!db.objectStoreNames.contains(storeName)) {
                        if (storeName === 'sync_queue') {
                            db.createObjectStore(storeName, { keyPath: 'id', autoIncrement: true });
                        } else {
                            db.createObjectStore(storeName, { keyPath: '_id' });
                        }
                    }
                });
            };

            request.onsuccess = (e) => {
                dbInstance = e.target.result;
                console.log('[offline-sync] IndexedDB inicializado com sucesso.');
                resolve(dbInstance);
            };

            request.onerror = (e) => {
                console.error('[offline-sync] Erro ao abrir IndexedDB:', e);
                resolve(null);
            };
        });
    }

    /**
     * Salva coleção inteira no cache local IndexedDB
     */
    async function salvarCacheColecao(collectionName, items) {
        if (!Array.isArray(items)) return;
        const db = await initDB();
        if (!db) {
            try {
                localStorage.setItem(`3dm_cache_${collectionName}`, JSON.stringify(items));
            } catch (_) {}
            return;
        }

        try {
            const tx = db.transaction([collectionName], 'readwrite');
            const store = tx.objectStore(collectionName);
            store.clear();
            items.forEach(item => {
                if (item && (item._id || item.id)) {
                    store.put({ ...item, _id: String(item._id || item.id) });
                }
            });
        } catch (err) {
            console.warn(`[offline-sync] Erro ao salvar cache de ${collectionName}:`, err);
        }
    }

    /**
     * Obtém coleção do cache local
     */
    async function obterCacheColecao(collectionName) {
        const db = await initDB();
        if (!db) {
            try {
                const saved = localStorage.getItem(`3dm_cache_${collectionName}`);
                return saved ? JSON.parse(saved) : [];
            } catch (_) {
                return [];
            }
        }

        return new Promise((resolve) => {
            try {
                const tx = db.transaction([collectionName], 'readonly');
                const store = tx.objectStore(collectionName);
                const req = store.getAll();
                req.onsuccess = () => resolve(req.result || []);
                req.onerror = () => resolve([]);
            } catch {
                resolve([]);
            }
        });
    }

    /**
     * Enfileira uma ação pendente para quando a conexão voltar
     */
    async function enfileirarAcaoOffline(acao) {
        // acao: { tipo: 'POST'|'PATCH'|'DELETE', path: '/api/data/...', body, tempId, timestamp }
        const item = {
            ...acao,
            timestamp: new Date().toISOString()
        };

        const db = await initDB();
        if (!db) {
            try {
                const queue = JSON.parse(localStorage.getItem('3dm_sync_queue') || '[]');
                queue.push(item);
                localStorage.setItem('3dm_sync_queue', JSON.stringify(queue));
            } catch (_) {}
            notificarStatus();
            return;
        }

        try {
            const tx = db.transaction(['sync_queue'], 'readwrite');
            const store = tx.objectStore('sync_queue');
            store.add(item);
        } catch (e) {
            console.error('[offline-sync] Erro ao enfileirar ação offline:', e);
        }

        notificarStatus();
    }

    /**
     * Retorna a quantidade de operações pendentes na fila
     */
    async function obterQuantidadePendencias() {
        const db = await initDB();
        if (!db) {
            try {
                const queue = JSON.parse(localStorage.getItem('3dm_sync_queue') || '[]');
                return queue.length;
            } catch {
                return 0;
            }
        }

        return new Promise((resolve) => {
            try {
                const tx = db.transaction(['sync_queue'], 'readonly');
                const store = tx.objectStore('sync_queue');
                const req = store.count();
                req.onsuccess = () => resolve(req.result || 0);
                req.onerror = () => resolve(0);
            } catch {
                resolve(0);
            }
        });
    }

    /**
     * Processa a fila de sincronização contra a API
     */
    async function sincronizarPendencias() {
        if (isSyncing) return;
        const pendencias = await obterQuantidadePendencias();
        if (pendencias === 0) return;

        isSyncing = true;
        console.log(`[offline-sync] Iniciando sincronização de ${pendencias} ações pendentes...`);

        try {
            const db = await initDB();
            let queue = [];

            if (db) {
                queue = await new Promise((resolve) => {
                    const tx = db.transaction(['sync_queue'], 'readonly');
                    const store = tx.objectStore('sync_queue');
                    const req = store.getAll();
                    req.onsuccess = () => resolve(req.result || []);
                    req.onerror = () => resolve([]);
                });
            } else {
                queue = JSON.parse(localStorage.getItem('3dm_sync_queue') || '[]');
            }

            let processadas = 0;

            for (const item of queue) {
                try {
                    if (item.tipo === 'POST') {
                        await window.httpClient.post(item.path, item.body);
                    } else if (item.tipo === 'PATCH') {
                        await window.httpClient.patch(item.path, item.body);
                    } else if (item.tipo === 'DELETE') {
                        await window.httpClient.delete(item.path);
                    }
                    processadas++;
                } catch (reqErr) {
                    console.warn('[offline-sync] Falha ao sincronizar item:', reqErr);
                    // Se falhou por motivo de rede, interrompe para tentar mais tarde
                    if (!navigator.onLine) break;
                }
            }

            // Limpa itens processados da fila
            if (processadas > 0) {
                if (db) {
                    const tx = db.transaction(['sync_queue'], 'readwrite');
                    tx.objectStore('sync_queue').clear();
                } else {
                    localStorage.removeItem('3dm_sync_queue');
                }

                if (typeof window.mostrarToast === 'function') {
                    window.mostrarToast(`🟢 Sincronização concluída! (${processadas} alterações salvas)`, 'ok');
                }
                if (typeof window.atualizarInterface === 'function') {
                    window.atualizarInterface();
                }
            }
        } catch (err) {
            console.error('[offline-sync] Erro geral de sincronização:', err);
        } finally {
            isSyncing = false;
            notificarStatus();
        }
    }

    function notificarStatus() {
        obterQuantidadePendencias().then(count => {
            const statusIndicator = document.getElementById('db-status-indicator');
            if (statusIndicator) {
                if (!navigator.onLine) {
                    statusIndicator.style.color = '#f59e0b';
                    statusIndicator.innerHTML = `<span class="status-dot" style="width:7px;height:7px;background-color:#f59e0b;border-radius:50%;display:inline-block;"></span> Modo Offline ${count > 0 ? `(${count} pendentes)` : ''}`;
                } else if (count > 0) {
                    statusIndicator.style.color = '#38bdf8';
                    statusIndicator.innerHTML = `<span class="status-dot" style="width:7px;height:7px;background-color:#38bdf8;border-radius:50%;display:inline-block;"></span> Sincronizando (${count})...`;
                }
            }
        });
    }

    // Ouvintes de conectividade
    window.addEventListener('online', () => {
        console.log('[offline-sync] Conexão com a internet restabelecida.');
        sincronizarPendencias();
        notificarStatus();
    });

    window.addEventListener('offline', () => {
        console.log('[offline-sync] Conexão perdida. Ativando cache local.');
        notificarStatus();
    });

    setInterval(() => {
        if (navigator.onLine) sincronizarPendencias();
    }, 15000);

    return {
        initDB,
        salvarCacheColecao,
        obterCacheColecao,
        enfileirarAcaoOffline,
        obterQuantidadePendencias,
        sincronizarPendencias,
        notificarStatus
    };
})();
