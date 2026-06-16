let sessaoUsuario = null;

function formatarDataRelativa(d) {
    if (!d) return 'Nunca';
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return '—';
    const diff = Date.now() - dt.getTime();
    if (diff < 60000) return 'Agora';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} min atrás`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} h atrás`;
    return dt.toLocaleString('pt-BR');
}

async function testarConexaoUrl() {
    const urlInput = document.getElementById('authApiUrl');
    const url = urlInput?.value?.trim();
    const resultDiv = document.getElementById('testResultMessage');
    const btn = document.getElementById('btnTestarConexao');
    
    if (!url) {
        resultDiv.style.display = 'block';
        resultDiv.style.background = '#fee2e2';
        resultDiv.style.color = '#991b1b';
        resultDiv.textContent = '❌ Informe uma URL válida';
        return;
    }
    
    btn.disabled = true;
    btn.textContent = '⏳ Testando...';
    resultDiv.style.display = 'block';
    resultDiv.style.background = '#fef3c7';
    resultDiv.style.color = '#92400e';
    resultDiv.textContent = 'Testando conexão...';
    
    try {
        const normalizedUrl = url.endsWith('/') ? url.slice(0, -1) : url;
        window.APP_CONFIG.setApiUrl(normalizedUrl);
        const testUrl = `${normalizedUrl}/api/health`;
        
        console.log('🔗 Testando URL:', testUrl);
        
        const data = await window.httpClient.get(testUrl);
        
        if (data?.ok) {
            const dbStatus = data.db ? '✅ BD conectado' : '⚠️ BD offline (configure MongoDB)';
            resultDiv.style.background = '#dcfce7';
            resultDiv.style.color = '#166534';
            resultDiv.innerHTML = `✅ Conectado! ${dbStatus}<br><small style="color:#166534;">URL usada: ${normalizedUrl}</small>`;
            btn.textContent = '🔗 Testar';
            btn.disabled = false;
        } else {
            resultDiv.style.background = '#fee2e2';
            resultDiv.style.color = '#991b1b';
            resultDiv.innerHTML = `❌ Servidor respondeu com erro: ${data?.erro || 'sem resposta válida'}<br><small style="color:#991b1b;">URL usada: ${normalizedUrl}</small>`;
            btn.textContent = '🔗 Testar';
            btn.disabled = false;
        }
    } catch (error) {
        console.error('❌ Erro ao testar:', error);
        resultDiv.style.background = '#fee2e2';
        resultDiv.style.color = '#991b1b';
        if (error.name === 'AbortError') {
            resultDiv.innerHTML = '❌ Timeout (8s): Servidor não respondeu. Verifique IP, porta e firewall.';
        } else if (error.message.includes('Failed to fetch')) {
            resultDiv.innerHTML = `❌ Conexão recusada. Verifique se o IP/porta estão corretos e se o servidor está rodando.<br><small style="color:#991b1b;">URL usada: ${url}</small>`;
        } else {
            resultDiv.innerHTML = `❌ Erro: ${error.message}<br><small style="color:#991b1b;">URL usada: ${url}</small>`;
        }
        btn.textContent = '🔗 Testar';
        btn.disabled = false;
    }
}

