import dotenv from 'dotenv';
dotenv.config({ override: true });
import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import apiRouter from './src/server/api';
import { setupSwagger } from './src/server/swagger';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;
  const isProduction = process.env.NODE_ENV === 'production';

  app.use(express.json());
  // Serve public assets (e.g. /logo.png) with instant response
  app.use(express.static(path.resolve(__dirname, 'public')));

  // Mount API router
  app.use('/api', apiRouter);

  // Mount Swagger UI documentation at /api-docs (OpenAPI 3.0)
  setupSwagger(app);

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);

    // Vite index.html transform handler for SPA routing
    app.get('*', async (req, res, next) => {
      const url = req.originalUrl;
      try {
        const indexPath = path.resolve(__dirname, 'index.html');
        if (fs.existsSync(indexPath)) {
          let template = fs.readFileSync(indexPath, 'utf-8');
          template = await vite.transformIndexHtml(url, template);
          res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
        } else {
          next();
        }
      } catch (e: any) {
        if (vite) vite.ssrFixStacktrace(e);
        next(e);
      }
    });
  } else {
    // Production static serving
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`\n=================================================`);
    console.log(`🚀 [Kirikú Server] Iniciado con éxito!`);
    console.log(`🌐 Accede a la aplicación: http://localhost:${PORT}`);
    console.log(`📚 Documentación Swagger UI: http://localhost:${PORT}/api-docs`);
    console.log(`📄 Especificación OpenAPI JSON: http://localhost:${PORT}/api/openapi.json`);
    console.log(`=================================================\n`);
  });
}

startServer().catch((err) => {
  console.error('\n❌ [Kirikú Server] Error al iniciar:', err);
  process.exit(1);
});
