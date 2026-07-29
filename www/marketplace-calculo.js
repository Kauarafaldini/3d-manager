/**
 * Taxas Mercado Livre e Shopee (Brasil) — atualizado para 2026.
 *
 * SHOPEE (desde março/2026):
 *   Comissão escalonada por faixa de preço:
 *     Até R$ 7,99       → 50% do preço + R$ 0
 *     R$ 8 – R$ 79,99   → 20% + R$ 4
 *     R$ 80 – R$ 99,99   → 14% + R$ 16
 *     R$ 100 – R$ 199,99 → 14% + R$ 20
 *     R$ 200 – R$ 499,99 → 14% + R$ 26
 *     ≥ R$ 500           → 14% + R$ 26
 *   Programa Frete Grátis: obrigatório (+2% na comissão).
 *   Subsídio Pix: 5% (R$ 80–499), 8% (≥ R$ 500).
 *
 * MERCADO LIVRE:
 *   Clássico: ~10-14% (padrão 13%). Premium: ~15-19% (padrão 19%).
 *   Taxa fixa: varia por peso/dimensão (padrão editável R$ 6,50) para < R$ 79.
 *   Itens < R$ 12,50: taxa fixa = 50% do valor do produto.
 *
 * Percentuais nos inputs: 12 = 12%.
 */

function pctParaDecimal(pct) {
    return (parseFloat(pct) || 0) / 100;
}

// ==========================================
// MERCADO LIVRE
// ==========================================

function obterConfigML() {
    const tipo = document.getElementById('mlTipoAnuncio')?.value || 'classico';
    let comissaoPct = parseFloat(document.getElementById('mlComissao')?.value);
    if (isNaN(comissaoPct)) {
        comissaoPct = tipo === 'premium' ? 19 : 13;
    }
    return {
        comissaoPct,
        taxaFixa: parseFloat(document.getElementById('mlFixo')?.value) ?? 6.5,
        limiteFixo: parseFloat(document.getElementById('mlFixoLimite')?.value) ?? 79,
        freteGratis: document.getElementById('mlFreteGratis')?.checked ?? true,
        custoFrete: parseFloat(document.getElementById('mlFrete')?.value) ?? 20
    };
}

function mlPctTotal(cfg) {
    return pctParaDecimal(cfg.comissaoPct);
}

function mlTaxaFixaPorVenda(venda, cfg) {
    if (venda <= 0) return 0;
    // Regra 2026: itens com valor < R$ 12,50 → taxa fixa = 50% do valor
    if (venda < 12.50) return venda * 0.50;
    // Com frete grátis:
    //   - Acima do limite: cobra o custo do frete ao invés da taxa fixa
    //   - Abaixo do limite: cobra a taxa fixa normal (editável, padrão R$6,50)
    if (cfg.freteGratis) {
        return venda >= cfg.limiteFixo ? cfg.custoFrete : cfg.taxaFixa;
    }
    // Sem frete grátis: só a taxa fixa abaixo do limite
    return venda < cfg.limiteFixo ? cfg.taxaFixa : 0;
}

function calcularVendaML(custoELucro, cfg) {
    const pct = mlPctTotal(cfg);
    if (pct >= 1) return 0;

    // Cenário com frete grátis:
    if (cfg.freteGratis) {
        // Tenta aplicar com frete (acima de R$79)
        const comFrete = (custoELucro + cfg.custoFrete) / (1 - pct);
        if (comFrete >= cfg.limiteFixo) return Math.max(0, comFrete);
        // Se não chegar em R$79, aplica a taxa fixa normal
        const comFixo = (custoELucro + cfg.taxaFixa) / (1 - pct);
        // Verifica se cai na faixa < R$ 12,50 (taxa = 50% do valor)
        if (comFixo < 12.50) {
            const v = custoELucro / (0.50 - pct);
            if (v > 0 && v < 12.50 && (0.50 - pct) > 0) return Math.max(0, v);
        }
        return Math.max(0, comFixo);
    }

    // Sem frete grátis: abaixo do limite há taxa fixa
    const comFixo = (custoELucro + cfg.taxaFixa) / (1 - pct);
    const semFixo = custoELucro / (1 - pct);
    // Se o preço resultante sem a taxa fixa já ultrapassa o limite, não há taxa
    if (semFixo >= cfg.limiteFixo) return Math.max(0, semFixo);
    // Verifica se cai na faixa < R$ 12,50
    if (comFixo < 12.50) {
        const v = custoELucro / (0.50 - pct);
        if (v > 0 && v < 12.50 && (0.50 - pct) > 0) return Math.max(0, v);
    }
    return Math.max(0, comFixo);
}

