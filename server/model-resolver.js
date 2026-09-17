/**
 * 3D Manager Pro - Model URL Resolver
 * Resolução e extração de metadados de links do MakerWorld (Bambu Handy), Printables, Thingiverse e arquivos diretos.
 */

const https = require('https');
const http = require('http');

/**
 * Extrai a primeira URL encontrada em um texto (útil para mensagens de compartilhamento do celular)
 */
function extrairUrlDoTexto(texto) {
    if (!texto || typeof texto !== 'string') return '';
    const match = texto.match(/https?:\/\/[^\s"'<>]+/i);
    return match ? match[0] : texto.trim();
}

/**
 * Faz requisição HTTP/HTTPS GET retornando Promise com o corpo da resposta
 */
function fetchHttp(url, options = {}) {
    return new Promise((resolve, reject) => {
        const client = url.startsWith('https') ? https : http;
        const reqOptions = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/plain, */*',
                'Referer': 'https://makerworld.com/',
                ...(options.headers || {})
            },
            method: options.method || 'GET',
            timeout: options.timeout || 15000
        };

        const req = client.request(url, reqOptions, (res) => {
            // Seguir redirecionamentos (301, 302, 307, 308)
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                let redirectUrl = res.headers.location;
                if (!redirectUrl.startsWith('http')) {
                    const u = new URL(url);
                    redirectUrl = `${u.protocol}//${u.host}${redirectUrl}`;
                }
                return resolve(fetchHttp(redirectUrl, options));
            }

            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                resolve({
                    status: res.statusCode,
                    headers: res.headers,
                    body: data
                });
            });
        });

        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Tempo limite de conexão excedido'));
        });

        req.on('error', err => reject(err));

        if (options.body) {
            req.write(options.body);
        }
        req.end();
    });
}

/**
 * Resolve modelo e perfis do MakerWorld / Bambu Handy
 */
async function resolverMakerWorld(urlOriginal) {
    let designId = null;
    let targetProfileId = null;

    // Extrair profileId se presente (ex: #profileId-1773522 ou ?profileId=1773522)
    const profileMatch = urlOriginal.match(/profileId[-=](\d+)/i) || urlOriginal.match(/instanceId[-=](\d+)/i);
    if (profileMatch) {
        targetProfileId = parseInt(profileMatch[1], 10);
    }

    // Extrair designId (ex: /models/105342 ou design/105342 ou ?id=105342)
    const designMatch = urlOriginal.match(/models\/(\d+)/i) || 
                        urlOriginal.match(/design\/(\d+)/i) || 
                        urlOriginal.match(/[?&]id=(\d+)/i);
    
    if (designMatch) {
        designId = parseInt(designMatch[1], 10);
    }

    if (!designId) {
        throw new Error('Não foi possível identificar o ID do modelo MakerWorld no link fornecido.');
    }

    const apiUrl = `https://makerworld.com/api/v1/design-service/design/${designId}`;
    const resp = await fetchHttp(apiUrl);

    if (resp.status !== 200) {
        throw new Error(`MakerWorld retornou status ${resp.status}`);
    }

    let json;
    try {
        json = JSON.parse(resp.body);
    } catch (e) {
        throw new Error('Resposta inválida do servidor MakerWorld');
    }

    if (!json || !json.title) {
        throw new Error('Modelo não encontrado ou sem informações públicas no MakerWorld.');
    }

    const instances = Array.isArray(json.instances) ? json.instances : [];
    
    // Processar os perfis / branches de impressão
    const perfis = instances.map((inst, index) => {
        const platesRaw = inst.extention?.modelInfo?.plates || [];
        const plates = platesRaw.map(p => ({
            index: p.index || 1,
            nome: p.name || `Placa ${p.index || 1}`,
            tempoSegundos: p.prediction || 0,
            tempoFormatado: formatarSegundos(p.prediction || 0),
            pesoGramas: p.weight || 0,
            thumbnailUrl: p.thumbnail?.url || p.top_picture?.url || ''
        }));

        // Filamentos utilizados
        const filamentosRaw = inst.instanceFilaments || [];
        const filamentos = filamentosRaw.map(f => ({
            tipo: f.type || 'PLA',
            corHex: f.color || '#202020',
            pesoGramas: parseFloat(f.usedG || 0),
            metrosUsados: parseFloat(f.usedM || 0)
        }));

        const tempoTotalSegundos = inst.prediction || 0;
        const pesoTotalGramas = inst.weight || 0;

        return {
            id: inst.id,
            profileId: inst.profileId || inst.id,
            index,
            titulo: inst.title || `Perfil de Impressão #${index + 1}`,
            descricao: inst.summary || '',
            autorPerfil: inst.instanceCreator?.name || json.designCreator?.name || 'Comunidade',
            pesoGramas: pesoTotalGramas,
            tempoSegundos: tempoTotalSegundos,
            tempoHoras: parseFloat((tempoTotalSegundos / 3600).toFixed(2)),
            tempoFormatado: formatarSegundos(tempoTotalSegundos),
            precisaAms: !!inst.needAms,
            quantidadeCores: inst.materialColorCnt || filamentos.length || 1,
            filamentos,
            plates,
            coverUrl: inst.cover || json.coverUrl || '',
            isDefault: !!inst.isDefault || (targetProfileId && (inst.id === targetProfileId || inst.profileId === targetProfileId)),
            avaliacao: inst.score ? parseFloat(inst.score.toFixed(1)) : 0,
            downloads: inst.downloadCount || 0
        };
    });

    // Se houver um targetProfileId especificado no link, priorizar esse perfil
    let perfilSelecionadoIndex = 0;
    if (targetProfileId) {
        const foundIdx = perfis.findIndex(p => p.id === targetProfileId || p.profileId === targetProfileId);
        if (foundIdx >= 0) {
            perfilSelecionadoIndex = foundIdx;
        }
    } else {
        const defaultIdx = perfis.findIndex(p => p.isDefault);
        if (defaultIdx >= 0) {
            perfilSelecionadoIndex = defaultIdx;
        }
    }

    const perfilPrincipal = perfis[perfilSelecionadoIndex] || null;

    return {
        ok: true,
        plataforma: 'makerworld',
        nomePlataforma: 'MakerWorld (Bambu Lab)',
        idModelo: String(designId),
        titulo: json.title,
        descricao: (json.summary || '').replace(/<[^>]*>?/gm, '').trim(),
        autor: json.designCreator?.name || 'Desconhecido',
        avatarAutor: json.designCreator?.avatar || '',
        coverUrl: json.coverUrl || (perfilPrincipal ? perfilPrincipal.coverUrl : ''),
        urlOriginal,
        tags: Array.isArray(json.tags) ? json.tags : [],
        totalCurtidas: json.likeCount || 0,
        totalDownloads: json.downloadCount || 0,
        perfis,
        perfilSelecionadoIndex,
        // Dados diretos do perfil selecionado para preenchimento rápido
        pesoGramas: perfilPrincipal ? perfilPrincipal.pesoGramas : 0,
        tempoHoras: perfilPrincipal ? perfilPrincipal.tempoHoras : 0,
        tempoFormatado: perfilPrincipal ? perfilPrincipal.tempoFormatado : '0min',
        filamentos: perfilPrincipal ? perfilPrincipal.filamentos : [],
        plates: perfilPrincipal ? perfilPrincipal.plates : []
    };
}

/**
 * Resolve modelo do Printables
 */
async function resolverPrintables(urlOriginal) {
    const match = urlOriginal.match(/model\/(\d+)/i);
    if (!match) {
        throw new Error('Não foi possível identificar o ID do modelo Printables.');
    }
    const printId = match[1];

    const postData = JSON.stringify({
        query: `query PrintDetail($id: ID!) {
            print(id: $id) {
                id
                name
                summary
                image { filePath }
                user { handle publicUsername }
                weight
            }
        }`,
        variables: { id: printId }
    });

    const resp = await fetchHttp('https://api.printables.com/graphql/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: postData
    });

    let json;
    try {
        json = JSON.parse(resp.body);
    } catch (e) {
        throw new Error('Erro ao processar resposta do Printables');
    }

    const print = json?.data?.print;
    if (!print) {
        throw new Error('Modelo não encontrado no Printables.');
    }

    const imgUrl = print.image?.filePath ? `https://media.printables.com/${print.image.filePath}` : '';

    return {
        ok: true,
        plataforma: 'printables',
        nomePlataforma: 'Printables (Prusa)',
        idModelo: String(print.id),
        titulo: print.name,
        descricao: print.summary || '',
        autor: print.user?.publicUsername || print.user?.handle || 'Desconhecido',
        avatarAutor: '',
        coverUrl: imgUrl,
        urlOriginal,
        tags: [],
        perfis: [{
            id: print.id,
            titulo: 'Padrão Printables',
            pesoGramas: print.weight || 50,
            tempoHoras: 1.5,
            tempoFormatado: '1h 30m',
            filamentos: [{ tipo: 'PLA', corHex: '#ff7700', pesoGramas: print.weight || 50 }],
            plates: []
        }],
        perfilSelecionadoIndex: 0,
        pesoGramas: print.weight || 50,
        tempoHoras: 1.5,
        tempoFormatado: '1h 30m',
        filamentos: [{ tipo: 'PLA', corHex: '#ff7700', pesoGramas: print.weight || 50 }],
        plates: []
    };
}

/**
 * Resolve modelo do Thingiverse
 */
async function resolverThingiverse(urlOriginal) {
    const match = urlOriginal.match(/thing:(\d+)/i) || urlOriginal.match(/thing\/(\d+)/i);
    if (!match) {
        throw new Error('Não foi possível identificar o ID do modelo Thingiverse.');
    }
    const thingId = match[1];

    // Consulta página pública para metadados OpenGraph
    const resp = await fetchHttp(`https://www.thingiverse.com/thing:${thingId}`);
    const html = resp.body || '';

    const ogTitle = html.match(/property="og:title"\s+content="([^"]+)"/i) || html.match(/content="([^"]+)"\s+property="og:title"/i);
    const ogImage = html.match(/property="og:image"\s+content="([^"]+)"/i) || html.match(/content="([^"]+)"\s+property="og:image"/i);
    const ogDesc = html.match(/property="og:description"\s+content="([^"]+)"/i) || html.match(/content="([^"]+)"\s+property="og:description"/i);

    const titulo = ogTitle ? ogTitle[1].replace(/by\s+.*$/i, '').trim() : `Thingiverse #${thingId}`;
    const coverUrl = ogImage ? ogImage[1] : '';
    const descricao = ogDesc ? ogDesc[1] : '';

    return {
        ok: true,
        plataforma: 'thingiverse',
        nomePlataforma: 'Thingiverse',
        idModelo: String(thingId),
        titulo,
        descricao,
        autor: 'Thingiverse Creator',
        avatarAutor: '',
        coverUrl,
        urlOriginal,
        tags: [],
        perfis: [{
            id: thingId,
            titulo: 'Padrão Thingiverse',
            pesoGramas: 50,
            tempoHoras: 1.5,
            tempoFormatado: '1h 30m',
            filamentos: [{ tipo: 'PLA', corHex: '#0088cc', pesoGramas: 50 }],
            plates: []
        }],
        perfilSelecionadoIndex: 0,
        pesoGramas: 50,
        tempoHoras: 1.5,
        tempoFormatado: '1h 30m',
        filamentos: [{ tipo: 'PLA', corHex: '#0088cc', pesoGramas: 50 }],
        plates: []
    };
}

/**
 * Função principal para identificar a plataforma e resolver a URL
 */
async function resolveModelUrl(rawTextOrUrl) {
    const url = extrairUrlDoTexto(rawTextOrUrl);
    if (!url) {
        throw new Error('Nenhuma URL válida informada.');
    }

    const urlLower = url.toLowerCase();

    if (urlLower.includes('makerworld.com') || urlLower.includes('bblmw.com') || urlLower.includes('bambu')) {
        return await resolverMakerWorld(url);
    } else if (urlLower.includes('printables.com')) {
        return await resolverPrintables(url);
    } else if (urlLower.includes('thingiverse.com')) {
        return await resolverThingiverse(url);
    } else {
        // Tentar MakerWorld por padrão se for numérico puro ou link curto
        try {
            return await resolverMakerWorld(url);
        } catch (e) {
            throw new Error(`Plataforma não suportada ou URL não reconhecida. Suportamos MakerWorld (Bambu Handy), Printables e Thingiverse.`);
        }
    }
}

/**
 * Formata segundos em string legível (ex: 2h 15m)
 */
function formatarSegundos(totalSegundos) {
    if (!totalSegundos || totalSegundos <= 0) return '0min';
    const horas = Math.floor(totalSegundos / 3600);
    const minutos = Math.floor((totalSegundos % 3600) / 60);

    if (horas > 0 && minutos > 0) {
        return `${horas}h ${minutos}m`;
    } else if (horas > 0) {
        return `${horas}h`;
    } else {
        return `${minutos}m`;
    }
}

module.exports = {
    resolveModelUrl,
    extrairUrlDoTexto,
    formatarSegundos
};
