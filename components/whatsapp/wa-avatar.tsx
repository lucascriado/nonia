"use client";

import { useEffect, useState } from "react";
import { avatarToneFor, initialsFrom } from "@/components/avatar";

/**
 * Foto de perfil da conversa -- ou as iniciais, no MESMO círculo e tamanho.
 *
 * Duas regras que vêm do backend e não são zelo:
 * - sem foto = iniciais, nunca esqueleto nem vazio. A foto chega numa segunda
 *   requisição; um placeholder de outro tamanho faria a lista pular quando ela
 *   trocasse, com a pessoa já lendo.
 * - a imagem cai para as iniciais no `onError`, não só quando a URL vem nula. A
 *   URL é do `pps.whatsapp.net` e EXPIRA -- quando expira, o `<img>` quebra, e é
 *   o mesmo caminho de quem removeu a foto. `key` no src rearma o fallback
 *   quando a URL muda, para uma conversa nova não herdar o "quebrado" da antiga.
 */
export function WaAvatar({ name, photoUrl, size = 40 }: { name: string; photoUrl?: string | null; size?: number }) {
  const [quebrada, setQuebrada] = useState(false);
  useEffect(() => setQuebrada(false), [photoUrl]);

  const mostraFoto = Boolean(photoUrl) && !quebrada;

  return (
    <span
      aria-hidden
      className={`initials-avatar avatar-${avatarToneFor(name)} wa-avatar`}
      style={{ "--avatar-size": `${size}px` } as React.CSSProperties}
    >
      {mostraFoto ? <img alt="" src={photoUrl as string} onError={() => setQuebrada(true)} /> : initialsFrom(name)}
    </span>
  );
}
