/**
 * Serviço de Integração Bambu Lab (MQTT Local / TLS)
 * Conexão direta com impressoras Bambu Lab (X1C, P1S, P1P, A1, A1 mini)
 */

let mqtt = null;
try {
    mqtt = require('mqtt');
} catch (e) {
    console.warn('[bambu-service] Pacote "mqtt" não encontrado ou em carregamento diferido.');
}

class BambuService {
    constructor() {
        this.connections = new Map(); // serial -> { client, config, telemetry, status, lastUpdate }
        this.listeners = new Set();
        this.mockIntervals = new Map();
    }

    /**
     * Normaliza cor hex da Bambu (ex: "00AE42FF" -> "#00AE42")
     */
    normalizeHexColor(hex) {
        if (!hex) return '#06b6d4';
        let clean = String(hex).replace('#', '').trim();
        if (clean.length === 8) {
            clean = clean.substring(0, 6); // remove canal alfa
        }
        return '#' + clean;
    }

    /**
     * Formata minutos restantes em formato legível (ex: "1h 45m")
     */
    formatRemainingTime(minutes) {
        if (minutes == null || minutes < 0) return 'Calculando...';
        const m = parseInt(minutes, 10);
        if (isNaN(m) || m === 0) return '0 min';
        const h = Math.floor(m / 60);
        const rem = m % 60;
        if (h > 0) return `${h}h ${rem}m`;
        return `${rem} min`;
    }

