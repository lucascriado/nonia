"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronsUpDown, LoaderCircle, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  AuthError,
  createOrganization,
  listOrganizations,
  switchOrganization,
  type MembershipOrganization,
} from "@/components/auth/session";
import { useSession } from "@/components/current-user";
import { initialsFrom } from "@/components/avatar";

/**
 * Troca a igreja ativa, no lugar do cartão de espaço de trabalho.
 *
 * TROCAR OU CRIAR RECARREGA A PÁGINA. Não é preguiça de atualizar em memória:
 * trocar de organização troca a SESSÃO inteira, e com ela o papel, as
 * permissões, o plano, o estado de cobrança e o conteúdo de toda listagem
 * aberta. A resposta do switch nem devolve o plano - só o GET da sessão devolve.
 * Reconciliar tudo isso à mão deixaria a porta aberta para o pior defeito que
 * este produto pode ter: dado de uma igreja aparecendo sob o nome de outra.
 * Recarregar garante que não sobra nada da anterior.
 *
 * A SESSÃO ANTERIOR É REVOGADA na troca. Não guarde o cookie de antes para
 * "voltar rápido": ele responde 401. Toda volta é uma troca nova.
 *
 * Vai para o painel, e não para a tela atual: o papel na outra igreja pode não
 * dar acesso a ela. Painel é a única que todo papel enxerga.
 */
