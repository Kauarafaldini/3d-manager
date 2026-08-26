/**
 * 3D Manager Pro — Slicer Parser (.3MF e .GCODE)
 * Extração de metadados de Bambu Studio, OrcaSlicer, PrusaSlicer e Cura
 * Sem dependências externas — usa DecompressionStream nativo para ler arquivos PKZIP (.3mf)
 */

(function () {
    class SlicerParser {
        /**
         * Analisa um arquivo (.3mf ou .gcode)
         * @param {File} file
         * @returns {Promise<Object>}
         */
        async parseFile(file) {
            const ext = file.name.split('.').pop().toLowerCase();

            if (ext === '3mf') {
                return this.parse3MF(file);
            } else if (ext === 'gcode' || ext === 'gco' || ext === 'g') {
                return this.parseGCode(file);
            } else {
                throw new Error(`Formato .${ext} não suportado. Use arquivos .3mf ou .gcode.`);
            }
        }

        /**
         * Descompacta e lê arquivos internos de um arquivo .3mf (PKZIP)
         */
        async parse3MF(file) {
            const buffer = await file.arrayBuffer();
            const entries = await this.readZipEntries(new Uint8Array(buffer));

            const result = {
                fileName: file.name.replace(/\.[^/.]+$/, "").replace(/_/g, " "),
                rawFileName: file.name,
                source: '3mf',
                estimatedSeconds: 0,
                hours: 0,
                minutes: 0,
                totalWeightGrams: 0,
                flushWeightGrams: 0,
                filaments: [],
                platesCount: 1,
                instancesCount: 1
            };

            // 1. Procurar por Metadata/slice_info.config (Bambu Studio / OrcaSlicer)
            const sliceInfoEntry = entries.find(e => e.name.toLowerCase().includes('slice_info.config'));
            if (sliceInfoEntry) {
                const text = await this.extractEntryText(sliceInfoEntry, buffer);
                this.parseSliceInfoConfig(text, result);
            }

            // 2. Procurar por Metadata/model_settings.config
            const modelSettingsEntry = entries.find(e => e.name.toLowerCase().includes('model_settings.config'));
            if (modelSettingsEntry) {
                const text = await this.extractEntryText(modelSettingsEntry, buffer);
                this.parseModelSettingsConfig(text, result);
            }

            // 3. Procurar por arquivos G-code embutidos (ex: Metadata/plate_1.gcode) se o tempo ainda não foi encontrado
            if (!result.estimatedSeconds || result.filaments.length === 0) {
                const gcodeEntry = entries.find(e => e.name.toLowerCase().endsWith('.gcode'));
                if (gcodeEntry) {
                    const text = await this.extractEntryText(gcodeEntry, buffer);
                    this.parseGCodeText(text, result);
                }
            }

            this.normalizeTimeAndWeights(result);
            return result;
        }

        /**
         * Extrai dados de um arquivo .gcode puro
         */
        async parseGCode(file) {
            const text = await file.text();
            const result = {
                fileName: file.name.replace(/\.[^/.]+$/, "").replace(/_/g, " "),
                rawFileName: file.name,
                source: 'gcode',
                estimatedSeconds: 0,
                hours: 0,
                minutes: 0,
                totalWeightGrams: 0,
                flushWeightGrams: 0,
                filaments: [],
                platesCount: 1,
                instancesCount: 1
            };

            this.parseGCodeText(text, result);
            this.normalizeTimeAndWeights(result);
            return result;
        }

        /**
         * Parser de XML/Config de slice_info.config da Bambu/Orca
         */
        parseSliceInfoConfig(xmlText, result) {
            try {
                const parser = new DOMParser();
                const xmlDoc = parser.parseFromString(xmlText, "text/xml");

                // Tempo estimado na tag <header> <prediction value="8130" />
                const predictionEl = xmlDoc.querySelector('header > prediction, prediction');
                if (predictionEl) {
                    const val = parseInt(predictionEl.getAttribute('value') || predictionEl.textContent, 10);
                    if (val > 0) result.estimatedSeconds = val;
                }

                // Peso total na tag <header> <weight value="54.2" />
                const weightEl = xmlDoc.querySelector('header > weight, weight');
                if (weightEl) {
                    const val = parseFloat(weightEl.getAttribute('value') || weightEl.textContent);
                    if (val > 0) result.totalWeightGrams = val;
                }

                // Filamentos na primeira chapa ativa ou em todas
                const plateEl = xmlDoc.querySelector('plate[active="true"], plate');
                const searchScope = plateEl || xmlDoc;

                const filamentEls = searchScope.querySelectorAll('filament');
                if (filamentEls.length > 0) {
                    result.filaments = [];
                    filamentEls.forEach((fel, idx) => {
                        const id = fel.getAttribute('id') || `${idx + 1}`;
                        const type = fel.getAttribute('type') || 'PLA';
                        let color = fel.getAttribute('color') || '#06b6d4';
                        if (color && !color.startsWith('#')) color = '#' + color;
                        if (color.length === 9) color = color.substring(0, 7); // remove alpha

                        const usedG = parseFloat(fel.getAttribute('used_g') || fel.getAttribute('weight') || '0');
                        const usedM = parseFloat(fel.getAttribute('used_m') || fel.getAttribute('length') || '0');

                        if (usedG > 0 || usedM > 0) {
                            result.filaments.push({
                                slot: id,
                                type: type,
                                color: color,
                                weightGrams: Math.round(usedG * 100) / 100,
                                usedMeters: Math.round(usedM * 100) / 100
                            });
                        }
                    });
                }

                // Purga / Flush
                const flushEl = searchScope.querySelector('flush_weight, flush');
                if (flushEl) {
                    const flushVal = parseFloat(flushEl.getAttribute('value') || flushEl.textContent);
                    if (flushVal > 0) result.flushWeightGrams = flushVal;
                }

            } catch (e) {
                console.warn('[slicer-parser] Erro ao analisar XML de slice_info.config, tentando regex:', e);
                this.fallbackRegexParse(xmlText, result);
            }
        }

        fallbackRegexParse(text, result) {
            const timeMatch = text.match(/prediction\s*value="(\d+)"/i) || text.match(/<prediction>(\d+)<\/prediction>/i);
            if (timeMatch) result.estimatedSeconds = parseInt(timeMatch[1], 10);

            const weightMatch = text.match(/weight\s*value="([\d.]+)"/i) || text.match(/<weight>([\d.]+)<\/weight>/i);
            if (weightMatch) result.totalWeightGrams = parseFloat(weightMatch[1]);
        }

        parseModelSettingsConfig(text, result) {
            // Contagem de instâncias / peças na mesa
            const instancesMatches = text.match(/<instance>/g);
            if (instancesMatches && instancesMatches.length > 1) {
                result.instancesCount = instancesMatches.length;
            }
        }

        /**
         * Parser de comentários de GCode
         */
        parseGCodeText(text, result) {
            // Bambu / Orca / Prusa: ; estimated printing time (normal mode) = 2h 15m 30s
            const timeStrMatch = text.match(/;\s*estimated printing time(?:\s*\([^)]*\))?\s*=\s*([^\r\n]+)/i) ||
                                 text.match(/;\s*TIME:(\d+)/i) ||
                                 text.match(/;\s*Print time:\s*([^\r\n]+)/i);

            if (timeStrMatch) {
                if (timeStrMatch[0].includes('TIME:')) {
                    result.estimatedSeconds = parseInt(timeStrMatch[1], 10);
                } else {
                    result.estimatedSeconds = this.parseTimeStringToSeconds(timeStrMatch[1]);
                }
            }

            // Filamentos usados em gramas: ; filament used [g] = 42.5, 12.3
            const filamentWeightMatch = text.match(/;\s*(?:total\s+)?filament used \[g\]\s*=\s*([^\r\n]+)/i);
            if (filamentWeightMatch) {
                const weights = filamentWeightMatch[1].split(',').map(s => parseFloat(s.trim())).filter(n => !isNaN(n) && n > 0);
                if (weights.length > 0) {
                    result.filaments = weights.map((w, idx) => ({
                        slot: `${idx + 1}`,
                        type: 'PLA',
                        color: '#06b6d4',
                        weightGrams: Math.round(w * 100) / 100
                    }));
                    result.totalWeightGrams = weights.reduce((a, b) => a + b, 0);
                }
            }

            // Tipos de filamento: ; filament_type = PLA;PETG
            const filamentTypesMatch = text.match(/;\s*filament_type\s*=\s*([^\r\n]+)/i);
            if (filamentTypesMatch && result.filaments.length > 0) {
                const types = filamentTypesMatch[1].split(/[,;]/).map(s => s.trim());
                result.filaments.forEach((f, idx) => {
                    if (types[idx]) f.type = types[idx];
                });
            }

            // Cores: ; filament_colour = #00AE42;#FF0000
            const filamentColorsMatch = text.match(/;\s*filament_colour\s*=\s*([^\r\n]+)/i);
            if (filamentColorsMatch && result.filaments.length > 0) {
                const colors = filamentColorsMatch[1].split(/[,;]/).map(s => s.trim());
                result.filaments.forEach((f, idx) => {
                    if (colors[idx]) {
                        let c = colors[idx];
                        if (!c.startsWith('#')) c = '#' + c;
                        f.color = c.substring(0, 7);
                    }
                });
            }
        }

        parseTimeStringToSeconds(str) {
            let total = 0;
            const days = str.match(/(\d+)\s*d/i);
            const hours = str.match(/(\d+)\s*h/i);
            const mins = str.match(/(\d+)\s*m/i);
            const secs = str.match(/(\d+)\s*s/i);

            if (days) total += parseInt(days[1], 10) * 86400;
            if (hours) total += parseInt(hours[1], 10) * 3600;
            if (mins) total += parseInt(mins[1], 10) * 60;
            if (secs) total += parseInt(secs[1], 10);

            // Formato HH:MM:SS
            if (!days && !hours && !mins && !secs) {
                const parts = str.trim().split(':').map(n => parseInt(n, 10));
                if (parts.length === 3) {
                    total = parts[0] * 3600 + parts[1] * 60 + parts[2];
                } else if (parts.length === 2) {
                    total = parts[0] * 60 + parts[1];
                }
            }

            return total;
        }

        normalizeTimeAndWeights(result) {
            if (result.estimatedSeconds > 0) {
                result.hours = Math.floor(result.estimatedSeconds / 3600);
                result.minutes = Math.round((result.estimatedSeconds % 3600) / 60);
                if (result.minutes === 60) {
                    result.hours += 1;
                    result.minutes = 0;
                }
            }

            if (result.filaments.length === 0 && result.totalWeightGrams > 0) {
                result.filaments.push({
                    slot: '1',
                    type: 'PLA',
                    color: '#06b6d4',
                    weightGrams: Math.round(result.totalWeightGrams * 100) / 100
                });
            }

            if (result.filaments.length > 0 && !result.totalWeightGrams) {
                result.totalWeightGrams = Math.round(result.filaments.reduce((acc, f) => acc + (f.weightGrams || 0), 0) * 100) / 100;
            }
        }

        /**
         * Leitor de PKZIP nativo sem dependências
         */
        async readZipEntries(uint8) {
            const entries = [];
            const dataView = new DataView(uint8.buffer, uint8.byteOffset, uint8.byteLength);
            let offset = 0;

            while (offset < uint8.length - 30) {
                const sig = dataView.getUint32(offset, true);
                if (sig === 0x04034b50) { // Local File Header
                    const method = dataView.getUint16(offset + 8, true);
                    const compSize = dataView.getUint32(offset + 18, true);
                    const uncompSize = dataView.getUint32(offset + 22, true);
                    const nameLen = dataView.getUint16(offset + 26, true);
                    const extraLen = dataView.getUint16(offset + 28, true);

                    const nameBytes = uint8.slice(offset + 30, offset + 30 + nameLen);
                    const name = new TextDecoder().decode(nameBytes);

                    const dataOffset = offset + 30 + nameLen + extraLen;
                    const compressedData = uint8.slice(dataOffset, dataOffset + compSize);

                    entries.push({
                        name,
                        method,
                        compSize,
                        uncompSize,
                        compressedData
                    });

                    offset = dataOffset + compSize;
                } else if (sig === 0x02014b50) { // Central directory
                    break;
                } else {
                    offset++;
                }
            }

            return entries;
        }

        async extractEntryText(entry, fullBuffer) {
            if (entry.method === 0) { // Uncompressed (Stored)
                return new TextDecoder().decode(entry.compressedData);
            }

            if (entry.method === 8) { // Deflated
                if (typeof DecompressionStream !== 'undefined') {
                    try {
                        const ds = new DecompressionStream('deflate-raw');
                        const writer = ds.writable.getWriter();
                        writer.write(entry.compressedData);
                        writer.close();

                        const reader = ds.readable.getReader();
                        const chunks = [];
                        let totalLen = 0;
                        while (true) {
                            const { done, value } = await reader.read();
                            if (done) break;
                            chunks.push(value);
                            totalLen += value.length;
                        }
                        const merged = new Uint8Array(totalLen);
                        let ptr = 0;
                        for (const chunk of chunks) {
                            merged.set(chunk, ptr);
                            ptr += chunk.length;
                        }
                        return new TextDecoder().decode(merged);
                    } catch (e) {
                        console.warn('[slicer-parser] Falha na descompressão nativa:', e);
                    }
                }

                // Fallback JSZip se carregado
                if (window.JSZip) {
                    const zip = await window.JSZip.loadAsync(fullBuffer);
                    const file = zip.file(entry.name);
                    if (file) return file.async("text");
                }
            }

            return '';
        }

        /**
         * Aplica os dados fatiados diretamente no formulário da Calculadora de Preços
         */
        aplicarNaCalculadora(data) {
            // Nome
            const nomeInput = document.getElementById('pNome');
            if (nomeInput && data.fileName) {
                nomeInput.value = data.fileName;
            }

            // Tempo
            const horasInput = document.getElementById('pTempoHoras');
            const minsInput = document.getElementById('pTempoMinutos');
            if (horasInput) horasInput.value = data.hours || 0;
            if (minsInput) minsInput.value = data.minutes || 0;
            if (typeof onTempoInput === 'function') onTempoInput();

            // Quantidade por chapa
            const qtdChapaInput = document.getElementById('pQuantidadeChapa');
            if (qtdChapaInput && data.instancesCount > 1) {
                qtdChapaInput.value = data.instancesCount;
            }

            // Filamentos
            const container = document.getElementById('container-filamentos-linhas');
            if (container && data.filaments && data.filaments.length > 0) {
                container.innerHTML = ''; // Limpa linhas anteriores

                data.filaments.forEach(f => {
                    // Tentar encontrar filamento correspondente no estoque (por tipo/cor/nome)
                    let matchedEstoqueId = null;
                    if (window.estoqueCache && Array.isArray(window.estoqueCache)) {
                        const match = window.estoqueCache.find(e => {
                            const nomeLower = (e.nome || '').toLowerCase();
                            const typeLower = (f.type || '').toLowerCase();
                            return nomeLower.includes(typeLower);
                        });
                        if (match) matchedEstoqueId = match._id || match.id;
                    }

                    if (typeof adicionarLinhaFilamento === 'function') {
                        adicionarLinhaFilamento({
                            peso: f.weightGrams,
                            precoKg: null,
                            estoqueId: matchedEstoqueId
                        });
                    }
                });
            }

            if (typeof calcFinanceiro === 'function') {
                calcFinanceiro(false);
            }

            // Exibir toast com detalhes
            const numCores = data.filaments.length;
            const msg = `✨ Fatiamento importado: ${data.fileName} (${numCores} ${numCores > 1 ? 'filamentos' : 'filamento'}, ${data.totalWeightGrams}g, ${data.hours}h ${data.minutes}m)`;
            if (typeof mostrarToast === 'function') {
                mostrarToast(msg, 'ok');
            } else {
                alert(msg);
            }
        }
    }

    window.SlicerParser = new SlicerParser();
})();
