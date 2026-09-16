import { FeatureGate } from '@/components/billing/feature-gate'

export default function Layout({ children }: { children: React.ReactNode }) {
  return <FeatureGate feature="job_costing" title="Cost Analysis">{children}</FeatureGate>
}
