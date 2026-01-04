/**
 * WebTransportManager.ts
 * Manages WebTransport connections to the Deno WebTransport server.
 * Provides lower latency and better congestion control compared to WebSocket/WebRTC for certain use cases.
 */

// Simple Event Emitter (same as WebRTCManager)
type EventCallback = (...args: any[]) => void;

class SimpleEventEmitter {
    private events: Map<string, EventCallback[]> = new Map();

    on(event: string, callback: EventCallback): this {
        if (!this.events.has(event)) {
            this.events.set(event, []);
        }
        this.events.get(event)!.push(callback);
        return this;
    }

    emit(event: string, ...args: any[]): boolean {
        const callbacks = this.events.get(event);
        if (callbacks) {
            callbacks.forEach(cb => cb(...args));
            return true;
        }
        return false;
    }

    removeAllListeners(event?: string): this {
        if (event) {
            this.events.delete(event);
        } else {
            this.events.clear();
        }
        return this;
    }
}

export class WebTransportManager extends SimpleEventEmitter {
    private transport: WebTransport | null = null;
    private serverUrl: string;
    private isConnected: boolean = false;
    private datagramWriter: WritableStreamDefaultWriter<Uint8Array> | null = null;
    private datagramReader: ReadableStreamDefaultReader<Uint8Array> | null = null;

    constructor(serverUrl: string = 'https://localhost:4433') {
        super();
        this.serverUrl = serverUrl;
    }

    /**
     * Connect to the WebTransport server.
     */
    async connect(): Promise<void> {
        if (this.transport) {
            console.warn('[WebTransportManager] Already connected or connecting.');
            return;
        }

        console.log(`[WebTransportManager] Connecting to ${this.serverUrl}...`);
        this.emit('connecting');

        try {
            // For self-signed certs in browsers, serverCertificateHashes can be used.
            // In Electron, we might need other approaches or bypass.
            this.transport = new WebTransport(this.serverUrl);

            await this.transport.ready;
            this.isConnected = true;
            console.log('[WebTransportManager] Connected!');
            this.emit('connected');

            // Setup datagram handlers
            this.datagramWriter = this.transport.datagrams.writable.getWriter();
            this.datagramReader = this.transport.datagrams.readable.getReader();
            this.listenForDatagrams();

            // Listen for session close
            this.transport.closed.then(() => {
                console.log('[WebTransportManager] Session closed.');
                this.handleClose();
            }).catch((err) => {
                console.error('[WebTransportManager] Session closed with error:', err);
                this.handleClose();
            });

        } catch (err) {
            console.error('[WebTransportManager] Connection failed:', err);
            this.emit('error', err);
            this.transport = null;
            throw err;
        }
    }

    /**
     * Listen for incoming datagrams.
     */
    private async listenForDatagrams(): Promise<void> {
        if (!this.datagramReader) return;

        try {
            while (true) {
                const { value, done } = await this.datagramReader.read();
                if (done) break;
                this.emit('datagram', value);
            }
        } catch (err) {
            console.warn('[WebTransportManager] Datagram read error:', err);
        }
    }

    /**
     * Send a datagram (unreliable, low-latency).
     * Ideal for mouse/keyboard input events.
     */
    async sendDatagram(data: Uint8Array): Promise<void> {
        if (!this.datagramWriter || !this.isConnected) {
            console.warn('[WebTransportManager] Cannot send datagram: not connected.');
            return;
        }
        await this.datagramWriter.write(data);
    }

    /**
     * Open a bidirectional stream for reliable data transfer.
     * @returns An object with reader and writer for the stream.
     */
    async openBidirectionalStream(): Promise<{
        reader: ReadableStreamDefaultReader<Uint8Array>;
        writer: WritableStreamDefaultWriter<Uint8Array>;
    } | null> {
        if (!this.transport || !this.isConnected) {
            console.warn('[WebTransportManager] Cannot open stream: not connected.');
            return null;
        }

        const stream = await this.transport.createBidirectionalStream();
        return {
            reader: stream.readable.getReader(),
            writer: stream.writable.getWriter(),
        };
    }

    /**
     * Close the WebTransport connection.
     */
    close(): void {
        if (this.transport) {
            this.transport.close();
            this.handleClose();
        }
    }

    private handleClose(): void {
        this.isConnected = false;
        this.transport = null;
        this.datagramWriter = null;
        this.datagramReader = null;
        this.emit('closed');
        this.removeAllListeners();
    }

    /**
     * Check if connected.
     */
    get connected(): boolean {
        return this.isConnected;
    }
}

export default WebTransportManager;