function resolverTaxasML(venda, cfg) {
    const pct = mlPctTotal(cfg);
    const taxaFixa = mlTaxaFixaPorVenda(venda, cfg);
    return {
        taxaComissaoPct: pct,
        taxaFixa,
        valorComissao: venda * pct
    };
}

function onMlTipoAnuncioChange() {
    const tipo = document.getElementById('mlTipoAnuncio')?.value;
    const el = document.getElementById('mlComissao');
    if (!el || el.dataset.manual === '1') return;
    el.value = tipo === 'premium' ? 19 : 13;
    if (typeof calcFinanceiro === 'function') calcFinanceiro(false);
}

function onMlComissaoManual() {
    const el = document.getElementById('mlComissao');
    if (el) el.dataset.manual = '1';
}

// ==========================================
// SHOPEE — Tabela escalonada 2026
// ==========================================

/**
 * Tabela de comissão + taxa fixa da Shopee por faixa de preço (2026).
 * Frete Grátis obrigatório: +2% sempre incluso na comissão.
 */
const SHOPEE_FAIXAS = [
    { min: 0,     max: 8,       comissaoPct: 50, taxaFixa: 0,  subsidioPix: 0 },
    { min: 8,     max: 80,      comissaoPct: 20, taxaFixa: 4,  subsidioPix: 0 },
    { min: 80,    max: 100,     comissaoPct: 14, taxaFixa: 16, subsidioPix: 5 },
    { min: 100,   max: 200,     comissaoPct: 14, taxaFixa: 20, subsidioPix: 5 },
    { min: 200,   max: 500,     comissaoPct: 14, taxaFixa: 26, subsidioPix: 5 },
    { min: 500,   max: Infinity, comissaoPct: 14, taxaFixa: 26, subsidioPix: 8 }
];

/** Frete Grátis obrigatório: sempre +2% */
const SHOPEE_FRETE_GRATIS_PCT = 2;

function obterFaixaShopee(venda) {
    if (venda <= 0) return SHOPEE_FAIXAS[0];
    for (const faixa of SHOPEE_FAIXAS) {
        if (venda >= faixa.min && venda < faixa.max) return faixa;
    }
    return SHOPEE_FAIXAS[SHOPEE_FAIXAS.length - 1];
}

function obterConfigShopee() {
    // Comissão customizada do input — aplica-se à faixa >= R$ 80 (onde padrão é 14%)
    const comissaoCustom = parseFloat(document.getElementById('shopeeComissao')?.value);
    const usarTabela = document.getElementById('shopeeTabelaOficial')?.checked ?? false;
    const taxaFixaManual = parseFloat(document.getElementById('shopeeFixo')?.value) ?? 4;
    const limiteFixo = parseFloat(document.getElementById('shopeeFixoLimite')?.value) ?? 79.9;
    return {
        comissaoCustom: isNaN(comissaoCustom) ? 14 : comissaoCustom,
        usarTabela,
        taxaFixa: taxaFixaManual,
        limiteFixo
    };
}

/**
 * Retorna a comissão total em decimal para a Shopee, considerando:
 * - Faixa de preço (tabela escalonada)
 * - Frete Grátis obrigatório (+2%)
 * - Possível comissão customizada para faixas >= R$ 80
 */
