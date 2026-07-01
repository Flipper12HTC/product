import type { FastifyInstance } from 'fastify';

export async function registerHealthRoute(app: FastifyInstance): Promise<void> {
  app.get('/health', async () => ({
    status: 'healthy',
    uptime_ms: Math.floor(process.uptime() * 1000),
    version: process.env['npm_package_version'] ?? '0.0.0',
  }));
}
