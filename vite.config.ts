import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
	plugins: [
		sveltekit(),
		VitePWA({
			registerType: 'autoUpdate',
			manifest: {
				name: 'Alph-Planner',
				short_name: 'Alph',
				description: 'Weekly task planner with terse syntax and drag-and-drop scheduling',
				theme_color: '#1e293b',
				background_color: '#f8fafc',
				display: 'standalone',
				start_url: '/',
				icons: [
					{
						src: '/icons/icon.svg',
						sizes: '192x192',
						type: 'image/svg+xml'
					},
					{
						src: '/icons/icon.svg',
						sizes: '512x512',
						type: 'image/svg+xml',
						purpose: 'any maskable'
					}
				]
			},
			workbox: {
				globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}']
			}
		})
	]
});
