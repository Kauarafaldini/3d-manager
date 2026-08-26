/**
 * 3D Manager Pro — Conector Unificado de Impressoras 3D
 * Suporte a:
 * - Bambu Lab (MQTT Local TLS)
 * - Klipper / Moonraker (HTTP REST / WebSocket)
 * - OctoPrint (HTTP REST API)
 * - Automação da Fila de Produção ao finalizar impressão
 */

const bambuService = require('./bambu-service');

class UnifiedPrinterConnector {
    constructor() {
        this.klipperConnections = new Map(); // printerId -> { config, telemetry, timer }
        this.octoConnections = new Map(); // printerId -> { config, telemetry, timer }
        this.onPrintFinishCallback = null;

        // Escuta conclusão na Bambu Lab
        bambuService.listeners.add((serial, telemetry) => {
            if (telemetry.state === 'FINISH' && telemetry.percent >= 100) {
                this.handlePrintFinished('bambu', serial, telemetry);
            }
        });
    }

    setFinishCallback(callback) {
        this.onPrintFinishCallback = callback;
    }

    async handlePrintFinished(protocol, identifier, telemetry) {
        console.log(`[printer-connector] Impressão finalizada via ${protocol} [${identifier}]!`);
        if (typeof this.onPrintFinishCallback === 'function') {
            try {
                await this.onPrintFinishCallback(protocol, identifier, telemetry);
            } catch (err) {
                console.error('[printer-connector] Erro no callback de conclusão de impressão:', err);
            }
        }
    }

    // ==========================================
    // KLIPPER / MOONRAKER CONNECTOR
    // ==========================================
    async connectKlipper(printerConfig) {
        const { id, nome, ip, port = 7125 } = printerConfig;
        if (!ip) throw new Error('IP da impressora Klipper/Moonraker é obrigatório.');

        const printerId = String(id || ip);
        this.disconnectKlipper(printerId);

        const baseUrl = `http://${ip}:${port}`;
        console.log(`[printer-connector] Conectando a Klipper (${nome || ip}) em ${baseUrl}...`);

        const record = {
            id: printerId,
            config: printerConfig,
            baseUrl,
            telemetry: {
                connected: false,
                protocol: 'klipper',
                state: 'OFFLINE',
                percent: 0,
                remainingMinutes: 0,
                remainingFormatted: '--',
                layer: 0,
                totalLayers: 0,
                nozzleTemp: 0,
                nozzleTarget: 0,
                bedTemp: 0,
                bedTarget: 0,
                fileName: ''
            }
        };

        this.klipperConnections.set(printerId, record);

        // Polling de telemetria a cada 3 segundos
        const timer = setInterval(async () => {
            await this.pollKlipper(printerId);
        }, 3000);

        record.timer = timer;
        await this.pollKlipper(printerId);

        return { ok: true, status: record.telemetry.connected ? 'connected' : 'connecting', printer: record.telemetry };
    }

    async pollKlipper(printerId) {
        const record = this.klipperConnections.get(printerId);
        if (!record) return;

        try {
            const res = await fetch(`${record.baseUrl}/printer/objects/query?print_stats&display_status&extruder&heater_bed`, {
                signal: AbortSignal.timeout(4000)
            });

            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            const status = data?.result?.status || {};

            const t = record.telemetry;
            t.connected = true;

            const printStats = status.print_stats || {};
            const displayStatus = status.display_status || {};
            const extruder = status.extruder || {};
            const heaterBed = status.heater_bed || {};

            const klipperState = (printStats.state || 'standby').toLowerCase();
            const prevState = t.state;

            if (klipperState === 'printing') t.state = 'RUNNING';
            else if (klipperState === 'paused') t.state = 'PAUSE';
            else if (klipperState === 'complete') t.state = 'FINISH';
            else if (klipperState === 'error') t.state = 'FAILED';
            else t.state = 'IDLE';

            t.percent = Math.round((displayStatus.progress || 0) * 100);
            t.fileName = printStats.filename || '';

            const printDuration = printStats.print_duration || 0;
            const totalDuration = printStats.total_duration || 0;
            if (t.percent > 0 && t.percent < 100 && printDuration > 0) {
                const totalEstimatedSec = (printDuration / (t.percent / 100));
                const remainingSec = Math.max(0, totalEstimatedSec - printDuration);
                t.remainingMinutes = Math.round(remainingSec / 60);
                const h = Math.floor(t.remainingMinutes / 60);
                const m = t.remainingMinutes % 60;
                t.remainingFormatted = h > 0 ? `${h}h ${m}m` : `${m} min`;
            } else if (t.percent >= 100) {
                t.remainingMinutes = 0;
                t.remainingFormatted = 'Concluído';
            }

            t.nozzleTemp = Math.round(extruder.temperature || 0);
            t.nozzleTarget = Math.round(extruder.target || 0);
            t.bedTemp = Math.round(heaterBed.temperature || 0);
            t.bedTarget = Math.round(heaterBed.target || 0);

            // Detecta transição para FINISH
            if (prevState === 'RUNNING' && (t.state === 'FINISH' || t.percent >= 100)) {
                this.handlePrintFinished('klipper', printerId, t);
            }
        } catch (err) {
            record.telemetry.connected = false;
            record.telemetry.state = 'OFFLINE';
        }
    }

