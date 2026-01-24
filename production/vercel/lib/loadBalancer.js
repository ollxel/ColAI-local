/**
 * Round-robin балансировка между Render-серверами (Ollama).
 * Каждый сервер — инстанс ollama-server на Render.
 */
function parseServers(env) {
  if (!env || typeof env !== 'string') return [];
  return env.split(',').map((s) => s.trim()).filter(Boolean);
}

export class LoadBalancer {
  constructor(serversEnv = '') {
    this.servers = parseServers(serversEnv || process.env.RENDER_SERVERS);
    this.index = 0;
  }

  getNext() {
    if (this.servers.length === 0) return null;
    const url = this.servers[this.index % this.servers.length];
    this.index += 1;
    return url;
  }

  getAll() {
    return [...this.servers];
  }
}
