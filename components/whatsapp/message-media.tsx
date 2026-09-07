"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import type { Message } from "@/components/whatsapp/api";

/**
 * Os bytes de uma mensagem de mídia, quando existem.
 *
 * O 404 AQUI É NORMAL E VAI ACONTECER MUITO: o gateway só guarda o que viu ao
 * vivo, então toda foto anterior ao pareamento responde 404 para sempre. Por
 * isso ele é tratado como ESTADO e não como falha -- cai no marcador de texto
 * que o servidor já calculou ("[foto]"), com uma linha explicando por quê.
 * Cara de erro para algo que nunca vai funcionar ensina a pessoa a ignorar
 * avisos.
 *
 * Sem ícone colorido e sem emoji: o marcador é texto entre colchetes, como no
 * resto da caixa.
 */
export function MessageMedia({ mensagem }: { mensagem: Message }) {
  const [falhou, setFalhou] = useState(false);
  const media = mensagem.media;

  // `hasMedia` é derivado do TIPO, então ele é true mesmo quando o servidor não
  // tem por onde entregar os bytes. Aí só resta o marcador.
  if (!media || falhou) {
    return (
      <p className="wa-media-ausente">
        <strong>{marcador(mensagem)}</strong>
        <small>Esta mídia é anterior à conexão da igreja, e o WhatsApp não a entrega depois.</small>
      </p>
    );
  }

  const legenda = mensagem.body?.trim();

  return (
    <div className="wa-media">
      {(media.kind === "image" || media.kind === "sticker") && (
        // O texto alternativo é o marcador: quem usa leitor de tela recebe a
        // mesma frase que quem vê a imagem quebrada.
        <img alt={marcador(mensagem)} className={media.kind === "sticker" ? "is-sticker" : undefined} onError={() => setFalhou(true)} src={media.url} />
      )}
      {media.kind === "video" && <video controls onError={() => setFalhou(true)} src={media.url} />}
      {(media.kind === "audio" || media.kind === "voice") && (
        <audio controls onError={() => setFalhou(true)} src={media.url} />
      )}
      {media.kind === "document" && (
        <a className="wa-media-arquivo" download={media.filename ?? undefined} href={media.url}>
          <Download aria-hidden />
          <span>{media.filename ?? marcador(mensagem)}</span>
        </a>
      )}
      {legenda && <p className="wa-media-legenda">{legenda}</p>}
    </div>
  );
}

/**
 * O marcador entre colchetes que o servidor calculou, sem a legenda.
 *
 * A prévia vem como "[foto] olha isso"; aqui só o "[foto]" interessa, porque a
 * legenda é mostrada em campo próprio e repeti-la seria dizer duas vezes.
 */
function marcador(mensagem: Message) {
  return mensagem.preview.match(/^\[[^\]]+\]/)?.[0] ?? "[mídia]";
}
