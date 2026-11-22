# Hotel Offer Orchestrator

A TypeScript/Express service that fetches hotel offers from two mock suppliers in parallel through a Temporal workflow, selects the cheapest offer for each hotel name, stores the deduplicated results in Redis, and applies price filtering in Redis.

## Architecture

- **API**: Express routes for hotel search, mock suppliers, and health checks.
- **Temporal workflow**: schedules Supplier A and Supplier B activities concurrently, then deduplicates by normalized hotel name and selects the lowest price.
- **Activities**: call the mock supplier HTTP endpoints. Temporal retries failed activities up to three attempts.
- **Redis**: stores each city's offers in a sorted set (`hotels:<city>`), with price as the score. `ZRANGEBYSCORE` performs min/max filtering.
- **Worker**: a separate process polls the Temporal task queue.
- **Docker Compose**: runs the API, Temporal dev server, Redis, and worker.

## Prerequisites

- Docker Desktop / Docker Engine with the Compose plugin
- (Optional for local development) Node.js 22+

## Run with Docker Compose

```bash
docker compose up --build
```

Wait for the API container to become healthy, then call:

```bash
curl 'http://localhost:3000/api/hotels?city=delhi'
curl 'http://localhost:3000/api/hotels?city=delhi&minPrice=4000&maxPrice=6000'
curl 'http://localhost:3000/health'
```

Useful URLs:

- API: http://localhost:3000
- Temporal Web UI: http://localhost:8233
- Redis: localhost:6379

Stop the stack:

```bash
docker compose down
```

Remove persisted Redis data too:

```bash
docker compose down -v
```

## Local development (without Docker for the app)

Start Temporal and Redis first (for example, use the `temporal` and `redis` services from Compose), then:

```bash
cp .env.example .env
npm install
npm run build
```

Run the API and worker in separate terminals:

```bash
npm run dev:api
npm run dev:worker
```

For local processes, change `TEMPORAL_ADDRESS` to `localhost:7233`, `REDIS_URL` to `redis://localhost:6379`, and `SUPPLIER_API_BASE_URL` to `http://localhost:3000` in `.env`.

## API

### `GET /api/hotels`

Required query parameter: `city`.

Optional query parameters:

- `minPrice`: inclusive minimum price
- `maxPrice`: inclusive maximum price

Examples:

```http
GET /api/hotels?city=delhi
GET /api/hotels?city=delhi&minPrice=4000&maxPrice=6000
GET /api/hotels?city=jaipur
```

Successful responses are JSON arrays in this shape:

```json
[
  {
    "name": "Holtin",
    "price": 5340,
    "supplier": "Supplier B",
    "commissionPct": 20
  }
]
```

The price bounds are inclusive. Missing bounds are unbounded. An unknown city returns an empty array. Missing city, invalid prices, or `minPrice > maxPrice` returns HTTP 400.

### Mock supplier endpoints

- `GET /supplierA/hotels?city=delhi`
- `GET /supplierB/hotels?city=delhi`

Both suppliers have overlapping names in Delhi and Mumbai, plus supplier-specific hotels to exercise the one-source-only case.

### `GET /health`

Returns HTTP 200 when both supplier endpoints and Redis are reachable, otherwise HTTP 503. The response includes individual supplier statuses.

## Redis data model

Each city is stored in a sorted set named `hotels:<normalized-city>`. Each member is the serialized final offer and its score is the numeric price. The endpoint replaces the city's previous snapshot and applies a configurable TTL (`REDIS_CACHE_TTL_SECONDS`, default 300). Filtering is executed by Redis `ZRANGEBYSCORE`, not by an in-process array filter.

## Postman

Import `postman/Hotel-Offer-Orchestrator.postman_collection.json` into Postman. It includes:

1. Delhi offers (checks deduplication and best-price selection)
2. Delhi offers filtered to 4000–6000
3. Unknown city (empty list)
4. Supplier A mock endpoint
5. Supplier B mock endpoint
6. Health check

## Configuration

See `.env.example`. Docker Compose supplies container-network values automatically. The API and worker must use the same Temporal namespace and task queue.

## Notes / production hardening

This is a self-contained demo using Temporal's development server and in-memory mock supplier data. For production, use a persistent Temporal cluster, authenticated supplier integrations, request-scoped tracing, structured centralized logs, Redis authentication/TLS, secrets management, and explicit cache freshness/invalidation policies. If a supplier is unavailable, its activity retries and the workflow fails rather than silently returning an incomplete comparison.
