"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Church, Menu, X } from "lucide-react";
import { marketingRoutes, signupHref } from "@/components/marketing/routes";

// Tudo em minúsculo, acompanhando o "nonia" da marca.
const navLinks = [
  { label: "recursos", href: "/#recursos" },
  { label: "como funciona", href: "/#como-funciona" },
  { label: "planos", href: "/#planos" },
  { label: "dúvidas", href: marketingRoutes.faq },
];

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 8);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // O menu mobile é um overlay em tela cheia; travar o scroll do corpo evita
  // o conteúdo deslizando por trás dele.
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <header className={`mk-header${scrolled ? " is-scrolled" : ""}`}>
      <div className="mk-header-inner">
        <Link className="mk-brand" href="/" aria-label="nonia - página inicial">
          <span className="mk-brand-icon" aria-hidden><Church /></span>
          <span className="mk-brand-text">nonia</span>
        </Link>

        <nav className="mk-nav" aria-label="Navegação principal">
          {navLinks.map((link) => (
            <Link href={link.href} key={link.href}>{link.label}</Link>
          ))}
        </nav>

        <div className="mk-header-actions">
          {/* O emoji é decorativo: `aria-hidden` para o leitor de tela não ler
              "porta" antes de "entrar". */}
          <Link className="mk-link-button" href={marketingRoutes.login}>
            <span aria-hidden>🔑</span> entrar
          </Link>
          <Link className="mk-button mk-button-primary mk-button-sm" href={signupHref()}>
            <span aria-hidden>✨</span> criar conta
          </Link>
        </div>

        <button
          aria-controls="mk-mobile-nav"
          aria-expanded={open}
          aria-label={open ? "Fechar menu" : "Abrir menu"}
          className="mk-menu-button"
          onClick={() => setOpen((value) => !value)}
          type="button"
        >
          {open ? <X /> : <Menu />}
        </button>
      </div>

      <div className="mk-mobile-nav" hidden={!open} id="mk-mobile-nav">
        <nav aria-label="Navegação principal (mobile)">
          {navLinks.map((link) => (
            <Link href={link.href} key={link.href} onClick={() => setOpen(false)}>{link.label}</Link>
          ))}
        </nav>
        <div className="mk-mobile-actions">
          <Link className="mk-button mk-button-ghost" href={marketingRoutes.login}>
            <span aria-hidden>🔑</span> entrar
          </Link>
          <Link className="mk-button mk-button-primary" href={signupHref()}>
            <span aria-hidden>✨</span> criar conta
          </Link>
        </div>
      </div>
    </header>
  );
}
