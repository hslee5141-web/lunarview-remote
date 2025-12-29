import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
    main: {
        build: {
            rollupOptions: {
                input: {
                    index: path.resolve(__dirname, 'src/main/index.ts'),
                },
            },
        },
    },
    preload: {
        build: {
            rollupOptions: {
                input: {
                    preload: path.resolve(__dirname, 'src/main/preload.ts'),
                },
            },
        },
    },
    renderer: {
        root: path.resolve(__dirname, 'src/renderer'),
        build: {
            rollupOptions: {
                input: {
                    index: path.resolve(__dirname, 'src/renderer/index.html'),
                },
            },
        },
        plugins: [react()],
    },
});
