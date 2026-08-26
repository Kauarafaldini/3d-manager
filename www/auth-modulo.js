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

function mostrarAuthErro(msg) {
    const errDiv = document.getElementById('auth-error-msg');
    if (errDiv) {
        if (msg) {
            errDiv.textContent = msg;
            errDiv.style.display = 'block';
        } else {
            errDiv.style.display = 'none';
        }
    }
}

function mostrarAuthTab(tab) {
    document.querySelectorAll('.auth-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    document.getElementById('auth-form-login').style.display = tab === 'login' ? 'block' : 'none';
    document.getElementById('auth-form-register').style.display = tab === 'register' ? 'block' : 'none';
    mostrarAuthErro('');
}

async function tentarConectarApi() {
    const apiUrl = window.APP_CONFIG.getApiUrl();
    const ok = await window.dbBridge.conectarBanco();
    const el = document.getElementById('auth-api-status');
    if (el) {
        el.textContent = ok ? `Servidor online` : `Servidor offline — tentando reconectar...`;
        el.style.color = ok ? '#10b981' : '#ef4444';
    }
    return ok;
}

async function loginApp() {
    mostrarAuthErro('');
    const emailEl = document.getElementById('authEmail');
    const senhaEl = document.getElementById('authSenha');
    const loginBtn = document.querySelector('#auth-form-login .btn-login');

    const email = emailEl?.value?.trim();
    const senha = senhaEl?.value;
    const manterConectado = document.getElementById('authManterConectado')?.checked || false;

    // Garantir que os inputs nunca fiquem travados
    if (emailEl) { emailEl.disabled = false; emailEl.readOnly = false; emailEl.removeAttribute('disabled'); emailEl.removeAttribute('readonly'); }
    if (senhaEl) { senhaEl.disabled = false; senhaEl.readOnly = false; senhaEl.removeAttribute('disabled'); senhaEl.removeAttribute('readonly'); }

    if (!email || !senha) {
        mostrarAuthErro('Informe e-mail e senha.');
        if (!email && emailEl) emailEl.focus();
        else if (senhaEl) senhaEl.focus();
        return;
    }

    try {
        if (loginBtn) {
            loginBtn.disabled = true;
            loginBtn.textContent = '⏳ Entrando...';
        }

        const data = await window.apiClient.post('/api/auth/login', { email, senha, manterConectado });
        window.apiClient.setToken(data.token);
        window.apiClient.setUser(data.user);
        sessaoUsuario = data.user;
        await entrarNoApp();
    } catch (e) {
        console.error('[login] Erro:', e);
        const msg = e.message || 'Falha no login. Verifique seu e-mail e senha.';
        mostrarAuthErro(`❌ ${msg}`);
        if (senhaEl) {
            senhaEl.value = '';
            senhaEl.focus();
        }
    } finally {
        if (loginBtn) {
            loginBtn.disabled = false;
            loginBtn.textContent = 'Entrar';
        }
        if (emailEl) { emailEl.disabled = false; emailEl.readOnly = false; emailEl.removeAttribute('disabled'); emailEl.removeAttribute('readonly'); }
        if (senhaEl) { senhaEl.disabled = false; senhaEl.readOnly = false; senhaEl.removeAttribute('disabled'); senhaEl.removeAttribute('readonly'); }
        if (typeof reativarFormularios === 'function') reativarFormularios('#authSenha');
    }
}


async function registrarCliente() {
    mostrarAuthErro('');
    const regBtn = document.querySelector('#auth-form-register .btn-login');
    const nomeEl = document.getElementById('regNome');
    const emailEl = document.getElementById('regEmail');
    const senhaEl = document.getElementById('regSenha');
    const empresaEl = document.getElementById('regEmpresa');

    const nome = nomeEl?.value?.trim();
    const email = emailEl?.value?.trim();
    const senha = senhaEl?.value;
    const empresa = empresaEl?.value?.trim() || '';

    if (!nome || !email || !senha) {
        mostrarAuthErro('Preencha nome, e-mail e senha.');
        return;
    }
    if (senha.length < 6) {
        mostrarAuthErro('Senha com no mínimo 6 caracteres.');
        return;
    }

    try {
        if (regBtn) {
            regBtn.disabled = true;
            regBtn.textContent = '⏳ Criando conta...';
        }

        const data = await window.apiClient.post('/api/auth/register', { nome, email, senha, empresa });
        window.apiClient.setToken(data.token);
        window.apiClient.setUser(data.user);
        sessaoUsuario = data.user;
        if (typeof mostrarToast === 'function') mostrarToast('Conta criada com sucesso!');
        await entrarNoApp();
    } catch (e) {
        console.error('[register] Erro:', e);
        mostrarAuthErro(`❌ ${e.message || 'Erro no cadastro'}`);
    } finally {
        if (regBtn) {
            regBtn.disabled = false;
            regBtn.textContent = 'Criar conta';
        }
        if (typeof reativarFormularios === 'function') reativarFormularios('#regSenha');
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
    if (window.ImpressorasFilaModulo && typeof window.ImpressorasFilaModulo.init === 'function') await window.ImpressorasFilaModulo.init();
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
    // Aplicar tema salvo imediatamente
    const temaSalvo = localStorage.getItem('3dm_tema') || 'obsidian';
    document.documentElement.setAttribute('data-theme', temaSalvo);

    const apiField = document.getElementById('authApiUrl');
    if (apiField) {
        const urlAtual = window.APP_CONFIG.getApiUrl();
        apiField.value = urlAtual || 'https://threed-manager-q1tc.onrender.com';
    }
    tentarConectarApi();
    restaurarSessao();
});

