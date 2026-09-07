"use client";

import { useEffect, useState } from "react";
import { Church, Info, Lock, LoaderCircle, Pencil } from "lucide-react";
import { toast } from "sonner";
import { AuthAlert } from "@/components/auth/auth-alert";
import { AuthField } from "@/components/auth/auth-field";
import { AuthError, apiRequest } from "@/components/auth/session";
import { usePermission, useReadOnly } from "@/components/current-user";
import { maskPhone } from "@/components/masks";

type Organization = {
  id: string;
  name: string;
  slug: string;
  document: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  createdAt: string;
};

function getOrganization() {
  return apiRequest<Organization>("/api/organization");
}

function updateOrganization(changes: { name?: string; document?: string | null; email?: string | null; phone?: string | null }) {
  return apiRequest<Organization>("/api/organization", { method: "PATCH", body: JSON.stringify(changes) });
}

/**
 * Dados da igreja.
 *
 * Diferente do perfil: editar aqui É escrita da organização e o servidor
 * bloqueia em somente leitura com 402. O perfil não — nome e foto são da
 * pessoa, não da igreja.
 */
export function OrganizationPanel() {
  // Duas guardas, e são coisas diferentes: papel é quem pode, somente leitura
  // é quando ninguém pode. Sem a segunda, o botão aparecia para o proprietário
  // de uma igreja inadimplente, abria o formulário e o PATCH voltava 402.
  const readOnly = useReadOnly();
  const podeEditar = usePermission("organization.write");
  const canEdit = podeEditar && !readOnly;
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState({ name: "", document: "", email: "", phone: "" });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    getOrganization()
      .then((data) => active && setOrganization(data))
      .catch(() => active && setOrganization(null));
    return () => { active = false; };
  }, []);

  if (!organization) return null;

  function startEditing() {
    setValues({
      name: organization!.name,
      document: organization!.document ?? "",
      email: organization!.email ?? "",
      phone: organization!.phone ?? "",
    });
    setError(null);
    setEditing(true);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    if (!values.name.trim()) {
      setError("Informe o nome da igreja.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      // Campo vazio vira `null`, que é como o servidor limpa o valor.
      const updated = await updateOrganization({
        name: values.name.trim(),
        document: values.document.trim() || null,
        email: values.email.trim() || null,
        phone: values.phone.trim() || null,
      });
      setOrganization(updated);
      setEditing(false);
      toast.success("Dados da igreja atualizados.");
    } catch (caught) {
      setError(caught instanceof AuthError ? caught.message : "Não foi possível salvar os dados da igreja.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className="org-panel">
      <header>
        <span aria-hidden><Church /></span>
        <div>
          <h3>Dados da igreja</h3>
          <p>Aparecem nos relatórios e nos arquivos exportados.</p>
        </div>
      </header>

      {editing ? (
        <form className="org-form" noValidate onSubmit={save}>
          <AuthAlert message={error} />

          <AuthField label="Nome da igreja" onChange={(e) => setValues((c) => ({ ...c, name: e.target.value }))} value={values.name} />
          {/* SEM máscara e SEM filtrar para dígito: desde 31/07/2026 a Receita
              emite CNPJ alfanumérico, com letras nas 12 primeiras posições.
              Uma máscara de números recusaria o documento de qualquer igreja
              aberta de agosto em diante. Quem valida é o servidor. */}
          <AuthField
            autoCapitalize="characters"
            hint="Opcional. Aceita CNPJ (inclusive o novo, com letras) ou o CPF do responsável."
            label="CNPJ ou CPF do responsável"
            maxLength={18}
            onChange={(e) => setValues((c) => ({ ...c, document: e.target.value.toUpperCase() }))}
            value={values.document}
          />
          <AuthField
            inputMode="email"
            label="E-mail de contato"
            onChange={(e) => setValues((c) => ({ ...c, email: e.target.value }))}
            type="email"
            value={values.email}
          />
          <AuthField
            inputMode="tel"
            label="Telefone"
            maxLength={16}
            onChange={(e) => setValues((c) => ({ ...c, phone: maskPhone(e.target.value) }))}
            value={values.phone}
          />

          {/* O identificador não é editável porque ele nomeia os arquivos
              exportados e vale como identificador no login. Fica visível com o
              motivo, em vez de virar um campo desabilitado sem explicação. */}
          <p className="profile-locked-field">
            <Info aria-hidden />
            <span>
              <strong>{organization.slug}</strong>
              Este é o identificador da igreja. Ele nomeia os arquivos que você exporta e serve para
              entrar, por isso não muda.
            </span>
          </p>

          <div className="profile-edit-actions">
            <button disabled={saving} onClick={() => setEditing(false)} type="button">Cancelar</button>
            <button className="primary-action" disabled={saving} type="submit">
              {saving ? <><LoaderCircle className="button-spinner" aria-hidden /> Salvando…</> : "Salvar"}
            </button>
          </div>
        </form>
      ) : (
        <div className="org-view">
          <Row label="Nome" value={organization.name} />
          <Row label="Identificador" value={organization.slug} />
          <Row label="CNPJ ou CPF" value={organization.document} />
          <Row label="E-mail de contato" value={organization.email} />
          <Row label="Telefone" value={organization.phone} />
          {canEdit && (
            <button className="profile-secondary-action" onClick={startEditing} type="button">
              <Pencil aria-hidden />Editar dados da igreja
            </button>
          )}
          {/* Diz por que não dá, em vez de simplesmente não ter botão: quem
              administra a igreja vem aqui justamente para editar. */}
          {readOnly && podeEditar && (
            <p className="org-readonly">
              <Lock aria-hidden />
              <span>Os dados da igreja não podem ser alterados enquanto a conta estiver em somente leitura. Regularize a mensalidade para voltar a editar.</span>
            </p>
          )}
        </div>
      )}
    </article>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="org-row">
      <span>{label}</span>
      <strong className={value ? undefined : "profile-info-empty"}>{value ?? "Não informado"}</strong>
    </div>
  );
}
