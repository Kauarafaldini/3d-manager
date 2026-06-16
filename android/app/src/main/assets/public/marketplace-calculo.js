/**
 * Taxas Mercado Livre e Shopee (Brasil) — campos alinhados à central do vendedor.
 * Referências: ML custos por vender / tarifas; Shopee taxas e comissões.
 * Percentuais nos inputs: 12 = 12%.
 */

function pctParaDecimal(pct) {
    return (parseFloat(pct) || 0) / 100;
}

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

function obterConfigShopee() {
    const comissaoBase = parseFloat(document.getElementById('shopeeComissao')?.value) || 14;
    const freteGratis = document.getElementById('shopeeFreteGratis')?.checked ?? false;
    const usarTabela = document.getElementById('shopeeTabelaOficial')?.checked ?? false;
    return {
        comissaoPct: comissaoBase + (freteGratis ? 2 : 0),
        freteGratis,
        usarTabela,
        taxaFixa: parseFloat(document.getElementById('shopeeFixo')?.value) ?? 4,
        limiteFixo: parseFloat(document.getElementById('shopeeFixoLimite')?.value) ?? 79.9
    };
}

function mlPctTotal(cfg) {
    return pctParaDecimal(cfg.comissaoPct);
}

function shopeePctTotal(cfg) {
    return pctParaDecimal(cfg.comissaoPct);
}

function mlTaxaFixaPorVenda(venda, cfg) {
    if (venda <= 0) return 0;
    // Com frete grátis:
    //   - Acima do limite: cobra o custo do frete ao invés da taxa fixa
    //   - Abaixo do limite: cobra a taxa fixa normal (R$6,50)
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
        // Se não cheegar em R$79, aplica a taxa fixa normal
        const comFixo = (custoELucro + cfg.taxaFixa) / (1 - pct);
        return Math.max(0, comFixo);
    }

    // Sem frete grátis: abaixo do limite há taxa fixa
    const comFixo = (custoELucro + cfg.taxaFixa) / (1 - pct);
    const semFixo = custoELucro / (1 - pct);
    // Se o preço resultante sem a taxa fixa já ultrapassa o limite, não há taxa
    if (semFixo >= cfg.limiteFixo) return Math.max(0, semFixo);
    return Math.max(0, comFixo);
}

function shopeeTaxaFixaPorVenda(venda, cfg) {
    if (!cfg.usarTabela) {
        if (venda > 0 && venda < cfg.limiteFixo) return cfg.taxaFixa;
        return 0;
    }
    if (venda <= 0) return 0;
    if (venda < 8) return venda * 0.5;
    if (venda < 80) return 4;
    if (venda < 100) return 16;
    if (venda < 200) return 20;
    return 26;
}

function calcularVendaShopee(custoELucro, cfg) {
    const pct = shopeePctTotal(cfg);
    if (pct >= 1) return 0;

    if (cfg.usarTabela) {
        const p = pct;
        const candidatos = [];
        if (p < 0.5) {
            const v1 = custoELucro / (0.5 - p);
            if (v1 > 0 && v1 < 8) candidatos.push(v1);
        }
        [
            { add: 4, min: 8, max: 80 },
            { add: 16, min: 80, max: 100 },
            { add: 20, min: 100, max: 200 },
            { add: 26, min: 200, max: Infinity }
        ].forEach(f => {
            const v = (custoELucro + f.add) / (1 - p);
            if (v >= f.min && v < f.max) candidatos.push(v);
        });
        if (candidatos.length) return Math.min(...candidatos);
        return (custoELucro + 4) / (1 - p);
    }

    let venda = (custoELucro + cfg.taxaFixa) / (1 - pct);
    const semFixo = custoELucro / (1 - pct);
    if (semFixo >= cfg.limiteFixo) venda = semFixo;
    return Math.max(0, venda);
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

function resolverTaxasShopee(venda, cfg) {
    const pct = shopeePctTotal(cfg);
    const taxaFixa = shopeeTaxaFixaPorVenda(venda, cfg);
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

if (typeof window !== 'undefined') {
    window.obterConfigML = obterConfigML;
    window.obterConfigShopee = obterConfigShopee;
    window.calcularVendaML = calcularVendaML;
    window.calcularVendaShopee = calcularVendaShopee;
    window.resolverTaxasML = resolverTaxasML;
    window.resolverTaxasShopee = resolverTaxasShopee;
    window.onMlTipoAnuncioChange = onMlTipoAnuncioChange;
    window.onMlComissaoManual = onMlComissaoManual;
}
