import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import "./marketing.css";

// Liga as animações de entrada antes da primeira pintura. Sem este atributo
// nada é escondido - quem desativou JavaScript ou pediu `prefers-reduced-motion`
// recebe a página inteira já visível, sem depender do IntersectionObserver.
const motionInitScript = `try{if(!matchMedia("(prefers-reduced-motion: reduce)").matches)document.documentElement.dataset.motion="on";}catch(e){}`;

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mk-page">
      <script dangerouslySetInnerHTML={{ __html: motionInitScript }} />
      <SiteHeader />
      {children}
      <SiteFooter />
    </div>
  );
}
