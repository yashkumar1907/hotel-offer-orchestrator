import { proxyActivities } from '@temporalio/workflow';
import type * as activities from '../activities/suppliers';
import type { HotelOffer, SupplierHotel } from '../types/hotel';

const { fetchSupplierA, fetchSupplierB } = proxyActivities<typeof activities>({
  startToCloseTimeout: '10 seconds',
  retry: { initialInterval: '1 second', maximumInterval: '5 seconds', maximumAttempts: 3 },
});

function chooseBestOffers(a: SupplierHotel[], b: SupplierHotel[]): HotelOffer[] {
  const bestByName = new Map<string, HotelOffer>();
  for (const [supplier, hotels] of [['Supplier A', a], ['Supplier B', b]] as const) {
    for (const hotel of hotels) {
      const key = hotel.name.trim().toLocaleLowerCase();
      const candidate: HotelOffer = {
        name: hotel.name,
        price: hotel.price,
        supplier,
        commissionPct: hotel.commissionPct,
      };
      const current = bestByName.get(key);
      if (!current || candidate.price < current.price) bestByName.set(key, candidate);
    }
  }
  return [...bestByName.values()].sort((left, right) => left.name.localeCompare(right.name));
}

export async function aggregateHotelOffers(city: string): Promise<HotelOffer[]> {
  // Temporal schedules both supplier activities concurrently.
  const [supplierA, supplierB] = await Promise.all([
    fetchSupplierA(city),
    fetchSupplierB(city),
  ]);
  return chooseBestOffers(supplierA, supplierB);
}
