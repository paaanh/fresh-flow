import FreshFlowShell from '@/features/freshflow-shell';

export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <FreshFlowShell />
      {children}
    </>
  );
}
