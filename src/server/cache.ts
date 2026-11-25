import net from 'node:net';

export interface CacheStats {
  backend: 'memory' | 'redis';
  redisConfigured: boolean;
  hits: number;
  misses: number;
  sets: number;
  invalidations: number;
  activeKeys: number;
  defaultTtlSeconds: number;
}

interface MemoryEntry {
  value: string;
  expiresAt: number;
}

const DEFAULT_TTL_SECONDS = 60;
const MAX_MEMORY_KEYS = 500;

export function buildCacheKey(namespace: string, params: Record<string, unknown>): string {
  const normalizedEntries = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== '')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${String(v).trim()}`);

  return normalizedEntries.length > 0
    ? `${namespace}:${normalizedEntries.join('&')}`
    : `${namespace}:all`;
}

async function runRedisCommand(redisUrl: string, args: string[]): Promise<string | null> {
  return new Promise((resolve, reject) => {
    let parsed: URL;
    try {
      parsed = new URL(redisUrl);
    } catch {
      return reject(new Error('Invalid REDIS_URL'));
    }

    const host = parsed.hostname || '127.0.0.1';
    const port = parsed.port ? Number(parsed.port) : 6379;
    const password = parsed.password ? decodeURIComponent(parsed.password) : '';

    const socket = net.createConnection({ host, port });
    socket.setTimeout(600);

    const encodeCmd = (parts: string[]) =>
      `*${parts.length}\r\n` +
      parts.map((p) => `$${Buffer.byteLength(p, 'utf8')}\r\n${p}\r\n`).join('');

    let buffer = '';
    const commands: string[][] = [];
    if (password) {
      commands.push(['AUTH', password]);
    }
    commands.push(args);

    socket.on('connect', () => {
      for (const cmd of commands) {
        socket.write(encodeCmd(cmd));
      }
    });

    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      const lines = buffer.split('\r\n');
      const targetIndex = password ? 1 : 0;
      if (lines.length < 2) return;

      // Wait for full bulk response if prefixed with $
      const relevant = password ? buffer.split('\r\n').slice(1).join('\r\n') : buffer;
      if (!relevant) return;

      if (relevant.startsWith('$-1\r\n')) {
        socket.end();
        return resolve(null);
      }
      if (relevant.startsWith('+') || relevant.startsWith(':')) {
        const end = relevant.indexOf('\r\n');
        if (end !== -1) {
          socket.end();
          return resolve(relevant.slice(1, end));
        }
      }
      if (relevant.startsWith('-')) {
        const end = relevant.indexOf('\r\n');
        if (end !== -1) {
          socket.end();
          return reject(new Error(relevant.slice(1, end)));
        }
      }
      if (relevant.startsWith('$')) {
        const firstEnd = relevant.indexOf('\r\n');
        if (firstEnd !== -1) {
          const byteLen = parseInt(relevant.slice(1, firstEnd), 10);
          const bodyStart = firstEnd + 2;
          const bodyBuf = Buffer.from(relevant.slice(bodyStart), 'utf8');
          if (bodyBuf.length >= byteLen + 2) {
            socket.end();
            return resolve(bodyBuf.subarray(0, byteLen).toString('utf8'));
          }
        }
      }
      if (relevant.startsWith('*') && targetIndex >= 0) {
        socket.end();
        return resolve(relevant);
      }
    });

    socket.on('timeout', () => {
      socket.destroy();
      reject(new Error('Redis timeout'));
    });

    socket.on('error', (err) => {
      socket.destroy();
      reject(err);
    });
  });
}

export class CacheService {
  private memory = new Map<string, MemoryEntry>();
  private hits = 0;
  private misses = 0;
  private sets = 0;
  private invalidations = 0;
  private lastBackend: 'memory' | 'redis' = 'memory';

  private get redisUrl(): string {
    return (process.env.REDIS_URL || '').trim();
  }

  private pruneExpired() {
    const now = Date.now();
    for (const [k, entry] of this.memory.entries()) {
      if (entry.expiresAt <= now) {
        this.memory.delete(k);
      }
    }
  }

  async get<T>(key: string): Promise<T | null> {
    if (this.redisUrl) {
      try {
        const raw = await runRedisCommand(this.redisUrl, ['GET', key]);
        this.lastBackend = 'redis';
        if (raw !== null) {
          this.hits++;
          return JSON.parse(raw) as T;
        }
        this.misses++;
        return null;
      } catch {
        // Fallback transparentemente a caché en memoria si Redis no responde
      }
    }

    this.lastBackend = 'memory';
    const entry = this.memory.get(key);
    if (!entry) {
      this.misses++;
      return null;
    }
    if (entry.expiresAt <= Date.now()) {
      this.memory.delete(key);
      this.misses++;
      return null;
    }
    this.hits++;
    return JSON.parse(entry.value) as T;
  }

  async set<T>(key: string, value: T, ttlSeconds = DEFAULT_TTL_SECONDS): Promise<void> {
    const serialized = JSON.stringify(value);
    const safeTtl = Math.max(1, Math.floor(ttlSeconds));
    this.sets++;

    if (this.redisUrl) {
      try {
        await runRedisCommand(this.redisUrl, ['SET', key, serialized, 'EX', String(safeTtl)]);
        this.lastBackend = 'redis';
        return;
      } catch {
        // Fallback a memoria
      }
    }

    this.lastBackend = 'memory';
    this.pruneExpired();
    if (this.memory.size >= MAX_MEMORY_KEYS) {
      const oldestKey = this.memory.keys().next().value;
      if (oldestKey !== undefined) {
        this.memory.delete(oldestKey);
      }
    }
    this.memory.set(key, {
      value: serialized,
      expiresAt: Date.now() + safeTtl * 1000,
    });
  }

  async delByPrefix(prefix: string): Promise<number> {
    this.invalidations++;
    let deleted = 0;

    if (this.redisUrl) {
      try {
        const keysRaw = await runRedisCommand(this.redisUrl, ['KEYS', `${prefix}*`]);
        if (keysRaw) {
          const matches = keysRaw
            .split('\r\n')
            .filter((line) => line.startsWith(prefix));
          if (matches.length > 0) {
            await runRedisCommand(this.redisUrl, ['DEL', ...matches]);
            deleted += matches.length;
          }
        }
      } catch {
        // Ignorar si Redis no está disponible
      }
    }

    for (const k of Array.from(this.memory.keys())) {
      if (k.startsWith(prefix)) {
        this.memory.delete(k);
        deleted++;
      }
    }
    return deleted;
  }

  clear(): void {
    this.memory.clear();
    this.hits = 0;
    this.misses = 0;
    this.sets = 0;
    this.invalidations = 0;
  }

  getStats(): CacheStats {
    this.pruneExpired();
    return {
      backend: this.redisUrl && this.lastBackend === 'redis' ? 'redis' : 'memory',
      redisConfigured: Boolean(this.redisUrl),
      hits: this.hits,
      misses: this.misses,
      sets: this.sets,
      invalidations: this.invalidations,
      activeKeys: this.memory.size,
      defaultTtlSeconds: DEFAULT_TTL_SECONDS,
    };
  }
}

export const cacheService = new CacheService();
