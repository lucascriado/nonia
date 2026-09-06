"use client";

import { useRef, useState } from "react";
import { Camera, LoaderCircle, Mail, Pencil, Phone, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Avatar } from "@/components/avatar";
import { AuthAlert } from "@/components/auth/auth-alert";
import { AuthField } from "@/components/auth/auth-field";
import { ChangePasswordForm } from "@/components/auth/change-password-form";
import { AuthError, updateProfile } from "@/components/auth/session";
import { useSession } from "@/components/current-user";
import { maskPhone } from "@/components/masks";

const PHOTO_MAX_BYTES = 120 * 1024;

/**
 * Componente à parte de propósito: o provider de sessão vive DENTRO do
 * DashboardShell, então um hook chamado no componente de página — que é quem
 * renderiza o shell — leria o valor padrão do contexto, não a sessão.
 */
export function ProfileCard() {
  const { user, refresh } = useSession();
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState({ fullName: "", phone: "" });
  const [photo, setPhoto] = useState<string | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  function startEditing() {
    setValues({ fullName: user.name, phone: user.phone ?? "" });
    setPhoto(undefined);
    setError(null);
    setEditing(true);
  }

  function pickPhoto(file: File | undefined) {
    if (!file) return;
    if (!["image/png", "image/jpeg"].includes(file.type)) {
      setError("Use uma imagem PNG ou JPG.");
      return;
    }
    if (file.size > PHOTO_MAX_BYTES) {
      setError("Use uma imagem de até 120 KB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      if (result.length > PHOTO_MAX_BYTES * 1.4) {
        setError("Use uma imagem de até 120 KB após conversão.");
        return;
      }
      setError(null);
      setPhoto(result);
    };
    reader.readAsDataURL(file);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;

    if (!values.fullName.trim()) {
      setError("Informe o seu nome.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      // `null` remove; `undefined` deixa como está. Por isso a foto começa
      // como `undefined` e só vira `null` quando a pessoa remove de fato.
      await updateProfile({
        fullName: values.fullName.trim(),
        phone: values.phone.trim() ? values.phone.trim() : null,
        ...(photo === undefined ? {} : { avatarUrl: photo }),
      });
      toast.success("Perfil atualizado.");
      setEditing(false);
      refresh();
    } catch (caught) {
      setError(caught instanceof AuthError ? caught.message : "Não foi possível salvar o perfil.");
    } finally {
      setSaving(false);
    }
  }

  const shownPhoto = photo === undefined ? user.avatarUrl : photo;

  return (
    <article className="profile-card">
      <div className="profile-cover" />
      <Avatar className="profile-avatar" name={editing ? values.fullName || user.name : user.name} photoUrl={shownPhoto} size={96} />

      {editing ? (
        <form className="profile-edit" noValidate onSubmit={save}>
          <div className="profile-photo-actions">
            <button onClick={() => fileInput.current?.click()} type="button"><Camera aria-hidden />Trocar foto</button>
            {shownPhoto && <button onClick={() => setPhoto(null)} type="button"><Trash2 aria-hidden />Remover</button>}
            <input
              accept="image/png,image/jpeg"
              onChange={(event) => { pickPhoto(event.target.files?.[0]); event.target.value = ""; }}
              ref={fileInput}
              type="file"
            />
            <small>PNG ou JPG até 120 KB</small>
          </div>

          <AuthAlert message={error} />

          <AuthField
            autoComplete="name"
            label="Seu nome"
            onChange={(event) => setValues((c) => ({ ...c, fullName: event.target.value }))}
            value={values.fullName}
          />

          <AuthField
            autoComplete="tel"
            inputMode="tel"
            label="Telefone"
            maxLength={16}
            onChange={(event) => setValues((c) => ({ ...c, phone: maskPhone(event.target.value) }))}
            placeholder="(00) 0 0000-0000"
            value={values.phone}
          />

          {/* O e-mail é a identidade de login e não é editável. Fica à vista
              com o motivo, em vez de sumir e deixar a pessoa procurando. */}
          <p className="profile-locked-field">
            <Mail aria-hidden />
            <span><strong>{user.email}</strong>O e-mail é usado para entrar e não pode ser alterado aqui.</span>
          </p>

          <div className="profile-edit-actions">
            <button disabled={saving} onClick={() => setEditing(false)} type="button">Cancelar</button>
            <button className="primary-action" disabled={saving} type="submit">
              {saving ? <><LoaderCircle className="button-spinner" aria-hidden /> Salvando…</> : "Salvar"}
            </button>
          </div>
        </form>
      ) : (
        <>
          <h3>{user.name}</h3>
          <small>{user.role}</small>
          <div className="profile-info">
            <span><Mail />E-mail cadastrado</span>
            <strong className={user.email ? undefined : "profile-info-empty"}>{user.email ?? "Não informado"}</strong>
          </div>
          <div className="profile-info">
            <span><Phone />Telefone</span>
            <strong className={user.phone ? undefined : "profile-info-empty"}>{user.phone ?? "Não informado"}</strong>
          </div>
          <button className="profile-secondary-action" onClick={startEditing} type="button">
            <Pencil aria-hidden />Editar perfil
          </button>
          <ChangePasswordForm />
        </>
      )}
    </article>
  );
}
