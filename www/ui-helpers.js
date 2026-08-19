/**
 * Utilitários de UI — evita campos travados após alert() no Electron
 * e padroniza reset pós-salvamento.
 */

function mostrarToast(mensagem, tipo = 'ok') {
    let toast = document.getElementById('app-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'app-toast';
        toast.className = 'app-toast';
        document.body.appendChild(toast);
    }
    toast.textContent = mensagem;
    toast.className = `app-toast app-toast-${tipo}`;
    toast.style.display = 'block';
    clearTimeout(mostrarToast._timer);
    mostrarToast._timer = setTimeout(() => {
        toast.style.display = 'none';
    }, 3200);
}

function reativarFormularios(seletorFoco) {
    const liberar = typeof liberarInput === 'function' ? liberarInput : (el) => {
        if (!el) return;
        el.readOnly = false;
        el.disabled = false;
        el.removeAttribute('readonly');
        el.removeAttribute('disabled');
    };
    const garantir = typeof garantirCamposEditaveis === 'function' ? garantirCamposEditaveis : () => {};

    const run = () => {
        const app = document.getElementById('app-screen');
        if (app) {
            app.style.pointerEvents = '';
            app.removeAttribute('inert');
        }
        const auth = document.getElementById('auth-screen');
        if (auth) {
            auth.style.pointerEvents = '';
            auth.removeAttribute('inert');
        }
        document.querySelectorAll('#app-screen input, #app-screen select, #app-screen textarea, #app-screen button, #auth-screen input, #auth-screen select, #auth-screen textarea, #auth-screen button').forEach(el => {
            liberar(el);
            if (el.tagName === 'BUTTON') el.disabled = false;
        });
        garantir(document);
        document.body.style.pointerEvents = '';
        if (seletorFoco) {
            const alvo = document.querySelector(seletorFoco);
            if (alvo) {
                alvo.focus();
                if (alvo.select) alvo.select();
            }
        }
    };

    requestAnimationFrame(() => {
        run();
        setTimeout(run, 50);
        setTimeout(run, 200);
    });
}

async function aposOperacaoSalvar({ mensagem, resetFn, foco, atualizar = true }) {
    if (mensagem) mostrarToast(mensagem);
    if (typeof resetFn === 'function') resetFn();
    if (atualizar && typeof atualizarInterface === 'function') {
        await atualizarInterface();
    }
    reativarFormularios(foco);
}

function resetFormularioVenda() {
    const set = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.value = val;
    };
    set('pNome', '');
    set('pVenda', '0');
    set('pMargemDesejada', '');
    set('pModeloSelect', '');
    const btnEx = document.getElementById('btnExcluirModelo');
    if (btnEx) btnEx.style.display = 'none';

    if (typeof definirTempoCampos === 'function') definirTempoCampos(0);

    const fil = document.getElementById('container-filamentos-linhas');
    if (fil) {
        fil.innerHTML = '';
        if (typeof adicionarLinhaFilamento === 'function') adicionarLinhaFilamento();
    }
    const extras = document.getElementById('container-custos-extras-linhas');
    if (extras) extras.innerHTML = '';

    if (typeof calcFinanceiro === 'function') calcFinanceiro(false);
}

function resetFormularioEstoque() {
    const set = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.value = val;
    };
    set('estNome', '');
    set('estPreco', '');
    set('estGrama', '1000');
}

function resetFormularioCustoCadastro() {
    const ids = ['cadNome', 'cadPrecoTotal', 'cadQtdTotal', 'cadCustoUnitario', 'cadValorMensal', 'cadCustoHora', 'cadObs'];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    const horas = document.getElementById('cadHorasMes');
    if (horas) horas.value = '160';
    const un = document.getElementById('cadUnidade');
    if (un) un.value = 'un';
    if (typeof atualizarPreviewCustoCadastro === 'function') atualizarPreviewCustoCadastro();
}

if (typeof window !== 'undefined') {
    window.mostrarToast = mostrarToast;
    window.reativarFormularios = reativarFormularios;
    window.aposOperacaoSalvar = aposOperacaoSalvar;
    window.resetFormularioVenda = resetFormularioVenda;
    window.resetFormularioEstoque = resetFormularioEstoque;
    window.resetFormularioCustoCadastro = resetFormularioCustoCadastro;
}
