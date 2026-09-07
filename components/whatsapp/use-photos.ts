"use client";

import { useEffect, useRef, useState } from "react";
import type { Conversation } from "@/components/whatsapp/api";
import { FOTOS_TETO, getWhatsappPhotos } from "@/components/whatsapp/api";

/**
 * Fotos de perfil das conversas carregadas, buscadas DEPOIS da lista aparecer.
 *
 * A rota nunca é chamada junto da listagem: este efeito roda quando `conversas`
 * já está em tela (com iniciais), pede só os ids ainda não pedidos, em blocos de
 * no máximo FOTOS_TETO, e vai preenchendo o mapa. Foto é enriquecimento -- se a
 * chamada falhar, engole em silêncio e as iniciais ficam.
 *
 * Guardamos os ids JÁ PEDIDOS (não só os respondidos) para não repetir quem
 * voltou sem foto. URL que expira depois é problema do onError da imagem, não
 * daqui -- rebuscar no vencimento seria trocar um custo previsível por um laço.
 */
export function useConversationPhotos(conversas: Conversation[]): Record<string, string | null> {
  const [fotos, setFotos] = useState<Record<string, string | null>>({});
  const pedidos = useRef<Set<string>>(new Set());

  useEffect(() => {
    const novos = [...new Set(conversas.map((c) => c.chatId).filter((id): id is string => Boolean(id)))]
      .filter((id) => !pedidos.current.has(id));
    if (novos.length === 0) return;

    let vivo = true;
    for (const id of novos) pedidos.current.add(id);

    const blocos: string[][] = [];
    for (let i = 0; i < novos.length; i += FOTOS_TETO) blocos.push(novos.slice(i, i + FOTOS_TETO));

    (async () => {
      for (const bloco of blocos) {
        try {
          const { fotos: mapa } = await getWhatsappPhotos(bloco);
          if (!vivo) return;
          setFotos((atuais) => ({ ...atuais, ...mapa }));
        } catch {
          // Enriquecimento: as iniciais seguem valendo.
        }
      }
    })();

    return () => {
      vivo = false;
    };
  }, [conversas]);

  return fotos;
}
