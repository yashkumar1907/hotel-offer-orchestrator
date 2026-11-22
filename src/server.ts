import 'dotenv/config';
import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import pinoHttp from 'pino-http';
import { Connection, Client } from '@temporalio/client';
import { getHotels, redis, saveHotels } from './services/redis';
import type { SupplierHotel } from './types/hotel';

const app = express();
const port = Number(process.env.PORT ?? 3000);
const taskQueue = process.env.TEMPORAL_TASK_QUEUE ?? 'hotel-offer-task-queue';
const temporalAddress = process.env.TEMPORAL_ADDRESS ?? 'localhost:7233';

app.use(cors());
app.use(express.json());
app.use(pinoHttp());

const supplierA: SupplierHotel[] = [
  { hotelId: 'a1', name: 'Holtin', price: 6000, city: 'delhi', commissionPct: 10 },
  { hotelId: 'a2', name: 'Radison', price: 5900, city: 'delhi', commissionPct: 13 },
  { hotelId: 'a3', name: 'The Grand', price: 7200, city: 'delhi', commissionPct: 15 },
  { hotelId: 'a4', name: 'Maple Residency', price: 4100, city: 'delhi', commissionPct: 9 },
  { hotelId: 'a5', name: 'Harbor View', price: 6800, city: 'mumbai', commissionPct: 12 },
];
const supplierB: SupplierHotel[] = [
  { hotelId: 'b1', name: 'Holtin', price: 5340, city: 'delhi', commissionPct: 20 },
  { hotelId: 'b2', name: 'Radison', price: 6250, city: 'delhi', commissionPct: 11 },
  { hotelId: 'b3', name: 'The Grand', price: 6990, city: 'delhi', commissionPct: 17 },
  { hotelId: 'b4', name: 'City Nest', price: 3800, city: 'delhi', commissionPct: 8 },
  { hotelId: 'b5', name: 'Harbor View', price: 6400, city: 'mumbai', commissionPct: 14 },
];

const byCity = (rows: SupplierHotel[], city: unknown) => {
  const normalized = typeof city === 'string' ? city.trim().toLowerCase() : '';
  return rows.filter((hotel) => hotel.city.toLowerCase() === normalized);
};

app.get('/supplierA/hotels', (req: Request, res: Response) => {
  res.json(byCity(supplierA, req.query.city));
});
app.get('/supplierB/hotels', (req: Request, res: Response) => {
  res.json(byCity(supplierB, req.query.city));
});

app.get('/health', async (_req: Request, res: Response) => {
  const checks: Record<string, { status: 'up' | 'down'; detail?: string }> = {};
  for (const [name, path] of [['supplierA', '/supplierA/hotels?city=delhi'], ['supplierB', '/supplierB/hotels?city=delhi']]) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}${path}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      checks[name] = { status: 'up' };
    } catch (error) {
      checks[name] = { status: 'down', detail: error instanceof Error ? error.message : 'Unknown error' };
    }
  }
  try {
    await redis.ping();
    checks.redis = { status: 'up' };
  } catch (error) {
    checks.redis = { status: 'down', detail: error instanceof Error ? error.message : 'Unknown error' };
  }
  const healthy = Object.values(checks).every((check) => check.status === 'up');
  res.status(healthy ? 200 : 503).json({ status: healthy ? 'healthy' : 'degraded', checks });
});

app.get('/api/hotels', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const city = typeof req.query.city === 'string' ? req.query.city.trim().toLowerCase() : '';
    if (!city) return res.status(400).json({ error: 'Query parameter "city" is required.' });

    const minPrice = req.query.minPrice === undefined ? undefined : Number(req.query.minPrice);
    const maxPrice = req.query.maxPrice === undefined ? undefined : Number(req.query.maxPrice);
    if ((minPrice !== undefined && (!Number.isFinite(minPrice) || minPrice < 0)) ||
        (maxPrice !== undefined && (!Number.isFinite(maxPrice) || maxPrice < 0))) {
      return res.status(400).json({ error: 'minPrice and maxPrice must be non-negative numbers.' });
    }
    if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
      return res.status(400).json({ error: 'minPrice cannot be greater than maxPrice.' });
    }

    const connection = await Connection.connect({ address: temporalAddress });
    try {
      const client = new Client({ connection, namespace: process.env.TEMPORAL_NAMESPACE ?? 'default' });
      const handle = await client.workflow.start('aggregateHotelOffers', {
        taskQueue,
        workflowId: `hotel-offers-${city}-${Date.now()}`,
        args: [city],
      });
      const offers = await handle.result();
      await saveHotels(city, offers);
    } finally {
      await connection.close();
    }

    const hotels = await getHotels(city, minPrice, maxPrice);
    return res.json(hotels);
  } catch (error) {
    return next(error);
  }
});

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  reqLog(error);
  res.status(500).json({ error: 'Internal server error', message: error instanceof Error ? error.message : 'Unknown error' });
});

function reqLog(error: unknown): void {
  console.error('Request failed', error);
}

const server = app.listen(port, () => console.info(`Hotel API listening on port ${port}`));

async function shutdown(signal: string): Promise<void> {
  console.info(`${signal} received; shutting down`);
  server.close();
  await redis.quit();
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
