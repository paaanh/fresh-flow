import type { OrderLine } from '@/components/order-items';

export type Product = {
  id: number;
  name: string;
  category: string;
  unit: string;
  price: number;
  available: number;
  ordered: number;
  approved: number;
  color: string;
  image?: string;
  tag?: string;
};

export type Order = {
  apiId?: number;
  id: string;
  customer: string;
  date: string;
  total: number;
  status: string;
  items: string;
  delivery: string;
  lines?: OrderLine[];
  createdAt?: string;
};

export type ProductRequest = {
  id: number;
  name: string;
  category: string;
  quantity: string;
  customer: string;
  date: string;
  status: string;
};
