"use client";

import { useState } from "react";
import { LoaderCircle, Mail, Pencil, Phone } from "lucide-react";
import { toast } from "sonner";
import { Avatar } from "@/components/avatar";
import { AvatarPicker } from "@/components/avatar-picker";
import { AuthAlert } from "@/components/auth/auth-alert";
import { AuthField } from "@/components/auth/auth-field";
import { AuthError, updateProfile } from "@/components/auth/session";
import { useSession } from "@/components/current-user";
import { maskPhone } from "@/components/masks";


/** O cartão da pessoa: nome, foto e contato. Sem a senha, que virou cartão
 *  próprio — segurança e identidade têm donos diferentes na tela. */
export function ProfileCard() {
  const { user, refresh } = useSession();
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState({ fullName: "", phone: "" });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function startEditing() {
    setValues({ fullName: user.name, phone: user.phone ?? "" });
    setError(null);
    setEditing(true);
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
      // Só nome e telefone: a foto tem caminho próprio e aplica na hora.
      // Mandar `avatarUrl` daqui faria este formulário reescrever uma escolha
      // que ele não fez -- chave ausente preserva, e é disso que se trata.
      await updateProfile({
        fullName: values.fullName.trim(),
        phone: values.phone.trim() ? values.phone.trim() : null,
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


  return (
    <article className="profile-card">
      <div className="profile-cover" />
      <Avatar className="profile-avatar" name={editing ? values.fullName || user.name : user.name} photoUrl={user.avatarUrl} size={96} />

      {editing ? (
        <form className="profile-edit" noValidate onSubmit={save}>
          {/* A FOTO SAIU DAQUI. Ela virou escolha direta no cartão, junto dos
              avatares prontos, e aplica na hora. Trocar foto não é o mesmo
              gênero que corrigir o nome: escolher uma imagem já É a
              confirmação, e um "Salvar" depois disso é um passo que não
              informa nada. De quebra, quem vai mexer na foto deixa de passar
              por este formulário -- onde a nota de que o e-mail não pode ser
              alterado ficava à vista e era lida como recusa do que a pessoa
              estava tentando fazer. */}

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
          <AvatarPicker />
          <button className="profile-secondary-action" onClick={startEditing} type="button">
            <Pencil aria-hidden />Editar perfil
          </button>
        </>
      )}
    </article>
  );
}
