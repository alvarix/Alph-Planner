import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { configDefaults } from 'vitest/config';

export default defineConfig({
	plugins: [
		sveltekit(),
		VitePWA({
			registerType: 'autoUpdate',
			manifest: {
				name: 'Alph-Planner',
				short_name: 'Alph',
				description: 'Markdown-first weekly planner. Your daily notes are the source of truth.',
				theme_color: '#0ea5e9',
				background_color: '#f8fafc',
				display: 'standalone',
				start_url: '/',
				icons: [
					{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
					{ src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
				],
			},
			workbox: { globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'] },
		}),
	],
	test: {
		include: ['src/**/*.test.ts'],
		exclude: [...configDefaults.exclude],
		environment: 'node',
	},
});
