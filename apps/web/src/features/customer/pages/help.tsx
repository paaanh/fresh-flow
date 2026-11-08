'use client';

import React from 'react';
import Link from 'next/link';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowRight } from '@fortawesome/free-solid-svg-icons';

export function Help() {
  const guides = [
    { title: 'Đơn hàng', description: 'Tìm hiểu cách đặt hàng, theo dõi trạng thái và quản lý đơn.', href: '/help/order-guide' },
    { title: 'Giao hàng', description: 'Thông tin về điểm giao tập trung, phí giao và lịch nhận.', href: '/help/delivery-guide' },
  ];
  return <div className="grid gap-5 md:grid-cols-3">
    {guides.map(guide => <section key={guide.href} className="panel p-5"><h2 className="font-bold">{guide.title}</h2><p className="mt-2 text-xs leading-relaxed text-slate-500">{guide.description}</p><Link href={guide.href} className="mt-4 inline-flex items-center gap-2 text-xs font-bold text-[#176b52]">Xem hướng dẫn <FontAwesomeIcon icon={faArrowRight} /></Link></section>)}
    <section className="panel p-5"><h2 className="font-bold">Hỗ trợ tài khoản</h2><p className="mt-2 text-xs leading-relaxed text-slate-500">Cập nhật thông tin và địa chỉ nhận hàng của bạn.</p><Link href="/profile" className="mt-4 inline-block text-xs font-bold text-[#176b52]">Mở hồ sơ</Link></section>
    <section className="panel p-5 md:col-span-3"><h2 className="font-bold">Câu hỏi thường gặp</h2>{['Làm thế nào để thay đổi địa chỉ giao hàng?', 'Tôi có thể hủy đơn hàng khi nào?', 'Giá dành cho nhóm sinh viên được áp dụng ra sao?'].map(question => <details key={question} className="border-b py-4 text-xs"><summary className="cursor-pointer font-semibold">{question}</summary><p className="mt-3 text-slate-500">Bạn có thể xem trạng thái đơn trong mục Đơn hàng. Địa chỉ nhận có thể cập nhật tại Hồ sơ & địa chỉ.</p></details>)}</section>
  </div>;
}

export function GuidePage({ type }: { type: 'orders' | 'delivery' }) {
  const orders = type === 'orders';
  const steps = orders ? [
    ['1', 'Chọn sản phẩm', 'Mở mục Sản phẩm, chọn mặt hàng và thêm số lượng vào giỏ.'],
    ['2', 'Kiểm tra giỏ hàng', 'Xem lại số lượng, giá tạm tính và bỏ mặt hàng nếu cần.'],
    ['3', 'Xác nhận đơn', 'Chọn hình thức nhận hàng, địa chỉ và khung giao; thêm ghi chú nếu cần.'],
    ['4', 'Theo dõi trạng thái', 'Mở Đơn hàng của tôi để xem cập nhật từ cửa hàng.'],
  ] : [
    ['1', 'Chọn cách nhận hàng', 'Tại bước thanh toán, chọn nhận tại điểm giao tập trung hoặc giao đến địa chỉ.'],
    ['2', 'Kiểm tra địa chỉ', 'Nếu chọn giao tận nơi, chọn địa chỉ đã lưu hoặc thêm địa chỉ trong Hồ sơ & địa chỉ.'],
    ['3', 'Chọn khung giao', 'Chọn khung giao phù hợp. Phí giao hiển thị theo khung và được tính vào tổng dự kiến.'],
    ['4', 'Theo dõi đơn', 'Xem trạng thái đơn hàng trong Đơn hàng của tôi và chờ cửa hàng xác nhận.'],
  ];
  return <article className="panel mx-auto max-w-3xl p-6 sm:p-8"><Link href="/help" className="text-xs font-semibold text-[#176b52]">← Trung tâm trợ giúp</Link><h2 className="mt-4 text-xl font-bold">{orders ? 'Hướng dẫn đặt hàng' : 'Hướng dẫn giao hàng'}</h2><p className="mt-2 text-sm text-slate-500">{orders ? 'Làm theo các bước sau để tạo và theo dõi đơn hàng.' : 'Chọn cách nhận hàng và xem trước phí giao trước khi gửi đơn.'}</p><ol className="mt-6 space-y-4">{steps.map(([number, title, description]) => <li key={number} className="flex gap-4 rounded-xl border border-slate-100 p-4"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-sm font-bold text-emerald-800">{number}</span><div><h3 className="font-semibold">{title}</h3><p className="mt-1 text-sm leading-6 text-slate-500">{description}</p></div></li>)}</ol><div className="mt-6 flex flex-wrap gap-3"><Link href={orders ? '/products' : '/profile'} className="rounded-xl bg-[#176b52] px-4 py-3 text-sm font-semibold text-white">{orders ? 'Xem sản phẩm' : 'Quản lý địa chỉ'}</Link><Link href={orders ? '/orders' : '/checkout'} className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700">{orders ? 'Đơn hàng của tôi' : 'Tiếp tục thanh toán'}</Link></div></article>;
}
