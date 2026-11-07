'use client';
import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowRight, faSeedling } from '@fortawesome/free-solid-svg-icons';
import { freshflow, ApiError } from '@/lib/api';

export default function AuthForm({ page, notify, onRole }: { page: string; notify: (message: string) => void; onRole: (role: any) => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [group, setGroup] = useState('Sinh viên');
  const [roleSelection, setRoleSelection] = useState('CUSTOMER');
  const [otp, setOtp] = useState('');

  useEffect(() => {
    if (page === 'verify') setIdentifier(sessionStorage.getItem('freshflow-verify-phone') || '');
  }, [page]);

  const title = page === 'login' ? 'Chào mừng trở lại' : page === 'register' ? 'Tạo tài khoản FreshFlow' : page === 'verify' ? 'Xác minh số điện thoại' : 'Khôi phục mật khẩu';

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (page === 'login') {
        const user = await freshflow.login(identifier, password);
        const role = user.role?.toLowerCase() || 'customer';
        localStorage.setItem('freshflow-role', role);
        onRole(role);
        const requestedPath = sessionStorage.getItem('freshflow-after-login');
        sessionStorage.removeItem('freshflow-after-login');

        if (requestedPath?.startsWith('/') && !requestedPath.startsWith('//')) {
          router.push(requestedPath);
        } else if (role === 'admin') {
          router.push('/admin/dashboard');
        } else if (role === 'shop') {
          router.push('/shop');
        } else if (role === 'shipper') {
          router.push('/shipper');
        } else {
          router.push('/dashboard');
        }
      } else if (page === 'register') {
        await freshflow.register({
          full_name: name,
          phone: identifier || undefined,
          email,
          password,
          customer_group: group === 'Sinh viên' ? 'STUDENT' : group === 'Nhóm A' ? 'GROUP_A' : 'WORKING',
          role: roleSelection,
        });
        setSuccess('Đăng ký tài khoản thành công! Đang chuyển đến đăng nhập...');
        setTimeout(() => router.push('/login'), 1200);
      } else if (page === 'verify') {
        setError('Hiện chưa hỗ trợ xác minh OTP.');
      } else {
        setError('Hiện chưa hỗ trợ khôi phục mật khẩu.');
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Có lỗi xảy ra. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen bg-white lg:grid-cols-2">
      <aside className="relative hidden overflow-hidden bg-white p-12 lg:flex lg:flex-col lg:justify-between">
        <Link href="/dashboard" className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-[#176b52] text-white">
            <FontAwesomeIcon icon={faSeedling} />
          </span>
          <b className="text-xl">freshflow.</b>
        </Link>
        <div className="relative z-10 max-w-md">
          <span className="rounded-full bg-white px-3 py-1 text-[10px] font-bold tracking-widest text-[#4e7958]">TƯƠI MỖI NGÀY</span>
          <h1 className="mt-5 text-5xl font-extrabold leading-tight text-[#254833]">Thực phẩm tươi.<br />Cuộc sống xanh.</h1>
          <p className="mt-4 leading-relaxed text-[#67816c]">Hệ thống kết nối Nông sản tươi - Đặt hàng theo nhóm - Quản lý Cửa hàng & Giao nhận chuyên nghiệp.</p>

        </div>
        <div className="text-xs text-[#829487]">FreshFlow · Nông sản tươi, mỗi ngày</div>
      </aside>

      <main className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-[420px]">
          <Link href="/dashboard" className="mb-8 flex items-center gap-3 lg:hidden">
            <span className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-[#176b52] text-white">
              <FontAwesomeIcon icon={faSeedling} />
            </span>
            <b className="text-xl">freshflow.</b>
          </Link>
          <div className="text-[11px] font-bold uppercase tracking-[.14em] text-[#80a189]">
            {page === 'register' ? 'BẮT ĐẦU MIỄN PHÍ' : 'XIN CHÀO BẠN'}
          </div>
          <h2 className="mt-2 text-2xl font-extrabold">{title}</h2>
          <p className="mt-1 text-xs text-slate-500">
            {page === 'login' ? 'Đăng nhập vào hệ thống FreshFlow để quản lý hoặc mua sắm.' : 'Điền thông tin bên dưới để tiếp tục.'}
          </p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            {page === 'register' && (
              <>
                <label className="block text-xs font-semibold">
                  Vai trò đăng ký
                  <select
                    value={roleSelection}
                    onChange={e => setRoleSelection(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-[#d2ddd5] p-2.5 text-xs focus:border-[#176b52] focus:outline-none"
                  >
                    <option value="CUSTOMER">Khách hàng mua nông sản</option>
                    <option value="SHOP">Cửa hàng / Nhà vườn bán hàng</option>
                    <option value="SHIPPER">Tài xế giao hàng (Shipper)</option>
                  </select>
                </label>

                <label className="block text-xs font-semibold">
                  Họ và tên
                  <input
                    required
                    value={name}
                    onChange={e => setName(e.target.value)}
                    autoComplete="name"
                    className="mt-1.5 w-full rounded-xl border border-[#d2ddd5] p-2.5 text-xs outline-none focus:border-[#8bb59a]"
                    placeholder="Nguyễn Ngọc Anh"
                  />
                </label>
                <label className="block text-xs font-semibold">
                  Email
                  <input
                    required
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    autoComplete="email"
                    className="mt-1.5 w-full rounded-xl border border-[#d2ddd5] p-2.5 text-xs outline-none focus:border-[#8bb59a]"
                    placeholder="ban@email.com"
                  />
                </label>
              </>
            )}

            {page !== 'verify' && (
              <label className="block text-xs font-semibold">
                {page === 'register' ? 'Số điện thoại' : 'Email hoặc số điện thoại'}
                <input
                  required={page !== 'register'}
                  value={identifier}
                  onChange={e => setIdentifier(e.target.value)}
                  autoComplete="username"
                  className="mt-1.5 w-full rounded-xl border border-[#d2ddd5] p-2.5 text-xs outline-none focus:border-[#8bb59a]"
                  placeholder={page === 'register' ? '090 123 4567' : 'email@example.com hoặc 090...'}
                />
              </label>
            )}

            {(page === 'login' || page === 'verify' || page === 'register') && (
              <label className="block text-xs font-semibold">
                {page === 'verify' ? 'Tạo mật khẩu' : 'Mật khẩu'}
                <input
                  required
                  minLength={page === 'login' ? 1 : 6}
                  maxLength={128}
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete={page === 'login' ? 'current-password' : 'new-password'}
                  className="mt-1.5 w-full rounded-xl border border-[#d2ddd5] p-2.5 text-xs outline-none focus:border-[#8bb59a]"
                  placeholder={page === 'login' ? 'Mật khẩu' : 'Tối thiểu 6 ký tự'}
                />
              </label>
            )}

            {page === 'register' && roleSelection === 'CUSTOMER' && (
              <label className="block text-xs font-semibold">
                Nhóm khách hàng
                <select
                  value={group}
                  onChange={e => setGroup(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-[#d2ddd5] p-2.5 text-xs"
                >
                  <option>Sinh viên</option>
                  <option>Người đi làm</option>
                  <option>Nhóm A</option>
                </select>
              </label>
            )}

            {page === 'login' && (
              <div className="flex justify-end text-xs">
                <Link href="/forgot" className="font-semibold text-[#176b52]">Quên mật khẩu?</Link>
              </div>
            )}

            {error && <div role="alert" className="rounded-xl bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-700">{error}</div>}
            {success && <div role="status" className="rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs text-emerald-700">{success}</div>}

            <button
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#176b52] py-3 text-xs font-bold text-white shadow hover:bg-[#125340] disabled:opacity-60"
            >
              {busy ? 'Đang xử lý…' : page === 'login' ? 'Đăng nhập ngay' : 'Tạo tài khoản'}
              {!busy && <FontAwesomeIcon icon={faArrowRight} />}
            </button>
          </form>


          <p className="mt-5 text-center text-xs text-slate-500">
            {page === 'login' ? 'Chưa có tài khoản?' : 'Đã có tài khoản?'}{' '}
            <Link className="font-bold text-[#176b52] hover:underline" href={page === 'login' ? '/register' : '/login'}>
              {page === 'login' ? 'Đăng ký ngay' : 'Đăng nhập'}
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
