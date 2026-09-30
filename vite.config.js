import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { multiplayerPlugin } from './server/multiplayerPlugin.js';

function assetMetaPlugin() {
  return {
    name: 'asset-meta-service',
    configureServer(server) {
      server.middlewares.use('/api/asset-meta', async (req, res, next) => {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const assetPathQuery = url.searchParams.get('path');

        if (req.method === 'GET') {
          if (!assetPathQuery) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Missing path parameter' }));
            return;
          }

          const assetFullPath = path.resolve(process.cwd(), 'public', assetPathQuery);
          const metaFullPath = assetFullPath + '.meta.json';

          const existsAsset = fs.existsSync(assetFullPath);
          const existsMeta = fs.existsSync(metaFullPath);

          if (!existsAsset) {
            res.statusCode = 404;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Asset not found' }));
            return;
          }

          if (!existsMeta) {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ exists: false, dirty: true, meta: null }));
            return;
          }

          try {
            const assetStat = fs.statSync(assetFullPath);
            const metaContent = JSON.parse(fs.readFileSync(metaFullPath, 'utf-8'));
            const metaMtime = metaContent.assetModifiedTime ? new Date(metaContent.assetModifiedTime).getTime() : 0;
            const dirty = assetStat.mtimeMs > metaMtime;

            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ exists: true, dirty, meta: metaContent }));
          } catch (error) {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ exists: true, dirty: true, meta: null }));
          }
          return;
        }

        if (req.method === 'POST') {
          let body = '';
          req.on('data', (chunk) => {
            body += chunk;
          });
          req.on('end', () => {
            try {
              const data = JSON.parse(body);
              const { assetPath, subMeshNames = [], importSettings = {} } = data;

              if (!assetPath) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'Missing assetPath' }));
                return;
              }

              const assetFullPath = path.resolve(process.cwd(), 'public', assetPath);
              const metaFullPath = assetFullPath + '.meta.json';

              let assetMtimeMs = Date.now();
              if (fs.existsSync(assetFullPath)) {
                assetMtimeMs = fs.statSync(assetFullPath).mtimeMs;
              }

              const subMeshOverrides = {};
              subMeshNames.forEach((name) => {
                subMeshOverrides[name] = {
                  castShadow: true,
                  receiveShadow: true,
                  materialRenderType: 'cutout',
                };
              });

              if (fs.existsSync(metaFullPath)) {
                try {
                  const existing = JSON.parse(fs.readFileSync(metaFullPath, 'utf-8'));
                  if (existing.subMeshOverrides) {
                    Object.assign(subMeshOverrides, existing.subMeshOverrides);
                    subMeshNames.forEach((name) => {
                      if (!subMeshOverrides[name]) {
                        subMeshOverrides[name] = {
                          castShadow: true,
                          receiveShadow: true,
                          materialRenderType: 'cutout',
                        };
                      }
                    });
                  }
                } catch (e) {
                  // Ignore parse error
                }
              }

              const metaObject = {
                assetPath,
                version: 1,
                generatedAt: new Date().toISOString(),
                assetModifiedTime: new Date(assetMtimeMs).toISOString(),
                importSettings: {
                  scaleFactor: 1.0,
                  generateColliders: true,
                  materialRenderType: 'cutout',
                  ...importSettings,
                },
                subMeshOverrides,
              };

              fs.writeFileSync(metaFullPath, JSON.stringify(metaObject, null, 2), 'utf-8');

              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true, meta: metaObject }));
            } catch (error) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: error.message }));
            }
          });
          return;
        }

        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [assetMetaPlugin(), multiplayerPlugin()],
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
  },
});
