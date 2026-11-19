import { RequireUser } from '@/components/shells';

export default function BusinessLayout({ children }: { children: React.ReactNode }) {
  return <RequireUser type="SHOPKEEPER">{children}</RequireUser>;
}
