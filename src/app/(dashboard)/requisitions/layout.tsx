import { FeatureGate } from '@/components/billing/feature-gate'

export default function Layout({ children }: { children: React.ReactNode }) {
  return <FeatureGate feature="approvals" title="Requisitions">{children}</FeatureGate>
}