function shopeePctTotal(cfg, venda) {
    if (cfg.usarTabela || venda !== undefined) {
        const faixa = obterFaixaShopee(venda || 0);
        let comissao = faixa.comissaoPct;
        // Permite override apenas para faixas >= R$ 80 (onde o padrão é 14%)
        if (faixa.min >= 80 && cfg.comissaoCustom !== undefined && cfg.comissaoCustom !== 14) {
            comissao = cfg.comissaoCustom;
        }
        return pctParaDecimal(comissao + SHOPEE_FRETE_GRATIS_PCT);
    }
    // Fallback modo manual (sem tabela, sem venda conhecida)
    return pctParaDecimal((cfg.comissaoCustom || 14) + SHOPEE_FRETE_GRATIS_PCT);
}

function shopeeTaxaFixaPorVenda(venda, cfg) {
    if (venda <= 0) return 0;
    if (cfg.usarTabela) {
        const faixa = obterFaixaShopee(venda);
        // Faixa < R$ 8: taxa = 50% do preço (já inclusa na comissão, taxa fixa = 0)
        return faixa.taxaFixa;
    }
    // Modo manual
    if (venda > 0 && venda < cfg.limiteFixo) return cfg.taxaFixa;
    return 0;
}

function shopeeSubsidioPix(venda) {
    const faixa = obterFaixaShopee(venda);
    return faixa.subsidioPix || 0;
}

function calcularVendaShopee(custoELucro, cfg) {
    // Sempre usa tabela escalonada (modelo 2026)
    const candidatos = [];

    SHOPEE_FAIXAS.forEach(faixa => {
        let comissao = faixa.comissaoPct;
        if (faixa.min >= 80 && cfg.comissaoCustom !== undefined && cfg.comissaoCustom !== 14) {
            comissao = cfg.comissaoCustom;
        }
        const p = pctParaDecimal(comissao + SHOPEE_FRETE_GRATIS_PCT);

        if (faixa.comissaoPct === 50 && faixa.taxaFixa === 0) {
            // Faixa < R$ 8: comissão total = 52% (50% + 2%), sem taxa fixa
            // venda * 0.52 = venda - custoELucro → venda = custoELucro / (1 - 0.52)
            if (p < 1) {
                const v = custoELucro / (1 - p);
                if (v > 0 && v >= faixa.min && v < faixa.max) candidatos.push(v);
            }
        } else {
            // Faixas com taxa fixa: venda * pct + taxaFixa = venda - custoELucro
            // venda = (custoELucro + taxaFixa) / (1 - pct)
            if (p < 1) {
                const v = (custoELucro + faixa.taxaFixa) / (1 - p);
                if (v >= faixa.min && v < faixa.max) candidatos.push(v);
            }
        }
    });

    if (candidatos.length) return Math.min(...candidatos);

    // Fallback: usa a faixa R$ 8-80 como padrão
    const pFallback = pctParaDecimal(20 + SHOPEE_FRETE_GRATIS_PCT);
    return (custoELucro + 4) / (1 - pFallback);
}

function resolverTaxasShopee(venda, cfg) {
    const pct = shopeePctTotal(cfg, venda);
    const taxaFixa = shopeeTaxaFixaPorVenda(venda, cfg);
    const subsidioPix = shopeeSubsidioPix(venda);
    return {
        taxaComissaoPct: pct,
        taxaFixa,
        valorComissao: venda * pct,
        subsidioPix
    };
}

// ==========================================
// Exports
// ==========================================

if (typeof window !== 'undefined') {
    window.obterConfigML = obterConfigML;
    window.obterConfigShopee = obterConfigShopee;
    window.calcularVendaML = calcularVendaML;
    window.calcularVendaShopee = calcularVendaShopee;
    window.resolverTaxasML = resolverTaxasML;
    window.resolverTaxasShopee = resolverTaxasShopee;
    window.onMlTipoAnuncioChange = onMlTipoAnuncioChange;
    window.onMlComissaoManual = onMlComissaoManual;
    window.shopeeSubsidioPix = shopeeSubsidioPix;
    window.SHOPEE_FAIXAS = SHOPEE_FAIXAS;
}
