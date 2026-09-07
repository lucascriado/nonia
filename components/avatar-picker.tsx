"use client";

import { useRef, useState } from "react";
import { Camera, Check, LoaderCircle, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AuthError, updateProfile } from "@/components/auth/session";
import { useSession } from "@/components/current-user";
import { AVATAR_PRESETS } from "@/components/avatar-presets";

/**
 * Escolha de avatar, no cartão de perfil.
 *
 * OS DESENHOS SÃO GEOMÉTRICOS, NÃO ILUSTRADOS. O pedido foi "avatares tipo os
 * do iOS", e o que se aproveita de lá é a EXPERIÊNCIA -- uma grade para
 * escolher com um toque, em vez de caçar arquivo no computador. O desenho
 * segue a régua desta casa: formas simples nas quatro cores da paleta, sem
 * emoji e sem personagem. Dá para ir mais ilustrado se for esse o gosto; é
 * trocar o conteúdo de MARCAS e nada mais.
 *
 * O QUE VAI PARA O BANCO é o PNG pronto, como data URI, no mesmo `avatarUrl`
 * que já guarda foto: entre 194 e 486 bytes, contra um teto de campo de 120 KB
 * e uma foto de verdade que chega perto dele. Guardar um identificador
 * ("marca 3") seria mais leve, mas obrigaria toda tela que hoje faz
 * `<img src={avatarUrl}>` a traduzir o identificador, E uma mudança no
 * backend: `validatePhoto` só aceita data URI de PNG ou JPG. Não vale
 * trezentos bytes. Ver components/avatar-presets.ts.
 *
 * "Minhas iniciais" não é um avatar: é APAGAR o avatar. As iniciais são o
 * padrão do produto, seguem o nome quando ele muda, e continuam sendo o que
 * aparece para quem nunca escolher nada.
 */

/**
 * Foto reduzida no navegador ANTES de subir.
 *
 * Sem isto, um PNG de 97 KB -- que a tela aceitava, porque conferia o tamanho
 * do ARQUIVO -- virava um data URI de 129 KB e o servidor recusava com "a foto
 * deve ter no máximo 120 KB". O mesmo número medindo duas coisas diferentes:
 * base64 engorda o arquivo em um terço. Medido contra a API, não deduzido.
 *
 * Reduzir resolve os dois lados: a foto de perfil nunca precisa de mais de
 * 256px, e a 256px em JPEG ela sai na casa das dezenas de KB. O limite deixa
 * de ser um obstáculo em vez de virar uma mensagem melhor sobre um obstáculo.
 */
async function reduzir(file: File) {
  const bitmap = await createImageBitmap(file);
  const lado = Math.min(256, Math.max(bitmap.width, bitmap.height));
  const escala = lado / Math.max(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * escala);
  canvas.height = Math.round(bitmap.height * escala);
  const contexto = canvas.getContext("2d");
  if (!contexto) throw new Error("sem canvas");
  contexto.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.85);
}

export function AvatarPicker() {
  const { user, refresh } = useSession();
  const [saving, setSaving] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  async function choose(avatarUrl: string | null) {
    if (saving) return;
    setSaving(avatarUrl ?? "iniciais");
    try {
      await updateProfile({ avatarUrl });
      toast.success(avatarUrl ? "Avatar atualizado." : "Voltou para as suas iniciais.");
      refresh();
    } catch (error) {
      toast.error(error instanceof AuthError ? error.message : "Não foi possível salvar o avatar.");
    } finally {
      setSaving(null);
    }
  }

  async function pickPhoto(file: File | undefined) {
    if (!file || saving) return;
    if (!["image/png", "image/jpeg"].includes(file.type)) {
      toast.error("Use uma imagem PNG ou JPG.");
      return;
    }
    setSaving("foto");
    try {
      await choose(await reduzir(file));
    } catch {
      toast.error("Não foi possível ler essa imagem.");
      setSaving(null);
    }
  }

  const atual = user.avatarUrl ?? null;
  /** Uma foto de verdade não é nenhum dos avatares prontos. */
  const temFoto = atual !== null && !AVATAR_PRESETS.includes(atual);

  return (
    <section className="avatar-picker" aria-label="Escolher avatar">
      <h4>Escolha um avatar</h4>
      <div className="avatar-picker-grid">
        <button
          aria-pressed={atual === null}
          className={`avatar-option is-initials${atual === null ? " is-current" : ""}`}
          disabled={saving !== null}
          onClick={() => choose(null)}
          title="Usar as minhas iniciais"
          type="button"
        >
          {saving === "iniciais" ? <LoaderCircle className="button-spinner" aria-hidden /> : <span aria-hidden>{initials(user.name)}</span>}
          {atual === null && <i aria-hidden><Check /></i>}
        </button>

        {AVATAR_PRESETS.map((preset, index) => (
          <button
            aria-pressed={atual === preset}
            className={`avatar-option${atual === preset ? " is-current" : ""}`}
            disabled={saving !== null}
            key={preset}
            onClick={() => choose(preset)}
            title={`Avatar ${index + 1}`}
            type="button"
          >
            {saving === preset ? <LoaderCircle className="button-spinner" aria-hidden /> : <img alt="" src={preset} />}
            {atual === preset && <i aria-hidden><Check /></i>}
          </button>
        ))}
      </div>
      <div className="avatar-picker-photo">
        <button disabled={saving !== null} onClick={() => fileInput.current?.click()} type="button">
          <Camera aria-hidden />{temFoto ? "Trocar foto" : "Enviar foto"}
        </button>
        {temFoto && (
          <button disabled={saving !== null} onClick={() => choose(null)} type="button">
            <Trash2 aria-hidden />Remover
          </button>
        )}
        <input
          accept="image/png,image/jpeg"
          onChange={(event) => { void pickPhoto(event.target.files?.[0]); event.target.value = ""; }}
          ref={fileInput}
          type="file"
        />
      </div>
      <p>Escolher já aplica: não há passo de salvar. As iniciais são o padrão e acompanham o seu nome.</p>
    </section>
  );
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toLocaleUpperCase("pt-BR") ?? "").join("");
}