function mostrarAuthTab(tab) {
    document.querySelectorAll('.auth-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    document.getElementById('auth-form-login').style.display = tab === 'login' ? 'block' : 'none';
    document.getElementById('auth-form-register').style.display = tab === 'register' ? 'block' : 'none';
}

async function tentarConectarApi() {
    const apiUrl = window.APP_CONFIG.getApiUrl();
    const ok = await window.dbBridge.conectarBanco();
    const el = document.getElementById('auth-api-status');
    if (el) {
        el.textContent = ok ? `Servidor online em ${apiUrl}` : `Servidor offline em ${apiUrl} — verifique a URL da API`;
        el.style.color = ok ? '#10b981' : '#ef4444';
    }
    return ok;
}

async function loginApp() {
    const email = document.getElementById('authEmail').value.trim();
    const senha = document.getElementById('authSenha').value;
    const manterConectado = document.getElementById('authManterConectado')?.checked || false;
    if (!email || !senha) return alert('Informe e-mail e senha.');

    const apiUrl = document.getElementById('authApiUrl')?.value?.trim();
    if (apiUrl) window.APP_CONFIG.setApiUrl(apiUrl);

    if (!window.APP_CONFIG.getApiUrl()) {
        return alert('Informe a URL completa da API antes de tentar conectar (ex: http://10.0.0.197:5657).');
    }

    if (!(await tentarConectarApi())) {
        return alert('Não foi possível conectar ao servidor. Confira a URL da API e se o servidor está rodando.');
    }

    try {
        const data = await window.apiClient.post('/api/auth/login', { email, senha, manterConectado });
        window.apiClient.setToken(data.token);
        window.apiClient.setUser(data.user);
        sessaoUsuario = data.user;
        await entrarNoApp();
    } catch (e) {
        alert(e.message || 'Falha no login');
    }
}

async function entrarSemLogin() {
    const apiUrl = document.getElementById('authApiUrl')?.value?.trim();
    if (apiUrl) window.APP_CONFIG.setApiUrl(apiUrl);

    if (!window.APP_CONFIG.getApiUrl()) {
        return alert('Informe a URL completa da API antes de tentar conectar (ex: http://10.0.0.197:5657).');
    }

    if (!(await tentarConectarApi())) {
        return alert('Não foi possível conectar ao servidor. Confira a URL da API e se o servidor está rodando.');
    }

    // Criar usuário temporário para desenvolvimento
    const tempUser = {
        id: 'dev-temp',
        nome: 'Desenvolvedor',
        email: 'dev@temp.local',
        role: 'super_admin',
        tenantId: '000000000000000000000000',
        empresa: 'DEV',
        ativo: true,
        lastOnline: new Date()
    };

    sessaoUsuario = tempUser;
    window.apiClient.setUser(tempUser);
    
    // Não setar token, pois não há autenticação
    await entrarNoApp();
}

async function registrarCliente() {
    const nome = document.getElementById('regNome').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const senha = document.getElementById('regSenha').value;
    const empresa = document.getElementById('regEmpresa')?.value?.trim() || '';

    if (!nome || !email || !senha) return alert('Preencha nome, e-mail e senha.');
    if (senha.length < 6) return alert('Senha com no mínimo 6 caracteres.');

    const apiUrl = document.getElementById('authApiUrl')?.value?.trim();
    if (apiUrl) window.APP_CONFIG.setApiUrl(apiUrl);

    if (!window.APP_CONFIG.getApiUrl()) {
        return alert('Informe a URL completa da API antes de tentar conectar (ex: http://10.0.0.197:5657).');
    }

    if (!(await tentarConectarApi())) {
        return alert('Servidor offline.');
    }

    try {
        const data = await window.apiClient.post('/api/auth/register', { nome, email, senha, empresa });
        window.apiClient.setToken(data.token);
        window.apiClient.setUser(data.user);
        sessaoUsuario = data.user;
        alert('Conta criada com sucesso!');
        await entrarNoApp();
    } catch (e) {
        alert(e.message || 'Erro no cadastro');
    }
}

async function entrarNoApp() {
    sessaoUsuario = window.apiClient.getUser();
    if (!sessaoUsuario) return;

    if (sessaoUsuario.role === 'super_admin') {
        document.getElementById('auth-screen').style.display = 'none';
        document.getElementById('admin-screen').style.display = 'block';
        document.getElementById('app-screen').style.display = 'none';
        await carregarPainelAdmin();
        window.dbBridge.startPing();
        return;
    }

    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('admin-screen').style.display = 'none';
    document.getElementById('app-screen').style.display = 'block';

    const homeBtn = document.querySelector("button[onclick=\"nav('home', this)\"]");
    if (homeBtn) homeBtn.classList.add('active');
    const calcBtn = document.querySelector("button[onclick=\"nav('calculadora', this)\"]");
    if (calcBtn) calcBtn.classList.remove('active');
    const terminalBtn = document.querySelector("button[onclick=\"nav('terminal', this)\"]");
    if (terminalBtn) terminalBtn.classList.remove('active');
    const estoqueBtn = document.querySelector("button[onclick=\"nav('estoque', this)\"]");
    if (estoqueBtn) estoqueBtn.classList.remove('active');

    const avatar = document.querySelector('.mobile-header .avatar');
    if (avatar) avatar.textContent = (sessaoUsuario.nome || 'U').charAt(0).toUpperCase();

    const sub = document.getElementById('user-email-sub');
    if (sub) sub.textContent = sessaoUsuario.email;

    await window.dbBridge.conectarBanco();
    window.dbBridge.startPing();

    // Limpar caches antes de carregar dados
    if (typeof window.custosCache !== 'undefined') window.custosCache = [];
    if (typeof window.estoqueProdutosCache !== 'undefined') window.estoqueProdutosCache = [];
    if (typeof window.modelosCache !== 'undefined') window.modelosCache = [];
    if (typeof window.estoqueCache !== 'undefined') window.estoqueCache = [];

    if (typeof atualizarInterface === 'function') await atualizarInterface();
    if (typeof carregarListaModelos === 'function') await carregarListaModelos();
    if (typeof carregarEstoqueProdutos === 'function') await carregarEstoqueProdutos();
    if (typeof carregarCustos === 'function') await carregarCustos();
    if (typeof atualizarOverviewHome === 'function') await atualizarOverviewHome();
    if (homeBtn && typeof nav === 'function') nav('home', homeBtn);

    const container = document.getElementById('container-filamentos-linhas');
    if (container && container.children.length === 0 && typeof adicionarLinhaFilamento === 'function') {
        adicionarLinhaFilamento();
    }
    if (typeof atualizarStatusConexao === 'function') atualizarStatusConexao(true);
    if (typeof atualizarInterfaceCanais === 'function') atualizarInterfaceCanais();
    if (typeof garantirCamposEditaveis === 'function') garantirCamposEditaveis();
    
    console.log('[auth] Sessão restaurada com sucesso, dados carregados');
}

function sairApp() {
    window.apiClient.logout();
    sessaoUsuario = null;
    if (window._pingInterval) clearInterval(window._pingInterval);
    location.reload();
}

async function carregarPainelAdmin() {
    try {
        const data = await window.apiClient.get('/api/admin/clientes');
        document.getElementById('admin-total').textContent = data.total;
        document.getElementById('admin-ativos').textContent = data.ativos;

        const lista = document.getElementById('admin-lista-clientes');
        if (!data.clientes.length) {
            lista.innerHTML = '<p class="empty-msg">Nenhum cliente cadastrado.</p>';
            return;
        }

        lista.innerHTML = data.clientes.map(c => `
            <div class="item-row admin-cliente-row" data-id="${c.id}">
                <div class="item-info">
                    <b>${c.nome}</b>
                    <span>${c.email}${c.empresa ? ' · ' + c.empresa : ''}</span>
                    <small style="color:#64748b;display:block;margin-top:4px;">
                        Vendas: ${c.vendasCount} · Último online: ${formatarDataRelativa(c.lastOnline)}
                        ${c.ultimaVenda ? ' · Última venda: ' + new Date(c.ultimaVenda.data).toLocaleDateString('pt-BR') : ''}
                    </small>
                </div>
                <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                    <span class="badge-status ${c.ativo ? 'ativo' : 'inativo'}">${c.ativo ? 'Ativo' : 'Inativo'}</span>
                    <button type="button" class="btn-secondary" onclick="toggleClienteAtivo('${c.id}', ${!c.ativo})">
                        ${c.ativo ? 'Desativar' : 'Ativar'}
                    </button>
                </div>
            </div>
        `).join('');
    } catch (e) {
        alert('Erro ao carregar clientes: ' + (e.message || e));
    }
}

async function toggleClienteAtivo(id, ativo) {
    const msg = ativo ? 'Ativar esta conta?' : 'Desativar? O cliente não poderá entrar.';
    if (!confirm(msg)) return;
    try {
        await window.apiClient.patch(`/api/admin/clientes/${id}`, { ativo });
        await carregarPainelAdmin();
    } catch (e) {
        alert(e.message || 'Erro');
    }
}

async function restaurarSessao() {
    const token = window.apiClient.getToken();
    const user = window.apiClient.getUser();
    if (!token || !user) return;

    const apiField = document.getElementById('authApiUrl');
    if (apiField && !apiField.value) apiField.value = window.APP_CONFIG.getApiUrl();

    if (!(await tentarConectarApi())) return;

    try {
        const me = await window.apiClient.get('/api/auth/me');
        window.apiClient.setUser(me.user);
        sessaoUsuario = me.user;
        await entrarNoApp();
    } catch {
        window.apiClient.logout();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const apiField = document.getElementById('authApiUrl');
    if (apiField) apiField.value = window.APP_CONFIG.getApiUrl();
    tentarConectarApi();
    restaurarSessao();
});