    disconnectKlipper(printerId) {
        const record = this.klipperConnections.get(printerId);
        if (record && record.timer) {
            clearInterval(record.timer);
        }
        this.klipperConnections.delete(printerId);
        return { ok: true };
    }

    // ==========================================
    // OCTOPRINT CONNECTOR
    // ==========================================
    async connectOctoPrint(printerConfig) {
        const { id, nome, ip, port = 5000, apiKey } = printerConfig;
        if (!ip) throw new Error('IP do OctoPrint é obrigatório.');

        const printerId = String(id || ip);
        this.disconnectOctoPrint(printerId);

        const baseUrl = `http://${ip}:${port}`;
        console.log(`[printer-connector] Conectando a OctoPrint (${nome || ip}) em ${baseUrl}...`);

        const record = {
            id: printerId,
            config: printerConfig,
            baseUrl,
            apiKey: apiKey || '',
            telemetry: {
                connected: false,
                protocol: 'octoprint',
                state: 'OFFLINE',
                percent: 0,
                remainingMinutes: 0,
                remainingFormatted: '--',
                layer: 0,
                totalLayers: 0,
                nozzleTemp: 0,
                nozzleTarget: 0,
                bedTemp: 0,
                bedTarget: 0,
                fileName: ''
            }
        };

        this.octoConnections.set(printerId, record);

        const timer = setInterval(async () => {
            await this.pollOctoPrint(printerId);
        }, 3000);

        record.timer = timer;
        await this.pollOctoPrint(printerId);

        return { ok: true, status: record.telemetry.connected ? 'connected' : 'connecting', printer: record.telemetry };
    }

    async pollOctoPrint(printerId) {
        const record = this.octoConnections.get(printerId);
        if (!record) return;

        try {
            const headers = record.apiKey ? { 'X-Api-Key': record.apiKey } : {};
            const [jobRes, printerRes] = await Promise.all([
                fetch(`${record.baseUrl}/api/job`, { headers, signal: AbortSignal.timeout(4000) }),
                fetch(`${record.baseUrl}/api/printer`, { headers, signal: AbortSignal.timeout(4000) })
            ]);

            if (!jobRes.ok) throw new Error(`HTTP ${jobRes.status}`);

            const jobData = await jobRes.json();
            const printerData = printerRes.ok ? await printerRes.json() : {};

            const t = record.telemetry;
            t.connected = true;

            const stateStr = (jobData?.state || '').toLowerCase();
            const prevState = t.state;

            if (stateStr.includes('printing')) t.state = 'RUNNING';
            else if (stateStr.includes('paused')) t.state = 'PAUSE';
            else if (stateStr.includes('operational')) t.state = 'IDLE';
            else if (stateStr.includes('finish') || stateStr.includes('complete')) t.state = 'FINISH';
            else t.state = 'IDLE';

            const progress = jobData?.progress || {};
            t.percent = Math.round(progress.completion || 0);
            t.fileName = jobData?.job?.file?.name || '';

            const printTimeLeft = progress.printTimeLeft || 0;
            if (printTimeLeft > 0) {
                t.remainingMinutes = Math.round(printTimeLeft / 60);
                const h = Math.floor(t.remainingMinutes / 60);
                const m = t.remainingMinutes % 60;
                t.remainingFormatted = h > 0 ? `${h}h ${m}m` : `${m} min`;
            } else if (t.percent >= 100) {
                t.remainingMinutes = 0;
                t.remainingFormatted = 'Concluído';
            }

            const tool0 = printerData?.temperature?.tool0;
            const bed = printerData?.temperature?.bed;
            if (tool0) {
                t.nozzleTemp = Math.round(tool0.actual || 0);
                t.nozzleTarget = Math.round(tool0.target || 0);
            }
            if (bed) {
                t.bedTemp = Math.round(bed.actual || 0);
                t.bedTarget = Math.round(bed.target || 0);
            }

            if (prevState === 'RUNNING' && (t.state === 'FINISH' || t.percent >= 100)) {
                this.handlePrintFinished('octoprint', printerId, t);
            }
        } catch (err) {
            record.telemetry.connected = false;
            record.telemetry.state = 'OFFLINE';
        }
    }

    disconnectOctoPrint(printerId) {
        const record = this.octoConnections.get(printerId);
        if (record && record.timer) {
            clearInterval(record.timer);
        }
        this.octoConnections.delete(printerId);
        return { ok: true };
    }

    // ==========================================
    // GET STATUS FOR ANY PRINTER
    // ==========================================
    getPrinterStatus(idOrSerial) {
        // Verifica Bambu
        const bambu = bambuService.getStatus(idOrSerial);
        if (bambu && bambu.connected) {
            return { protocol: 'bambu', ...bambu };
        }

        // Verifica Klipper
        const klipper = this.klipperConnections.get(String(idOrSerial));
        if (klipper) {
            return { protocol: 'klipper', ...klipper.telemetry };
        }

        // Verifica OctoPrint
        const octo = this.octoConnections.get(String(idOrSerial));
        if (octo) {
            return { protocol: 'octoprint', ...octo.telemetry };
        }

        return {
            connected: false,
            state: 'OFFLINE',
            message: 'Impressora não conectada'
        };
    }
}

module.exports = new UnifiedPrinterConnector();
