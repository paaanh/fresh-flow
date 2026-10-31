'use client';

import AuthForm from '@/features/auth-form';

export default function PublicAuthPage({ page }: { page: string }) {
  return <AuthForm page={page} notify={() => {}} onRole={() => {}} />;
}
