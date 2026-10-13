// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const process: any;
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({ plugins: [react()], base: process.env.BASE_PATH ?? '/' });
