'use client';

import React from 'react';
import Link from 'next/link';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowRight, faComments, faHeadset, faShieldHeart, faTruckFast } from '@fortawesome/free-solid-svg-icons';

export function Help({ onOpenChat }: { onOpenChat?: () => void }) {
  const guides = [
    {
      title: 'Hướng dẫn đặt hàng & Giá theo nhóm',
      description: 'Tìm hiểu quy trình chọn nông sản theo lô tươi mới mỗi ngày, áp dụng ưu đãi nhóm khách hàng (Sinh viên, Người đi làm, Tập thể) và theo dõi đơn hàng.',
      href: '/help/order-guide',
    },
    {
      title: 'Điểm giao tập trung & Vận chuyển',
      description: 'So sánh nhận hàng miễn phí tại Điểm giao tập trung và Giao tận nơi qua đội ngũ Shipper FreshFlow.',
      href: '/help/delivery-guide',
    },
  ];

  const faqs = [
    {
      q: 'Làm thế nào để được hưởng chính sách Giá theo nhóm (Sinh viên, Cư dân, Tập thể)?',
      a: 'Mỗi tài khoản khách hàng được phân vào một nhóm ưu đãi (STUDENT, WORKING, GROUP_A, GROUP_B, COLLECTIVE). Khi bạn xem Bảng tin Newfeed hoặc Cửa hàng nông sản, hệ thống tự động áp dụng mức giá ưu đãi tương ứng với nhóm của bạn.',
    },
    {
      q: 'Tôi có thể hủy đơn hàng sau khi đặt không?',
      a: 'Bạn có thể chủ động nhấn nút "Hủy đơn" ngay trong danh sách Đơn hàng hoặc Chi tiết đơn hàng khi đơn đang ở trạng thái "Chờ xác nhận". Khi hủy, số lượng nông sản sẽ tự động hoàn trả lại lô hàng.',
    },
    {
      q: 'Điểm giao tập trung hoạt động như thế nào?',
      a: 'Khi chọn "Điểm giao tập trung" lúc thanh toán, bạn được miễn phí vận chuyển (0₫). Cửa hàng (Shop) sẽ đóng gói và tập kết nông sản tại điểm nhận; bạn chỉ cần đến nhận hàng và Shop sẽ xác nhận hoàn tất ngay trên hệ thống.',
    },
    {
      q: 'Làm sao để xem phản hồi của Shop sau khi tôi đánh giá đơn hàng?',
      a: 'Bạn chỉ cần mở mục "Đơn hàng của tôi", bấm vào "Chi tiết" của đơn hàng đã "Hoàn thành". Tại đây hiển thị đầy đủ đánh giá của bạn và phần phản hồi trực tiếp từ Cửa hàng (Shop).',
    },
    {
      q: 'Nếu mặt hàng nông sản tôi cần chưa có trên kệ thì sao?',
      a: 'Bạn hãy vào mục "Yêu cầu mặt hàng" và bấm "Tạo yêu cầu mặt hàng" (nhập tên nông sản, danh mục, số lượng mong muốn). Cửa hàng và Admin sẽ tìm nguồn cung và gửi báo giá trực tiếp để bạn xác nhận.',
    },
    {
      q: 'Chính sách đảm bảo độ tươi & đổi trả trong ngày như thế nào?',
      a: 'FreshFlow cam kết nông sản thu hoạch theo đợt (Batch) trong ngày. Nếu sản phẩm bị dập nát hoặc không đúng mô tả khi nhận, bạn có thể nhắn tin trực tiếp với Shop qua "Trò chuyện Realtime" để được bù hàng hoặc hoàn tiền 100%.',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Banner Hỗ trợ nhanh */}
      <section className="rounded-2xl bg-gradient-to-r from-[#176b52] to-[#2b8268] p-6 text-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="max-w-xl space-y-1.5">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-0.5 text-[11px] font-bold">
              <FontAwesomeIcon icon={faHeadset} /> Trung tâm Chăm sóc Khách hàng FreshFlow 24/7
            </span>
            <h2 className="text-xl font-extrabold">Chúng tôi có thể giúp gì cho bạn hôm nay?</h2>
            <p className="text-xs text-white/85">
              Tra cứu nhanh quy trình đặt nông sản theo nhóm, chính sách điểm giao tập trung, đổi trả trong ngày hoặc kết nối trực tiếp với Cửa hàng & Quản trị viên.
            </p>
          </div>
          <div className="flex flex-wrap gap-2.5">
            {onOpenChat && (
              <button
                type="button"
                onClick={onOpenChat}
                className="flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs font-extrabold text-[#176b52] shadow hover:bg-slate-50"
              >
                <FontAwesomeIcon icon={faComments} />
                Chat trực tiếp với Hỗ trợ / Shop
              </button>
            )}
            <Link
              href="/requests"
              className="flex items-center gap-2 rounded-xl border border-white/40 bg-white/15 px-4 py-2.5 text-xs font-bold text-white hover:bg-white/25"
            >
              Gửi yêu cầu mặt hàng
            </Link>
          </div>
        </div>
      </section>

      {/* 3 Cards hướng dẫn */}
      <div className="grid gap-5 md:grid-cols-3">
        {guides.map(guide => (
          <section key={guide.href} className="panel flex flex-col justify-between p-5">
            <div>
              <h2 className="font-extrabold text-sm text-[#1e2d25]">{guide.title}</h2>
              <p className="mt-2 text-xs leading-relaxed text-slate-500">{guide.description}</p>
            </div>
            <Link href={guide.href} className="mt-4 inline-flex items-center gap-2 text-xs font-bold text-[#176b52] hover:underline">
              Xem hướng dẫn chi tiết <FontAwesomeIcon icon={faArrowRight} />
            </Link>
          </section>
        ))}

        <section className="panel flex flex-col justify-between p-5">
          <div>
            <h2 className="font-extrabold text-sm text-[#1e2d25]">Cam kết chất lượng & Hồ sơ</h2>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">
              Quản lý thông tin liên hệ, sổ địa chỉ nhận hàng mặc định và kiểm tra nhóm ưu đãi giá của tài khoản.
            </p>
            <div className="mt-3 space-y-1.5 text-[11px] text-[#3a5244]">
              <div className="flex items-center gap-2">
                <FontAwesomeIcon icon={faShieldHeart} className="text-[#176b52]" />
                <span>Cam kết 100% nông sản rõ nguồn gốc theo lô</span>
              </div>
              <div className="flex items-center gap-2">
                <FontAwesomeIcon icon={faTruckFast} className="text-[#176b52]" />
                <span>Giao đúng khung giờ đăng ký trong ngày</span>
              </div>
            </div>
          </div>
          <Link href="/profile" className="mt-4 inline-flex items-center gap-2 text-xs font-bold text-[#176b52] hover:underline">
            Mở hồ sơ & sổ địa chỉ <FontAwesomeIcon icon={faArrowRight} />
          </Link>
        </section>
      </div>

      {/* Câu hỏi thường gặp (FAQ) */}
      <section className="panel p-6">
        <div className="border-b border-[#edf2ee] pb-3">
          <h2 className="text-base font-extrabold text-[#1e2d25]">Câu hỏi thường gặp (FAQ)</h2>
          <p className="mt-0.5 text-xs text-slate-500">Giải đáp chi tiết các tình huống khi mua sắm và nhận hàng trên FreshFlow</p>
        </div>
        <div className="divide-y divide-[#f0f4f1] mt-2">
          {faqs.map(item => (
            <details key={item.q} className="group py-4 text-xs">
              <summary className="cursor-pointer font-bold text-[#1f2e26] group-hover:text-[#176b52]">
                {item.q}
              </summary>
              <p className="mt-2.5 leading-relaxed text-slate-600 bg-[#f8faf8] p-3.5 rounded-xl border border-[#e8ede8]">
                {item.a}
              </p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}

export function GuidePage({ type }: { type: 'orders' | 'delivery' }) {
  const orders = type === 'orders';
  const steps = orders
    ? [
        ['1', 'Chọn sản phẩm & Kiểm tra giá nhóm', 'Mở mục Bảng tin Newfeed hoặc Cửa hàng nông sản, chọn mặt hàng và thêm số lượng vào giỏ.'],
        ['2', 'Kiểm tra giỏ hàng', 'Xem lại số lượng, đơn giá ưu đãi theo nhóm khách hàng và điều chỉnh nếu cần.'],
        ['3', 'Xác nhận đơn & Thuế VAT', 'Chọn hình thức nhận hàng (Điểm giao tập trung hoặc Giao tận nơi), khung giờ giao và phương thức thanh toán.'],
        ['4', 'Theo dõi & Đánh giá', 'Mở Đơn hàng của tôi để xem lịch sử trạng thái, hủy đơn khi chờ xác nhận hoặc đánh giá & xem phản hồi từ Shop khi đơn hoàn thành.'],
      ]
    : [
        ['1', 'Chọn hình thức nhận hàng', 'Tại bước thanh toán, chọn "Điểm giao tập trung" (miễn phí giao) hoặc "Giao hàng tận nơi" qua Shipper.'],
        ['2', 'Kiểm tra địa chỉ nhận', 'Nếu chọn giao tận nơi, chọn địa chỉ đã lưu hoặc thêm địa chỉ mới trong mục Hồ sơ & Địa chỉ.'],
        ['3', 'Chọn khung giờ giao', 'Chọn khung giờ giao hàng phù hợp trong ngày. Phí giao hiển thị minh bạch trước khi đặt đơn.'],
        ['4', 'Nhận hàng & Đối soát', 'Theo dõi hành trình giao của Shipper hoặc nhận thông báo khi hàng đã tập kết tại Điểm giao tập trung.'],
      ];
  return (
    <article className="panel mx-auto max-w-3xl p-6 sm:p-8">
      <Link href="/help" className="text-xs font-semibold text-[#176b52]">
        ← Trung tâm trợ giúp
      </Link>
      <h2 className="mt-4 text-xl font-bold">{orders ? 'Hướng dẫn đặt hàng & Đánh giá' : 'Hướng dẫn giao nhận & Điểm tập trung'}</h2>
      <p className="mt-2 text-sm text-slate-500">
        {orders
          ? 'Làm theo các bước sau để tạo, theo dõi, hủy hoặc đánh giá đơn hàng nông sản.'
          : 'Chọn cách nhận hàng thuận tiện nhất và xem trước phí giao trước khi gửi đơn.'}
      </p>
      <ol className="mt-6 space-y-4">
        {steps.map(([number, title, description]) => (
          <li key={number} className="flex gap-4 rounded-xl border border-slate-100 p-4">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-sm font-bold text-emerald-800">
              {number}
            </span>
            <div>
              <h3 className="font-semibold">{title}</h3>
              <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p>
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link href={orders ? '/products' : '/profile'} className="rounded-xl bg-[#176b52] px-4 py-3 text-sm font-semibold text-white">
          {orders ? 'Xem sản phẩm' : 'Quản lý địa chỉ'}
        </Link>
        <Link href={orders ? '/orders' : '/checkout'} className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700">
          {orders ? 'Đơn hàng của tôi' : 'Tiếp tục thanh toán'}
        </Link>
      </div>
    </article>
  );
}
