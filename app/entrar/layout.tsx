import { MarketingFrame } from "@/components/marketing/marketing-frame";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <MarketingFrame>{children}</MarketingFrame>;
}
