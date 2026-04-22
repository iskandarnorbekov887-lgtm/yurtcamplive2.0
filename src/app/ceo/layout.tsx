import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'CEO Command Center | Isky Camp Flow',
  description: 'Executive dashboard for Isky Camp management. Monitor occupancy, finances, and team performance.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function CEOLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