    /**
     * Conecta ou atualiza conexão com uma impressora Bambu Lab
     */
    async connectPrinter(config) {
        const { id, nome, ip, serial, accessCode, useSimulator } = config;

        if (!serial) {
            throw new Error('Serial Number da impressora é obrigatório.');
        }

        // Se já existe uma conexão ativa, encerra antes de reconectar
        if (this.connections.has(serial)) {
            await this.disconnectPrinter(serial);
        }

        if (useSimulator) {
            return this.startSimulator(config);
        }

        if (!ip || !accessCode) {
            throw new Error('IP e Código de Acesso (Access Code) são obrigatórios para conexão real.');
        }

        if (!mqtt) {
            try {
                mqtt = require('mqtt');
            } catch (err) {
                throw new Error('Módulo MQTT não está disponível no ambiente Node.js');
            }
        }

        const cleanIp = String(ip).trim();
        const cleanSerial = String(serial).trim().toUpperCase();
        const cleanAccessCode = String(accessCode).trim();

        const brokerUrl = `mqtts://${cleanIp}:8883`;
        const options = {
            port: 8883,
            host: cleanIp,
            username: 'bblp',
            password: cleanAccessCode,
            protocol: 'mqtts',
            protocolVersion: 4, // CRUCIAL: Bambu Lab requer MQTT 3.1.1 (MQTT 5 causa connack timeout)
            clean: true,
            keepalive: 60,
            rejectUnauthorized: false,
            checkServerIdentity: () => undefined, // Ignora checagem de SAN em certificado autoassinado
            ciphers: 'DEFAULT:@SECLEVEL=0', // Permite handshake TLS com certificado da Bambu no Node 20/22+
            clientId: `3dm_${cleanSerial.substring(0, 6)}_${Math.random().toString(16).substring(2, 6)}`,
            connectTimeout: 8000,
            reconnectPeriod: 5000
        };

        console.log(`[bambu-service] Conectando a ${nome || cleanSerial} em ${brokerUrl} (MQTT 3.1.1)...`);

        return new Promise((resolve, reject) => {
            let resolved = false;

            try {
                const client = mqtt.connect(brokerUrl, options);

                const connRecord = {
                    config,
                    client,
                    status: 'connecting',
                    lastUpdate: new Date(),
                    telemetry: {
                        connected: false,
                        state: 'OFFLINE',
                        percent: 0,
                        remainingMinutes: 0,
                        remainingFormatted: 'Desconectado',
                        layer: 0,
                        totalLayers: 0,
                        nozzleTemp: 0,
                        nozzleTarget: 0,
                        bedTemp: 0,
                        bedTarget: 0,
                        chamberTemp: 0,
                        fileName: '',
                        chamberLight: 'off',
                        speedLevel: 2,
                        ams: [],
                        vtTray: null
                    }
                };

                this.connections.set(serial, connRecord);

                const connectTimeout = setTimeout(() => {
                    if (!resolved) {
                        resolved = true;
                        connRecord.status = 'timeout';
                        resolve({ ok: false, status: 'timeout', message: 'Tempo limite ao conectar à impressora. Verifique IP e rede.' });
                    }
                }, 12000);

                client.on('connect', () => {
                    console.log(`[bambu-service] Conectado com sucesso à Bambu Lab [${serial}]!`);
                    clearTimeout(connectTimeout);
                    connRecord.status = 'connected';
                    connRecord.telemetry.connected = true;

                    // Inscrever no tópico de telemetria
                    const reportTopic = `device/${serial}/report`;
                    client.subscribe(reportTopic, (err) => {
                        if (err) {
                            console.error(`[bambu-service] Erro ao assinar ${reportTopic}:`, err);
                        } else {
                            console.log(`[bambu-service] Assinado no tópico ${reportTopic}`);
                            // Solicita push completo de status
                            this.sendCommand(serial, {
                                pushing: {
                                    sequence_id: '1',
                                    command: 'pushall'
                                }
                            });
                        }
                    });

                    if (!resolved) {
                        resolved = true;
                        resolve({ ok: true, status: 'connected', printer: connRecord.telemetry });
                    }
                });

                client.on('message', (topic, message) => {
                    try {
                        const payload = JSON.parse(message.toString());
                        this.handleTelemetryMessage(serial, payload);
                    } catch (e) {
                        console.error('[bambu-service] Erro ao decodificar JSON do MQTT:', e);
                    }
                });

                client.on('error', (err) => {
                    console.error(`[bambu-service] Erro na conexão [${serial}]:`, err.message);
                    connRecord.status = 'error';
                    connRecord.telemetry.connected = false;
                    if (!resolved) {
                        resolved = true;
                        clearTimeout(connectTimeout);
                        let userMsg = err.message;
                        if (err.message.includes('Not authorized')) {
                            userMsg = 'Código de Acesso (Access Code) incorreto. Confira os 8 dígitos na tela da sua impressora em Configurações ➔ Wi-Fi.';
                        } else if (err.message.includes('Unacceptable protocol version')) {
                            userMsg = 'Versão do protocolo MQTT rejeitada pela impressora.';
                        }
                        resolve({ ok: false, status: 'error', message: userMsg });
                    }
                });

                client.on('close', () => {
                    connRecord.status = 'disconnected';
                    connRecord.telemetry.connected = false;
                });

            } catch (err) {
                console.error('[bambu-service] Falha ao instanciar cliente MQTT:', err);
                if (!resolved) {
                    resolved = true;
                    resolve({ ok: false, status: 'error', message: err.message });
                }
            }
        });
    }

