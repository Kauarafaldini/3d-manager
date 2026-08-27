/**
 * Módulo de Perfil & Configurações da Loja - 3D Manager Pro
 * Permite gerenciar Foto/Logo da Loja, Nome Fantasia, CPF/CNPJ, Contatos, Chave PIX e Impressoras 3D.
 */
const PerfilLojaModulo = (function() {
    let fotoTempBase64 = null;

    function formatarDocumento(valor) {
        if (!valor) return '';
        const v = String(valor).replace(/\D/g, '');
        if (v.length <= 11) {
            // CPF: 000.000.000-00
            return v
                .replace(/(\d{3})(\d)/, '$1.$2')
                .replace(/(\d{3})(\d)/, '$1.$2')
                .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
        } else {
            // CNPJ: 00.000.000/0000-00
            return v
                .slice(0, 14)
                .replace(/(\d{2})(\d)/, '$1.$2')
                .replace(/(\d{3})(\d)/, '$1.$2')
                .replace(/(\d{3})(\d)/, '$1/$2')
                .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
        }
    }

    function mascaraCpfCnpj(input) {
        if (!input) return;
        const pos = input.selectionStart;
        const originalLength = input.value.length;
        input.value = formatarDocumento(input.value);
        const newLength = input.value.length;
        if (pos !== null) {
            input.setSelectionRange(pos + (newLength - originalLength), pos + (newLength - originalLength));
        }
    }

    function formatarTelefone(valor) {
        if (!valor) return '';
        const v = String(valor).replace(/\D/g, '').slice(0, 11);
        if (v.length <= 10) {
            return v
                .replace(/(\d{2})(\d)/, '($1) $2')
                .replace(/(\d{4})(\d{1,4})$/, '$1-$2');
        } else {
            return v
                .replace(/(\d{2})(\d)/, '($1) $2')
                .replace(/(\d{5})(\d{1,4})$/, '$1-$2');
        }
    }

    function mascaraTelefone(input) {
        if (!input) return;
        const pos = input.selectionStart;
        const originalLength = input.value.length;
        input.value = formatarTelefone(input.value);
        const newLength = input.value.length;
        if (pos !== null) {
            input.setSelectionRange(pos + (newLength - originalLength), pos + (newLength - originalLength));
        }
    }

    function carregarFotoLogotipo(event) {
        const file = event.target?.files?.[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            if (typeof mostrarToast === 'function') mostrarToast('Selecione um arquivo de imagem válido', 'erro');
            return;
        }

        // Limite de 5MB
        if (file.size > 5 * 1024 * 1024) {
            if (typeof mostrarToast === 'function') mostrarToast('Imagem muito grande (máximo 5MB)', 'erro');
            return;
        }

        const reader = new FileReader();
        reader.onload = function(e) {
            const img = new Image();
            img.onload = function() {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 300;
                const MAX_HEIGHT = 300;
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > MAX_WIDTH) {
                        height *= MAX_WIDTH / width;
                        width = MAX_WIDTH;
                    }
                } else {
                    if (height > MAX_HEIGHT) {
                        width *= MAX_HEIGHT / height;
                        height = MAX_HEIGHT;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                fotoTempBase64 = canvas.toDataURL('image/jpeg', 0.85);
                atualizarPreviewFoto(fotoTempBase64);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    function removerFoto() {
        fotoTempBase64 = '';
        atualizarPreviewFoto('');
    }

    function atualizarPreviewFoto(fotoSrc) {
        const previewEl = document.getElementById('perfilFotoPreview');
        const user = window.apiClient?.getUser() || {};
        const nome = user.nome || 'Usuário';

        if (!previewEl) return;

        if (fotoSrc) {
            previewEl.innerHTML = `<img src="${fotoSrc}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" alt="Logo">`;
        } else {
            const inicial = (nome.charAt(0) || 'A').toUpperCase();
            previewEl.innerHTML = `<span style="font-size:30px;font-weight:800;color:white;">${inicial}</span>`;
        }
    }

    function renderizarAvatarTopo(user) {
        const avatarEl = document.getElementById('user-avatar-letter');
        const emailSub = document.getElementById('user-email-sub');

        if (user && emailSub) {
            emailSub.textContent = user.empresa ? `${user.empresa} (${user.email})` : user.email;
        }

        if (!avatarEl) return;

        if (user && user.foto) {
            avatarEl.innerHTML = `<img src="${user.foto}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" alt="Avatar">`;
            avatarEl.style.background = 'transparent';
            avatarEl.style.padding = '0';
        } else {
            const nome = user?.nome || 'A';
            avatarEl.innerHTML = (nome.charAt(0) || 'A').toUpperCase();
            avatarEl.style.background = 'linear-gradient(135deg, var(--primary), var(--accent))';
        }
    }

    function renderizarImpressorasPerfil() {
        const container = document.getElementById('perfilListaImpressoras');
        if (!container) return;

        const impressoras = (typeof ImpressorasFilaModulo !== 'undefined' && ImpressorasFilaModulo.obterImpressoras)
            ? ImpressorasFilaModulo.obterImpressoras()
            : [];

        if (!impressoras || !impressoras.length) {
            container.innerHTML = `
                <div style="background:var(--bg-secondary);padding:14px;border-radius:10px;border:1px solid var(--border-subtle);text-align:center;">
                    <p style="margin:0 0 10px;font-size:12px;color:var(--text-dim);">Nenhuma impressora 3D cadastrada ainda.</p>
                    <button type="button" class="btn-main" onclick="ImpressorasFilaModulo.abrirModalGerenciar();" style="font-size:11px;padding:8px 14px;margin:0;">➕ Cadastrar Minha Primeira Impressora</button>
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <div style="display:flex;flex-direction:column;gap:8px;">
                ${impressoras.map(imp => {
                    const statusText = imp.status === 'imprimindo' ? '⚡ Imprimindo' : '🟢 Pronta';
                    const tipoConexao = imp.tipoConexao ? imp.tipoConexao.toUpperCase() : 'MANUAL';
                    const id = String(imp._id);
                    return `
                        <div style="display:flex;justify-content:space-between;align-items:center;background:var(--bg-secondary);padding:10px 14px;border-radius:10px;border:1px solid var(--border-subtle);">
                            <div>
                                <b style="font-size:13px;color:var(--text);">${imp.nome}</b>
                                <span style="font-size:10px;color:var(--text-dim);display:block;">${imp.modelo || '3D'} · ${imp.potenciaWatts || 150}W · Desgaste: R$ ${(imp.taxaDesgasteHora || 0).toFixed(2)}/h · ${tipoConexao}</span>
                            </div>
                            <div style="display:flex;align-items:center;gap:6px;">
                                <span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px;background:rgba(6,182,212,0.15);color:var(--primary);">${statusText}</span>
                                <button type="button" class="btn-secondary" style="padding:4px 8px;font-size:10px;" onclick="ImpressorasFilaModulo.editarImpressora('${id}'); ImpressorasFilaModulo.abrirModalGerenciar();" title="Editar">✏️</button>
                                <button type="button" class="btn-delete-row" style="padding:4px 8px;font-size:10px;" onclick="ImpressorasFilaModulo.excluirImpressora('${id}')" title="Excluir">🗑️</button>
                            </div>
                        </div>
                    `;
                }).join('')}
                <button type="button" class="btn-secondary" onclick="ImpressorasFilaModulo.abrirModalGerenciar();" style="font-size:11px;padding:8px 12px;margin-top:4px;">⚙️ Gerenciar / Adicionar Mais Impressoras</button>
            </div>
        `;
    }

    function carregarDadosTelaConfiguracoes() {
        const user = window.apiClient?.getUser() || {};

        const fNome = document.getElementById('perfilNome');
        const fEmpresa = document.getElementById('perfilEmpresa');
        const fEmail = document.getElementById('perfilEmail');
        const fCpfCnpj = document.getElementById('perfilCpfCnpj');
        const fTelefone = document.getElementById('perfilTelefone');
        const fChavePix = document.getElementById('perfilChavePix');

        if (fNome) fNome.value = user.nome || '';
        if (fEmpresa) fEmpresa.value = user.empresa || '';
        if (fEmail) fEmail.value = user.email || '';
        if (fCpfCnpj) fCpfCnpj.value = formatarDocumento(user.cpfCnpj || '');
        if (fTelefone) fTelefone.value = formatarTelefone(user.telefone || '');
        if (fChavePix) fChavePix.value = user.chavePix || '';

        fotoTempBase64 = user.foto || null;
        atualizarPreviewFoto(fotoTempBase64);
        renderizarImpressorasPerfil();
    }

    function abrirTelaConfiguracoes() {
        if (typeof window.nav === 'function') {
            window.nav('configuracoes');
        }
        carregarDadosTelaConfiguracoes();
    }

    // Alias para compatibilidade
    function abrirModalPerfil() {
        abrirTelaConfiguracoes();
    }

    function fecharModalPerfil() {
        if (typeof window.nav === 'function') {
            window.nav('home');
        }
    }

    function obterDadosPerfil() {
        const user = window.apiClient?.getUser() || {};
        return {
            nome: user.nome || '',
            empresa: user.empresa || '',
            email: user.email || '',
            cpfCnpj: user.cpfCnpj || '',
            telefone: user.telefone || '',
            chavePix: user.chavePix || localStorage.getItem('3dm_chave_pix') || '',
            foto: user.foto || null
        };
    }

    async function salvarPerfil() {
        const fNome = document.getElementById('perfilNome')?.value?.trim();
        const fEmpresa = document.getElementById('perfilEmpresa')?.value?.trim();
        const fCpfCnpj = document.getElementById('perfilCpfCnpj')?.value?.trim();
        const fTelefone = document.getElementById('perfilTelefone')?.value?.trim();
        const fChavePix = document.getElementById('perfilChavePix')?.value?.trim();
        const btnSalvar = document.getElementById('btnSalvarPerfilLoja');
        const btnSalvarTopo = document.getElementById('btnSalvarPerfilLojaTopo');

        if (!fNome) {
            if (typeof mostrarToast === 'function') mostrarToast('Informe seu nome ou da empresa', 'erro');
            return;
        }

        try {
            if (btnSalvar) {
                btnSalvar.disabled = true;
                btnSalvar.textContent = '⏳ Salvando...';
            }
            if (btnSalvarTopo) {
                btnSalvarTopo.disabled = true;
                btnSalvarTopo.textContent = '⏳ Salvando...';
            }

            const dados = {
                nome: fNome,
                empresa: fEmpresa || '',
                telefone: fTelefone || '',
                chavePix: fChavePix || '',
                cpfCnpj: fCpfCnpj || ''
            };

            if (fotoTempBase64 !== null) {
                dados.foto = fotoTempBase64;
            }

            // Persiste Chave PIX localmente também para orçamentos offline
            if (fChavePix) {
                localStorage.setItem('3dm_chave_pix', fChavePix);
            }

            const res = await window.apiClient.put('/api/auth/profile', dados);

            if (res && res.user) {
                window.apiClient.setUser(res.user);
                renderizarAvatarTopo(res.user);

                if (typeof NotificacoesModulo !== 'undefined') {
                    NotificacoesModulo.adicionarNotificacao({
                        tipo: 'sistema',
                        icone: '✅',
                        titulo: 'Configurações salvas!',
                        mensagem: 'As informações da sua loja, contatos e Chave PIX foram atualizadas.'
                    });
                }

                if (typeof mostrarToast === 'function') mostrarToast('Configurações da loja salvas com sucesso!', 'ok');
            }
        } catch (err) {
            console.error('Erro ao salvar perfil:', err);
            if (typeof mostrarToast === 'function') mostrarToast(err.message || 'Erro ao salvar perfil', 'erro');
        } finally {
            if (btnSalvar) {
                btnSalvar.disabled = false;
                btnSalvar.textContent = '💾 Salvar Configurações da Loja';
            }
            if (btnSalvarTopo) {
                btnSalvarTopo.disabled = false;
                btnSalvarTopo.textContent = '💾 Salvar';
            }
        }
    }

    return {
        abrirTelaConfiguracoes,
        abrirModalPerfil,
        fecharModalPerfil,
        carregarDadosTelaConfiguracoes,
        carregarFotoLogotipo,
        removerFoto,
        salvarPerfil,
        mascaraCpfCnpj,
        mascaraTelefone,
        formatarDocumento,
        formatarTelefone,
        renderizarAvatarTopo,
        renderizarImpressorasPerfil,
        obterDadosPerfil
    };
})();

if (typeof window !== 'undefined') {
    window.PerfilLojaModulo = PerfilLojaModulo;
}
