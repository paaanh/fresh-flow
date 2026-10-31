'use client';

import { API_BASE } from '../lib/api';

type PhotoProduct = { name: string; category?: string; image?: string };

export function productImage(product: PhotoProduct): string {
  const url = product.image || '/images/store.jpg';
  return url.startsWith('/media/') ? `${new URL(API_BASE).origin}${url}` : url;
}

export default function ProductPhoto({ product, className = '' }: { product: PhotoProduct; className?: string }) {
  return <img src={productImage(product)} alt={product.name} loading="lazy" className={`inline-block h-full w-full rounded-[inherit] object-cover ${className}`} onError={event => { if (!event.currentTarget.src.endsWith('/images/store.jpg')) event.currentTarget.src = '/images/store.jpg'; }} />;
}
