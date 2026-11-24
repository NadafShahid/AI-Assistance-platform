import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const agentRoutes = {
  '/api/agent/manage': () => import('./api/agent/manage.js'),
  '/api/agent/query': () => import('./api/agent/query.js'),
  '/api/agent/ingest': () => import('./api/agent/ingest.js')
};

function localAgentApi(mode) {
  return {
    name: 'local-agent-api',
    apply: 'serve',
    configureServer(server) {
      // Load backend credentials into the server process only.
      const env = loadEnv(mode, server.config.envDir, ['FIREBASE_', 'GROQ_', 'GEMINI_', 'OPENAI_', 'QDRANT_', 'EMBEDDING_']);
      for (const [key, value] of Object.entries(env)) {
        process.env[key] ??= value;
      }

      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url, 'http://localhost');
        if (!Object.hasOwn(agentRoutes, url.pathname)) return next();

        res.status = (code) => {
          res.statusCode = code;
          return res;
        };
        req.query = Object.fromEntries(url.searchParams);
        try {
          if (['POST', 'PATCH', 'DELETE'].includes(req.method)) {
            const chunks = [];
            let size = 0;
            for await (const chunk of req.iterator({ destroyOnReturn: false })) {
              size += chunk.length;
              if (size > 4_500_000) {
                req.resume();
                res.setHeader('Content-Type', 'application/json');
                return res.status(413).end(JSON.stringify({ error: 'Request body is too large' }));
              }
              chunks.push(chunk);
            }
            req.body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
          }
        } catch {
          res.setHeader('Content-Type', 'application/json');
          return res.status(400).end(JSON.stringify({ error: 'Invalid JSON request' }));
        }

        try {
          const { default: handler } = await agentRoutes[url.pathname]();
          await handler(req, res);
        } catch (error) {
          next(error);
        }
      });
    }
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), localAgentApi(mode)],
  server: {
    port: 3000,
    open: false,
    host: true
  },
  build: {
    // Security: Never emit source maps in production to prevent leaking comments or source structure
    sourcemap: false,
    minify: 'esbuild'
  }
}));