    /**
     * Processa mensagem recebida da impressora e atualiza o estado interno
     */
    handleTelemetryMessage(serial, payload) {
        const conn = this.connections.get(serial);
        if (!conn) return;

        const print = payload?.print || payload;
        if (!print) return;

        const t = conn.telemetry;
        conn.lastUpdate = new Date();

        if (print.gcode_state !== undefined) {
            t.state = print.gcode_state;
        }

        if (print.mc_percent !== undefined) {
            t.percent = parseInt(print.mc_percent, 10) || 0;
        }

        if (print.mc_remaining_time !== undefined) {
            t.remainingMinutes = parseInt(print.mc_remaining_time, 10) || 0;
            t.remainingFormatted = this.formatRemainingTime(t.remainingMinutes);
        }

        if (print.layer_num !== undefined) {
            t.layer = parseInt(print.layer_num, 10) || 0;
        }
        if (print.total_layer_num !== undefined) {
            t.totalLayers = parseInt(print.total_layer_num, 10) || 0;
        }

        if (print.nozzle_temper !== undefined) t.nozzleTemp = Math.round(Number(print.nozzle_temper));
        if (print.nozzle_target_temper !== undefined) t.nozzleTarget = Math.round(Number(print.nozzle_target_temper));

        if (print.bed_temper !== undefined) t.bedTemp = Math.round(Number(print.bed_temper));
        if (print.bed_target_temper !== undefined) t.bedTarget = Math.round(Number(print.bed_target_temper));

        if (print.chamber_temper !== undefined) t.chamberTemp = Math.round(Number(print.chamber_temper));

        if (print.subtask_name) t.fileName = print.subtask_name;
        else if (print.gcode_file) t.fileName = print.gcode_file;

        if (print.spd_lvl !== undefined) t.speedLevel = print.spd_lvl;

        // Luz da câmara
        if (Array.isArray(print.lights_report)) {
            const chamberLight = print.lights_report.find(l => l.node === 'chamber_light');
            if (chamberLight) t.chamberLight = chamberLight.mode;
        }

        // Slots AMS
        if (print.ams && Array.isArray(print.ams.ams)) {
            const amsList = [];
            print.ams.ams.forEach((unit, uIdx) => {
                if (Array.isArray(unit.tray)) {
                    unit.tray.forEach((tray, tIdx) => {
                        const slotLabel = `${String.fromCharCode(65 + uIdx)}${tIdx + 1}`;
                        amsList.push({
                            id: slotLabel,
                            unitId: uIdx,
                            slotIndex: tIdx,
                            color: this.normalizeHexColor(tray.tray_color),
                            type: tray.tray_type || 'PLA',
                            subBrand: tray.tray_sub_brands || '',
                            remain: tray.remain !== undefined ? tray.remain : -1,
                            state: tray.state || 0
                        });
                    });
                }
            });
            if (amsList.length > 0) t.ams = amsList;
        }

        // Carretel externo (Virtual Tray)
        if (print.vt_tray) {
            t.vtTray = {
                color: this.normalizeHexColor(print.vt_tray.tray_color),
                type: print.vt_tray.tray_type || 'PLA',
                remain: print.vt_tray.remain || -1
            };
        }

        this.notifyListeners(serial, t);
    }

    /**
     * Envia comando JSON para o tópico MQTT da impressora
     */
    async sendCommand(serial, commandObj) {
        const conn = this.connections.get(serial);
        if (!conn) {
            throw new Error(`Impressora [${serial}] não encontrada ou desconectada.`);
        }

        if (conn.isSimulator) {
            return this.handleSimulatorCommand(serial, commandObj);
        }

        if (!conn.client || !conn.client.connected) {
            throw new Error(`Impressora [${serial}] não está com conexão MQTT ativa.`);
        }

        const requestTopic = `device/${serial}/request`;
        const payloadStr = JSON.stringify(commandObj);

        return new Promise((resolve, reject) => {
            conn.client.publish(requestTopic, payloadStr, { qos: 0 }, (err) => {
                if (err) {
                    console.error(`[bambu-service] Erro ao enviar comando para ${requestTopic}:`, err);
                    reject(err);
                } else {
                    console.log(`[bambu-service] Comando enviado para ${requestTopic}`);
                    resolve({ ok: true });
                }
            });
        });
    }

    /**
     * Alternar luz da câmara
     */
    async toggleChamberLight(serial, mode) {
        const nextMode = mode || 'on';
        return this.sendCommand(serial, {
            system: {
                sequence_id: '0',
                command: 'ledctrl',
                led_node: 'chamber_light',
                led_mode: nextMode,
                led_on_time: 500,
                led_off_time: 500,
                loop_times: 0,
                interval_time: 0
            }
        });
    }

