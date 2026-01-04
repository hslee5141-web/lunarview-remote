/**
 * VideoDecoderManager.ts
 * Uses the WebCodecs API to decode encoded video frames.
 * Outputs decoded VideoFrames for rendering to a canvas.
 */

export type DecodedFrameCallback = (frame: VideoFrame) => void;

export interface VideoDecoderConfig {
    codec: string; // e.g., 'vp09.00.10.08', 'avc1.42001E', 'av01.0.08M.08'
    codedWidth: number;
    codedHeight: number;
}

export class VideoDecoderManager {
    private decoder: VideoDecoder | null = null;
    private onFrame: DecodedFrameCallback;
    private isConfigured: boolean = false;

    constructor(onFrame: DecodedFrameCallback) {
        this.onFrame = onFrame;
    }

    /**
     * Configure the decoder with the given codec and dimensions.
     */
    async configure(config: VideoDecoderConfig): Promise<void> {
        if (this.decoder) {
            this.decoder.close();
        }

        this.decoder = new VideoDecoder({
            output: (frame) => {
                this.onFrame(frame);
                // IMPORTANT: The callback must close the frame after rendering.
            },
            error: (err) => {
                console.error('[VideoDecoderManager] Decode error:', err);
            },
        });

        this.decoder.configure({
            codec: config.codec,
            codedWidth: config.codedWidth,
            codedHeight: config.codedHeight,
            // hardwareAcceleration: 'prefer-hardware', // Enable if supported
        });

        this.isConfigured = true;
        console.log('[VideoDecoderManager] Configured with codec:', config.codec);
    }

    /**
     * Decode an encoded video chunk.
     * @param data - The encoded video data (Uint8Array).
     * @param timestamp - Presentation timestamp in microseconds.
     * @param isKeyFrame - Whether this chunk is a keyframe.
     */
    decode(data: Uint8Array, timestamp: number, isKeyFrame: boolean): void {
        if (!this.decoder || !this.isConfigured) {
            console.warn('[VideoDecoderManager] Decoder not configured.');
            return;
        }

        const chunk = new EncodedVideoChunk({
            type: isKeyFrame ? 'key' : 'delta',
            timestamp,
            data,
        });

        this.decoder.decode(chunk);
    }

    /**
     * Flush pending frames and close the decoder.
     */
    async close(): Promise<void> {
        if (this.decoder) {
            await this.decoder.flush();
            this.decoder.close();
            this.decoder = null;
            this.isConfigured = false;
            console.log('[VideoDecoderManager] Closed.');
        }
    }

    /**
     * Check if VideoDecoder API is supported.
     */
    static isSupported(): boolean {
        return typeof VideoDecoder !== 'undefined';
    }
}

export default VideoDecoderManager;
