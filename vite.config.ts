import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
	define: {
		__BUILD_TIME__: JSON.stringify(new Date().toISOString()),
	},
	plugins: [react()],
	server: {
		proxy: {
			'/api': 'http://localhost:3000',
		},
	},
});
