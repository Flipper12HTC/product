export class RedisCache {
  async get(_key: string): Promise<string | null> {
    // TODO: implement with ioredis
    return null;
  }

  async set(_key: string, _value: string, _ttlMs?: number): Promise<void> {
    // TODO: implement with ioredis
  }
}
