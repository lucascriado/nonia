"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Header } from "@/components/header";
import { Sidebar } from "@/components/sidebar";
import { CurrentUserProvider } from "@/components/current-user";
import type { SessionPayload } from "@/components/auth/session";
import { Toaster } from "sonner";

const sidebarStorageKey = "nonia-sidebar-collapsed";

export function DashboardShell({
  children,
  title,
  session,
}: {
  children: React.ReactNode;
  title: string;
  /**
   * Sessão já resolvida. Fora ela, o provider sonda `GET /api/auth/session`
   * sozinho; este prop existe para quando a sessão vier do servidor.
   */
  session?: SessionPayload;
}) {
  const sidebarRef = useRef<HTMLElement>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useLayoutEffect(() => {
    const node = sidebarRef.current;
    if (node) node.classList.add("sidebar-no-transition");
    setSidebarCollapsed(window.localStorage.getItem(sidebarStorageKey) === "true");
    if (node) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          node.classList.remove("sidebar-no-transition");
        });
      });
    }
  }, []);

  function collapseSidebar(value: boolean) {
    setSidebarCollapsed(value);
    window.localStorage.setItem(sidebarStorageKey, String(value));
  }

  useEffect(() => {
    function closeSidebarOnOutsideClick(event: PointerEvent) {
      if (!(event.target instanceof Element)) return;
      const target = event.target;

      if (sidebarRef.current?.contains(target) || target.closest("[data-sidebar-trigger]")) return;

      if (window.matchMedia("(max-width: 800px)").matches) {
        setMobileOpen(false);
        return;
      }

      collapseSidebar(true);
    }

    function closeSidebarOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setMobileOpen(false);
      collapseSidebar(true);
    }

    document.addEventListener("pointerdown", closeSidebarOnOutsideClick);
    document.addEventListener("keydown", closeSidebarOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeSidebarOnOutsideClick);
      document.removeEventListener("keydown", closeSidebarOnEscape);
    };
  }, []);

  return (
    <CurrentUserProvider session={session}>
      <input checked={mobileOpen} className="menu-toggle" id="menu-toggle" onChange={(event) => setMobileOpen(event.target.checked)} type="checkbox" />
      <input checked={sidebarCollapsed} className="sidebar-collapse" id="sidebar-collapse" onChange={(event) => collapseSidebar(event.target.checked)} type="checkbox" />
      <Sidebar sidebarRef={sidebarRef} />
      <label className="menu-overlay" htmlFor="menu-toggle" aria-label="Fechar menu" data-sidebar-trigger />
      <Header title={title} />
      {children}
      <Toaster position="top-right" richColors closeButton />
    </CurrentUserProvider>
  );
}
