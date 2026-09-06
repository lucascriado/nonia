import Link from "next/link";
import { Church } from "lucide-react";
import { marketingRoutes, signupHref } from "@/components/marketing/routes";

const columns = [
  {
    title: "Produto",
    links: [
      { label: "Recursos", href: "/#recursos" },
      { label: "Como funciona", href: "/#como-funciona" },
      { label: "Planos", href: marketingRoutes.pricing },
      { label: "Dúvidas frequentes", href: marketingRoutes.faq },
    ],
  },
  {
    title: "Comece agora",
    links: [
      { label: "Criar conta", href: signupHref() },
      { label: "Entrar", href: marketingRoutes.login },
      { label: "Falar com a gente", href: marketingRoutes.contact },
      { label: "Suporte", href: marketingRoutes.support },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="mk-footer">
      <div className="mk-container mk-footer-inner">
        <div className="mk-footer-brand">
          <Link className="mk-brand" href="/" aria-label="nonia — página inicial">
            <span className="mk-brand-icon" aria-hidden><Church /></span>
            <span className="mk-brand-text">nonia</span>
          </Link>
          <p>
            Plataforma de gestão ministerial para igrejas que querem cuidar de
            pessoas sem se perder em planilhas.
          </p>
        </div>

        {columns.map((column) => (
          <nav aria-label={column.title} className="mk-footer-column" key={column.title}>
            <strong>{column.title}</strong>
            {column.links.map((link) => (
              <Link href={link.href} key={link.label}>{link.label}</Link>
            ))}
          </nav>
        ))}
      </div>

      <div className="mk-container mk-footer-bottom">
        <small>© {new Date().getFullYear()} nonia.app — todos os direitos reservados.</small>
        <small>Feito no Brasil, em português.</small>
      </div>
    </footer>
  );
}
