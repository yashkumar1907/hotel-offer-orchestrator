import axios from 'axios';
import type { SupplierHotel } from '../types/hotel';

const baseUrl = () => process.env.SUPPLIER_API_BASE_URL ?? 'http://localhost:3000';

async function fetchSupplier(path: string): Promise<SupplierHotel[]> {
  const response = await axios.get<SupplierHotel[]>(`${baseUrl()}${path}`, { timeout: 5000 });
  return response.data;
}

export async function fetchSupplierA(city: string): Promise<SupplierHotel[]> {
  const hotels = await fetchSupplier(`/supplierA/hotels?city=${encodeURIComponent(city)}`);
  console.info({ supplier: 'A', city, count: hotels.length }, 'Supplier A response received');
  return hotels;
}

export async function fetchSupplierB(city: string): Promise<SupplierHotel[]> {
  const hotels = await fetchSupplier(`/supplierB/hotels?city=${encodeURIComponent(city)}`);
  console.info({ supplier: 'B', city, count: hotels.length }, 'Supplier B response received');
  return hotels;
}
