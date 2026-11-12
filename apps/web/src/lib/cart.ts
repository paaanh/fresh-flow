import { getProductPricing } from '@/features/customer/page-model';
import type { Post, PostProductInfo, Product } from '@/types/domain';

/**
 * Cart = { key: quantity }.
 *   "12"     → product 12 bought from the shop (catalog price)
 *   "12@34"  → product 12 bought through Newfeed post 34 (price & limit of that post's programme)
 * Old carts saved as { 12: 2 } keep working (object keys are strings).
 */
export type Cart = Record<string, number>;

export const cartKey = (productId: number, postId?: number | null) => (postId ? `${productId}@${postId}` : String(productId));

export function parseCartKey(key: string): { productId: number; postId: number | null } {
  const [product, post] = String(key).split('@');
  return { productId: Number(product), postId: post ? Number(post) : null };
}

export type CartLine = {
  key: string;
  product: Product;
  quantity: number;
  postId: number | null;
  postTitle?: string;
  /** Price paid per unit for this line. */
  unitPrice: number;
  /** Reference price shown struck through (0 = none). */
  originalPrice: number;
  discountPercent: number;
  /** Badge such as "Giá riêng Nhóm Sinh viên" or "SALE". */
  priceLabel?: string;
  /** Max quantity for this line (stock, or what the post still sells). */
  maxQuantity: number;
  /** The post no longer sells this item (ended, hidden, removed): checkout must be fixed first. */
  unavailable?: string;
};

function postItem(posts: Post[], postId: number, productId: number): { post?: Post; info?: PostProductInfo } {
  const post = posts.find(p => p.id === postId);
  return { post, info: post?.products_info?.find(i => i.id === productId) };
}

export function cartLines(cart: Cart, products: Product[], posts: Post[]): CartLine[] {
  const lines: CartLine[] = [];
  for (const [key, quantity] of Object.entries(cart)) {
    if (!(quantity > 0)) continue;
    const { productId, postId } = parseCartKey(key);
    const product = products.find(p => p.id === productId);
    if (!product) continue;
    if (postId) {
      const { post, info } = postItem(posts, postId, productId);
      const base = Number(info?.base_price ?? product.base_price ?? product.price);
      const price = Number(info?.effective_price ?? product.price);
      // Post not loaded yet (beyond the first feed page): keep the line, the server confirms the price.
      const unavailable = !post
        ? undefined
        : !info
        ? 'Bài đăng không còn bán mặt hàng này'
        : post.program_status === 'ENDED'
          ? 'Chương trình đã kết thúc'
          : post.program_status === 'UPCOMING'
            ? 'Chương trình chưa bắt đầu'
            : undefined;
      lines.push({
        key,
        product,
        quantity,
        postId,
        postTitle: post?.title,
        unitPrice: price,
        originalPrice: price < base ? base : 0,
        discountPercent: price < base && base > 0 ? Math.round((1 - price / base) * 100) : 0,
        priceLabel: !post ? 'Giá theo bài đăng' : info?.on_sale ? 'SALE' : info && Number(info.group_discount || 0) > 0 ? 'Giá riêng theo nhóm' : undefined,
        maxQuantity: Math.max(0, Number(info?.available_quantity ?? product.available)),
        unavailable,
      });
    } else {
      const pricing = getProductPricing(product);
      lines.push({
        key,
        product,
        quantity,
        postId: null,
        unitPrice: pricing.effectivePrice,
        originalPrice: pricing.isSale ? pricing.originalPrice : 0,
        discountPercent: pricing.discountPercent,
        priceLabel: pricing.isSale ? 'SALE' : undefined,
        maxQuantity: Math.max(0, product.available),
      });
    }
  }
  return lines;
}

export const cartTotal = (lines: CartLine[]) => lines.reduce((sum, l) => sum + Math.round(l.unitPrice * l.quantity), 0);
/** Number of different items in the cart (quantities can be decimals, e.g. 1,5 kg). */
export const cartCount = (cart: Cart) => Object.values(cart).filter(q => q > 0).length;