    /**
     * Inicia simulador para testes e demonstrações
     */
    startSimulator(config) {
        const serial = config.serial || 'SIMULATOR_BAMBU_P1S';

        if (this.mockIntervals.has(serial)) {
            clearInterval(this.mockIntervals.get(serial));
        }

        const connRecord = {
            config,
            isSimulator: true,
            status: 'connected',
            lastUpdate: new Date(),
            telemetry: {
                connected: true,
                isSimulator: true,
                state: 'RUNNING',
                percent: 42,
                remainingMinutes: 68,
                remainingFormatted: '1h 08m',
                layer: 145,
                totalLayers: 320,
                nozzleTemp: 220,
                nozzleTarget: 220,
                bedTemp: 55,
                bedTarget: 55,
                chamberTemp: 34,
                fileName: 'Suporte_Headset_V3.3mf',
                chamberLight: 'on',
                speedLevel: 2,
                ams: [
                    { id: 'A1', unitId: 0, slotIndex: 0, color: '#06b6d4', type: 'PLA Basic', subBrand: 'Bambu Lab Cyan', remain: 78 },
                    { id: 'A2', unitId: 0, slotIndex: 1, color: '#10b981', type: 'PLA Matte', subBrand: 'Verde Floresta', remain: 52 },
                    { id: 'A3', unitId: 0, slotIndex: 2, color: '#f59e0b', type: 'PETG Basic', subBrand: 'Laranja Solar', remain: 90 },
                    { id: 'A4', unitId: 0, slotIndex: 3, color: '#1e293b', type: 'PLA CF', subBrand: 'Preto Carbono', remain: 30 }
                ],
                vtTray: null
            }
        };

        this.connections.set(serial, connRecord);

        const interval = setInterval(() => {
            const t = connRecord.telemetry;
            if (t.state === 'RUNNING') {
                t.percent = (t.percent + 1);
                t.layer = Math.min(t.totalLayers, t.layer + 1);
                t.remainingMinutes = Math.max(1, t.remainingMinutes - 1);
                t.remainingFormatted = this.formatRemainingTime(t.remainingMinutes);
                t.nozzleTemp = 219 + Math.floor(Math.random() * 3);
                t.bedTemp = 55 + (Math.random() > 0.5 ? 0 : 1);

                if (t.percent >= 100) {
                    t.state = 'FINISH';
                    t.percent = 100;
                    t.remainingMinutes = 0;
                    t.remainingFormatted = 'Concluído';
                }
            }
            connRecord.lastUpdate = new Date();
            this.notifyListeners(serial, t);
        }, 4000);

        this.mockIntervals.set(serial, interval);
        return { ok: true, status: 'connected', isSimulator: true, printer: connRecord.telemetry };
    }

    handleSimulatorCommand(serial, cmd) {
        const conn = this.connections.get(serial);
        if (!conn) return { ok: false };
        if (cmd?.system?.command === 'ledctrl') {
            conn.telemetry.chamberLight = cmd.system.led_mode === 'on' ? 'on' : 'off';
        }
        if (cmd?.print?.command === 'pause') conn.telemetry.state = 'PAUSE';
        if (cmd?.print?.command === 'resume') conn.telemetry.state = 'RUNNING';
        return { ok: true };
    }

    /**
     * Encerra conexão de uma impressora
     */
    async disconnectPrinter(serial) {
        if (this.mockIntervals.has(serial)) {
            clearInterval(this.mockIntervals.get(serial));
            this.mockIntervals.delete(serial);
        }

        const conn = this.connections.get(serial);
        if (conn && conn.client) {
            try {
                conn.client.end(true);
            } catch (_) {}
        }

        this.connections.delete(serial);
        return { ok: true };
    }

    /**
     * Retorna telemetria de uma impressora
     */
    getStatus(serial) {
        const conn = this.connections.get(serial);
        if (!conn) {
            return {
                connected: false,
                state: 'OFFLINE',
                message: 'Impressora não conectada'
            };
        }
        return {
            status: conn.status,
            lastUpdate: conn.lastUpdate,
            ...conn.telemetry
        };
    }

    /**
     * Retorna lista de todas as impressoras ativas
     */
    getAllPrinters() {
        const list = [];
        this.connections.forEach((conn, serial) => {
            list.push({
                serial,
                nome: conn.config.nome || serial,
                ip: conn.config.ip,
                status: conn.status,
                isSimulator: !!conn.isSimulator,
                telemetry: conn.telemetry,
                lastUpdate: conn.lastUpdate
            });
        });
        return list;
    }

    notifyListeners(serial, telemetry) {
        this.listeners.forEach(fn => {
            try {
                fn(serial, telemetry);
            } catch (_) {}
        });
    }
}

module.exports = new BambuService();
