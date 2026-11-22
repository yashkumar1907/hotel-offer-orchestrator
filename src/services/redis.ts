import Redis from 'ioredis';

export const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  lazyConnect: false,
  maxRetriesPerRequest: 3,
  retryStrategy: (times) => Math.min(times * 200, 2000),
});

const cacheKey = (city: string) => `hotels:${city.toLowerCase()}`;

/** Atomically replaces the city's cached offers. Sorted-set scores are prices. */
export async function saveHotels(city: string, hotels: unknown[]): Promise<void> {
  const key = cacheKey(city);
  const ttl = Number(process.env.REDIS_CACHE_TTL_SECONDS ?? 300);
  const pipeline = redis.pipeline();
  pipeline.del(key);
  for (const hotel of hotels as Array<{ name: string; price: number }>) {
    pipeline.zadd(key, hotel.price, JSON.stringify(hotel));
  }
  pipeline.expire(key, ttl);
  const result = await pipeline.exec();
  if (!result || result.some(([error]) => error)) {
    throw new Error(`Failed to persist hotel offers for city ${city}`);
  }
}

/** Price filtering is performed by Redis using ZRANGEBYSCORE. */
export async function getHotels(
  city: string,
  minPrice?: number,
  maxPrice?: number,
): Promise<unknown[]> {
  const min = minPrice ?? '-inf';
  const max = maxPrice ?? '+inf';
  const rows = await redis.zrangebyscore(cacheKey(city), min, max);
  return rows.map((row) => JSON.parse(row));
}