export function OrganizationSwitcher() {
  const { organization, organizations } = useSession();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [papeis, setPapeis] = useState<MembershipOrganization[] | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useAnnouncement();

  useEffect(() => {
    if (!open) return;
    function closeOnOutside(event: PointerEvent) {
      if (event.target instanceof Node && !ref.current?.contains(event.target)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  // O papel em cada igreja só existe no GET /api/organizations, e só interessa
  // com a lista aberta: buscar ao abrir evita uma requisição por tela carregada
  // para desenhar uma legenda. Se falhar, a lista da sessão ainda serve para
  // trocar - fica sem a legenda, e trocar é o que importa.
  useEffect(() => {
    if (!open || papeis) return;
    listOrganizations().then((data) => setPapeis(data.organizations)).catch(() => undefined);
  }, [open, papeis]);

  async function choose(slug: string) {
    if (busy || slug === organization?.slug) return setOpen(false);
    setBusy(true);
    try {
      const nova = await switchOrganization({ organizationSlug: slug });
      goToPainel(nova.organization.name);
    } catch (error) {
      toast.error(error instanceof AuthError ? error.message : "Não foi possível trocar de igreja.");
      setBusy(false);
      setOpen(false);
    }
  }

  const lista: { id: string; name: string; slug: string; roleName?: string }[] =
    papeis ?? organizations.map((item) => ({ ...item, roleName: undefined }));

  return (
    <div className="workspace-switcher" ref={ref}>
      <button
        aria-expanded={open}
        aria-haspopup="listbox"
        className="workspace-card"
        onClick={() => setOpen((value) => !value)}
        title="Trocar de igreja"
        type="button"
      >
        <span className="workspace-avatar" aria-hidden>{initialsFrom(organization?.name ?? "Nonia")}</span>
        <span><strong>{organization?.name ?? "Sua igreja"}</strong><small>Trocar de igreja</small></span>
        {busy ? <LoaderCircle className="button-spinner" aria-hidden /> : <ChevronsUpDown aria-hidden />}
      </button>

      {open && (
        <div className="workspace-menu">
          <ul className="workspace-list" role="listbox" aria-label="Suas igrejas">
            {lista.map((item) => {
              const current = item.slug === organization?.slug;
              return (
                <li key={item.id}>
                  <button
                    aria-selected={current}
                    disabled={busy}
                    onClick={() => choose(item.slug)}
                    role="option"
                    type="button"
                  >
                    <span className="workspace-avatar" aria-hidden>{initialsFrom(item.name)}</span>
                    <span>{item.name}{item.roleName && <small>{item.roleName}</small>}</span>
                    {current && <Check aria-hidden />}
                  </button>
                </li>
              );
            })}
          </ul>
          <button className="workspace-new" disabled={busy} onClick={() => { setOpen(false); setCreating(true); }} type="button">
            <Plus aria-hidden />Criar nova igreja
          </button>
        </div>
      )}

      {creating && <NewOrganizationDialog onClose={() => setCreating(false)} />}
    </div>
  );
}

/**
 * Criar já muda a igreja da sessão, então o diálogo diz isso ANTES de criar.
 * Avisar depois seria avisar tarde: o efeito é imediato e não tem desfazer.
 *
 * Pede só o nome. CNPJ, e-mail e telefone são opcionais na rota e ficam em
 * Configurações - formulário de seis campos para um passo que a pessoa quer
 * atravessar é o oposto do que ela veio fazer.
 */
function NewOrganizationDialog({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  // Esc fecha, como o clique fora. Enquanto salva não fecha: a igreja pode já
  // ter sido criada, e sumir com o diálogo esconderia a troca que vem a seguir.
  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !saving) onClose();
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose, saving]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving || !name.trim()) return;
    setSaving(true);
    try {
      const sessao = await createOrganization({ organizationName: name.trim() });
      goToPainel(sessao.organization.name);
    } catch (error) {
      toast.error(error instanceof AuthError ? error.message : "Não foi possível criar a igreja.");
      setSaving(false);
    }
  }

  // Portal para o body: o seletor mora DENTRO da barra lateral, que no celular
  // é transformada, e um `position: fixed` ali dentro se mede pela barra em vez
  // da janela -- o diálogo apareceria de lado, ou fora da tela com a barra
  // fechada. Ver o comentário de .org-dialog-layer em globals.css.
  return createPortal(
    <div className="org-dialog-layer" onPointerDown={(event) => !saving && event.currentTarget === event.target && onClose()}>
      <section aria-labelledby="nova-igreja" aria-modal="true" className="org-dialog" role="dialog">
        <form onSubmit={submit}>
          <div className="org-dialog-body">
            <h2 id="nova-igreja">Criar nova igreja</h2>
            <p>A nova igreja começa vazia, no plano Semente, e o papel de proprietário fica com você. Assim que ela for criada o sistema passa a trabalhar nela. A igreja atual continua intacta, e você volta por este mesmo seletor.</p>
            <label>
              <span>Nome da igreja</span>
              <input autoFocus onChange={(event) => setName(event.target.value)} placeholder="Ex.: Igreja Batista Central" required value={name} />
            </label>
          </div>
          <footer>
            <button disabled={saving} onClick={onClose} type="button">Cancelar</button>
            <button aria-busy={saving} className="primary-action" disabled={saving || !name.trim()} type="submit">
              {saving ? <LoaderCircle className="button-spinner" aria-hidden /> : <Plus aria-hidden />}
              {saving ? "Criando..." : "Criar igreja"}
            </button>
          </footer>
        </form>
      </section>
    </div>,
    document.body,
  );
}

const AVISO = "nonia:igreja-ativa";

/**
 * A confirmação precisa atravessar um recarregamento inteiro: quem troca sai
 * desta página. Guardar no `sessionStorage` e mostrar do outro lado é o que
 * faz a mensagem aparecer na igreja de que ela fala, e não na que ficou para
 * trás. Fica na aba e some ao ser lida.
 */
function goToPainel(name: string) {
  try {
    sessionStorage.setItem(AVISO, name);
  } catch {
    // Aba anônima ou armazenamento bloqueado: sem aviso, mas a troca vale.
  }
  window.location.assign("/painel");
}

function useAnnouncement() {
  useEffect(() => {
    let name: string | null = null;
    try {
      name = sessionStorage.getItem(AVISO);
      if (name) sessionStorage.removeItem(AVISO);
    } catch {
      return;
    }
    if (name) toast.success(`Você está agora em ${name}`);
  }, []);
}
