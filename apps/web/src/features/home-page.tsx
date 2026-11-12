'use client';

import Link from 'next/link';
import ProductPhoto from '@/components/product-photo';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowRight, faBasketShopping, faCheck, faClock, faLeaf, faLocationDot, faMagnifyingGlass, faSeedling, faShieldHeart, faStar, faTruckFast } from '@fortawesome/free-solid-svg-icons';
import { getProductPricing } from '@/features/customer/page-model';

type Product = { 
  id: number; 
  name: string; 
  category: string; 
  unit: string; 
  price: number; 
  available: number; 
  color: string; 
  image?: string; 
  tag?: string;
  list_price?: number;
  base_price?: number;
  sale_price?: number | null;
  sale_status?: 'NONE' | 'SCHEDULED' | 'ACTIVE' | 'EXPIRED';
};

export default function HomePage({ products, addCart, money, cartCount }: { products: Product[]; addCart: (id: number) => void; money: (value: number) => string; cartCount: number }) {
  const featured = products.slice(0, 4);
  const categories = [
    { name: 'Rau củ', note: 'Rau xanh mỗi ngày', image: '/images/kale.jpg', color: '#e9f2df' },
    { name: 'Trái cây', note: 'Ngọt lành tự nhiên', image: '/images/store.jpg', color: '#fff0dd' },
    { name: 'Thực phẩm', note: 'Tốt lành cho nhà', image: '/images/eggs.jpg', color: '#f4eee2' },
    { name: 'Đồ tươi', note: 'Chọn lọc mỗi sáng', image: '/images/avocado.jpg', color: '#e6f0e8' },
  ];

  return <main className="min-h-screen overflow-hidden bg-white text-[#20362b]">
    <div className="bg-white px-4 py-2 text-center text-[11px] font-medium tracking-wide text-[#174f3c] sm:text-xs"><FontAwesomeIcon icon={faTruckFast} className="mr-2"/>Miễn phí giao hàng cho đơn từ 300.000₫ <span className="mx-2 text-slate-400">·</span> Tươi ngon giao tận nơi mỗi ngày</div>
    <header className="sticky top-0 z-30 border-b border-[#e9eee7] bg-white backdrop-blur">
      <div className="mx-auto flex h-[76px] max-w-7xl items-center justify-between gap-4 px-5 lg:px-8">
        <Link href="/" className="flex shrink-0 items-center gap-2.5"><span className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-[#176b52] text-white"><FontAwesomeIcon icon={faSeedling}/></span><span className="text-[20px] font-extrabold tracking-tight">freshflow<span className="text-[#79a985]">.</span><span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-[.18em] text-[#91a297]">Fresh, every day</span></span></Link>
        <nav className="hidden items-center gap-8 text-[13px] font-semibold text-[#66766b] md:flex"><a href="#san-pham" className="transition hover:text-[#176b52]">Sản phẩm</a><a href="#danh-muc" className="transition hover:text-[#176b52]">Danh mục</a><a href="#cach-hoat-dong" className="transition hover:text-[#176b52]">Cách hoạt động</a></nav>
        <div className="flex items-center gap-2 sm:gap-3"><Link href="/products" aria-label="Tìm sản phẩm" className="hidden h-10 w-10 items-center justify-center rounded-xl border border-[#e6ece5] bg-white text-[#62736a] sm:flex"><FontAwesomeIcon icon={faMagnifyingGlass}/></Link><Link href="/login" className="hidden px-2 py-2 text-xs font-bold text-[#476253] sm:block">Đăng nhập</Link><Link href="/cart" className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#176b52] px-3.5 text-xs font-bold text-white transition hover:bg-[#10563f] sm:px-4"><FontAwesomeIcon icon={faBasketShopping}/><span className="hidden sm:inline">Giỏ hàng</span><span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-white/20 px-1 text-[10px]">{cartCount}</span></Link></div>
      </div>
    </header>

    <section className="relative mx-auto max-w-7xl px-5 pb-10 pt-8 lg:px-8 lg:pb-16 lg:pt-12">
      <div className="relative isolate grid min-h-[470px] overflow-hidden rounded-[30px] bg-white lg:min-h-[520px] lg:grid-cols-[1.02fr_.98fr]">
        <div className="relative z-10 flex flex-col items-start justify-center px-7 py-12 sm:px-12 lg:px-16 lg:py-14">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#cbdcc9] bg-white/70 px-3.5 py-2 text-[10px] font-bold uppercase tracking-[.13em] text-[#427253]"><FontAwesomeIcon icon={faLeaf}/> Từ vườn đến bàn ăn</div>
          <h1 className="max-w-xl text-[42px] font-extrabold leading-[1.08] tracking-[-.045em] text-[#234b35] sm:text-[54px] lg:text-[62px]">Ăn lành mỗi ngày, <span className="font-semibold italic text-[#5b9a62]">sống xanh</span> hơn.</h1>
          <p className="mt-5 max-w-md text-[14px] leading-7 text-[#627b67] sm:text-[15px]">Rau củ và trái cây tươi được chọn lọc từ những nhà vườn địa phương. Đặt nhanh, nhận hàng tươi ngon ngay trong ngày.</p>
          <div className="mt-8 flex flex-wrap items-center gap-3"><Link href="/products" className="inline-flex h-12 items-center gap-3 rounded-xl bg-[#176b52] px-5 text-sm font-bold text-white shadow-lg shadow-[#176b52]/15 transition hover:-translate-y-0.5 hover:bg-[#10563f]">Khám phá cửa hàng <FontAwesomeIcon icon={faArrowRight} className="text-xs"/></Link><span className="inline-flex items-center gap-2 px-2 text-xs font-semibold text-[#59725e]"><FontAwesomeIcon icon={faCheck} className="text-[#6d9b70]"/> Nguồn gốc rõ ràng</span></div>
          <div className="mt-9 flex items-center gap-3"><div className="flex -space-x-2">{['MA','TN','LH','PQ'].map((person,index)=><span key={person} className={`flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#e8f0e3] text-[10px] font-bold text-[#42664d] ${['bg-white','bg-white','bg-white','bg-white'][index]}`}>{person}</span>)}</div><div className="text-[11px] leading-4 text-[#6c806e]"><span className="font-bold text-[#304d38]">1.200+</span> khách hàng đã chọn FreshFlow<br/><span className="text-[#d99a37]">★★★★★</span> <span className="font-semibold text-[#526b56]">4.9/5</span> đánh giá</div></div>
        </div>
        <div className="relative min-h-[270px] overflow-hidden lg:min-h-full">
          <img src="/images/store.jpg" alt="Rau củ và trái cây tươi tại cửa hàng" className="absolute inset-0 h-full w-full object-cover" fetchPriority="high" />
          <div className="absolute bottom-6 right-5 rounded-2xl border border-white/80 bg-white/85 p-3 shadow-lg backdrop-blur sm:right-8 sm:p-4"><div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white overflow-hidden"><img src="/images/kale.jpg" alt="Fresh produce" className="h-full w-full object-cover" /></span><span><span className="block text-[10px] font-semibold text-[#869387]">Thu hoạch trong ngày</span><b className="mt-0.5 block text-xs text-[#2d4b36]">Tươi ngon từ vườn</b></span></div></div>
          <div className="absolute left-5 top-5 flex h-14 w-14 -rotate-12 flex-col items-center justify-center rounded-full bg-[#f4bd59] text-center text-[10px] font-extrabold uppercase leading-3 text-[#4e512f] shadow-md sm:left-8 sm:top-8 sm:h-16 sm:w-16">Tươi<br/>mỗi ngày</div>
        </div>
      </div>
      <div className="absolute bottom-2 left-1/2 hidden -translate-x-1/2 items-center gap-2 rounded-full border border-[#e8eee7] bg-white px-4 py-2.5 text-[10px] font-medium text-[#728176] shadow-sm lg:flex"><FontAwesomeIcon icon={faLocationDot} className="text-[#60916c]"/> Giao hàng trong ngày tại khu vực của bạn</div>
    </section>

    <section id="danh-muc" className="mx-auto max-w-7xl px-5 py-9 lg:px-8 lg:py-12"><div className="mb-6 flex items-end justify-between"><div><p className="text-[10px] font-extrabold uppercase tracking-[.17em] text-[#82a184]">Mua sắm theo danh mục</p><h2 className="mt-2 text-2xl font-extrabold tracking-tight text-[#263b2e] sm:text-[28px]">Có gì tươi hôm nay?</h2></div><Link href="/products" className="hidden items-center gap-2 text-xs font-bold text-[#176b52] sm:flex">Tất cả sản phẩm <FontAwesomeIcon icon={faArrowRight}/></Link></div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">{categories.map(category=><Link href="/products" key={category.name} className="group flex items-center gap-3 rounded-2xl border border-[#edf0ea] bg-white p-3.5 transition hover:-translate-y-1 hover:border-[#c9ddcc] hover:shadow-md sm:gap-4 sm:p-4"><span style={{background:"#ffffff"}} className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[17px] text-[30px] transition group-hover:scale-105"><ProductPhoto product={category} /></span><span><b className="block text-xs text-[#304638] sm:text-sm">{category.name}</b><span className="mt-1 block text-[10px] text-[#89958b] sm:text-[11px]">{category.note}</span></span></Link>)}</div>
    </section>

    <section id="san-pham" className="mx-auto max-w-7xl px-5 py-9 lg:px-8 lg:py-12"><div className="mb-6 flex items-end justify-between"><div><p className="text-[10px] font-extrabold uppercase tracking-[.17em] text-[#82a184]">Được yêu thích</p><h2 className="mt-2 text-2xl font-extrabold tracking-tight text-[#263b2e] sm:text-[28px]">Lựa chọn hôm nay</h2><p className="mt-1 text-xs text-[#829087]">Tươi ngon theo mùa, giá tốt cho mọi nhà.</p></div><Link href="/products" className="hidden items-center gap-2 text-xs font-bold text-[#176b52] sm:flex">Xem toàn bộ <FontAwesomeIcon icon={faArrowRight}/></Link></div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
        {featured.map((product,index)=>{
          const pricing = getProductPricing(product);
          return (
          <article key={product.id} className="group overflow-hidden rounded-[20px] border border-[#e9eee7] bg-white transition hover:-translate-y-1 hover:shadow-lg hover:shadow-[#223a2c]/[.06]">
            <Link href={`/products/${product.id}`} className="relative flex h-36 items-center justify-center overflow-hidden sm:h-48" style={{background:"#ffffff"}}>
              <span className="absolute -right-6 -top-8 h-28 w-28 rounded-full bg-white/25 transition group-hover:scale-125 sm:h-36 sm:w-36"/>
              <ProductPhoto product={product} />
              <span className="absolute left-3 top-3 rounded-full bg-white/85 px-2.5 py-1 text-[10px] font-bold text-[#4a7553]">
                {pricing.isSale ? `SALE -${pricing.discountPercent}%` : (product.tag || (index===0?'Bán chạy':'Tươi mới'))}
              </span>
              <span className="absolute bottom-3 right-3 rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-semibold text-[#64746a]">
                Còn {product.available} {product.unit}
              </span>
            </Link>
            <div className="p-3.5 sm:p-4">
              <div className="text-[10px] font-bold uppercase tracking-[.12em] text-[#91a094]">{product.category}</div>
              <Link href={`/products/${product.id}`} className="mt-1.5 block truncate text-xs font-bold text-[#2d3e33] hover:text-[#176b52] sm:text-sm">{product.name}</Link>
              <div className="mt-1.5 flex items-center gap-1 text-[10px] text-[#d9a344]">
                <FontAwesomeIcon icon={faStar}/><FontAwesomeIcon icon={faStar}/><FontAwesomeIcon icon={faStar}/><FontAwesomeIcon icon={faStar}/><FontAwesomeIcon icon={faStar}/>
                <span className="ml-1 text-[#909b91]">(4.9)</span>
              </div>
              <div className="mt-3 flex items-center justify-between gap-1">
                <div className="min-w-0">
                  <div className={`text-xs font-extrabold sm:text-sm ${pricing.isSale ? 'text-rose-600' : 'text-[#226144]'}`}>
                    {money(pricing.effectivePrice)}
                    <span className="ml-1 text-[10px] font-medium text-[#879389]">/{product.unit}</span>
                  </div>
                  {pricing.isSale && (
                    <div className="text-[10px] text-slate-400 line-through">
                      {money(pricing.originalPrice)}
                    </div>
                  )}
                </div>
                <button aria-label={`Thêm ${product.name} vào giỏ hàng`} onClick={()=>addCart(product.id)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-white text-[#176b52] transition hover:bg-[#176b52] hover:text-white">
                  <FontAwesomeIcon icon={faBasketShopping} className="text-xs"/>
                </button>
              </div>
            </div>
          </article>
          );
        })}
      </div>
    </section>

    <section id="cach-hoat-dong" className="mx-auto max-w-7xl px-5 py-8 lg:px-8 lg:py-12"><div className="grid overflow-hidden rounded-[26px] bg-white md:grid-cols-[1fr_1.1fr]"><div className="flex flex-col justify-center p-7 sm:p-10 lg:p-14"><p className="text-[10px] font-extrabold uppercase tracking-[.16em] text-[#7b9d7c]">Tươi ngon thật đơn giản</p><h2 className="mt-3 max-w-md text-3xl font-extrabold leading-tight tracking-tight text-[#294936]">Một lựa chọn nhỏ, khác biệt lớn cho mỗi ngày.</h2><p className="mt-3 max-w-md text-xs leading-6 text-[#718171]">Chúng tôi kết nối bạn với nguồn thực phẩm tươi, minh bạch và thuận tiện để đặt mua.</p><Link href="/products" className="mt-6 inline-flex w-fit items-center gap-2 text-xs font-extrabold text-[#176b52]">Bắt đầu chọn món <FontAwesomeIcon icon={faArrowRight}/></Link></div><div className="grid grid-cols-2 gap-px bg-white">{[{icon:faSeedling,title:'Nguồn hàng chọn lọc',text:'Ưu tiên nhà vườn địa phương.'},{icon:faClock,title:'Đặt nhanh mỗi ngày',text:'Danh mục rõ ràng, dễ chọn.'},{icon:faShieldHeart,title:'An tâm chất lượng',text:'Tươi ngon, nguồn gốc minh bạch.'},{icon:faTruckFast,title:'Giao hàng tiện lợi',text:'Chọn cách nhận phù hợp.'}].map(item=><div key={item.title} className="bg-white p-5 sm:p-7"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-[#568265] shadow-sm"><FontAwesomeIcon icon={item.icon}/></span><b className="mt-4 block text-xs text-[#36533e] sm:text-sm">{item.title}</b><p className="mt-1.5 text-[10px] leading-5 text-[#819082] sm:text-xs">{item.text}</p></div>)}</div></div></section>

    <footer className="mt-10 border-t border-[#e7ece5] bg-white"><div className="mx-auto flex max-w-7xl flex-col gap-6 px-5 py-8 sm:flex-row sm:items-center sm:justify-between lg:px-8"><Link href="/" className="flex items-center gap-2 text-sm font-extrabold text-[#284432]"><span className="flex h-8 w-8 items-center justify-center rounded-[11px] bg-[#176b52] text-white"><FontAwesomeIcon icon={faSeedling}/></span>freshflow<span className="text-[#79a985]">.</span></Link><p className="text-[10px] text-[#89958b]">Thực phẩm tươi lành, mỗi ngày.  FreshFlow</p><div className="flex gap-5 text-[10px] font-semibold text-[#718075]"><Link href="/help" className="hover:text-[#176b52]">Trợ giúp</Link><Link href="/login" className="hover:text-[#176b52]">Tài khoản</Link><Link href="/orders" className="hover:text-[#176b52]">Đơn hàng</Link></div></div></footer>
  </main>;
}
