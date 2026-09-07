"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, PlugZap } from "lucide-react";
import { usePermission } from "@/components/current-user";
import { getWhatsappState } from "@/components/whatsapp/api";

/**
 * Faixa de WhatsApp caído, no topo de toda tela.
 *
 * O motivo é o mesmo da faixa de cobrança, e é forte aqui: quando o WhatsApp
 * cai, TODO envio responde 400 na hora -- ele não enfileira. Sem esta faixa, a
 * igreja descobre no dia em que precisar mandar, e não no dia em que caiu.
 *
 * SÓ QUANDO HÁ O QUE FAZER, como a de cobrança. Ela não aparece para quem
 * nunca conectou (isso não é problema, é uma escolha que a igreja ainda não
 * fez), nem quando o ambiente não tem a integração, nem durante o pareamento.
 * Ela aparece quando algo que FUNCIONAVA parou.
 */
export function WhatsappNotice() {
  const canRead = usePermission("whatsapp.read");
  const [caiu, setCaiu] = useState(false);

  useEffect(() => {
    if (!canRead) return;
    let vivo = true;
    getWhatsappState()
      .then((estado) => {
        if (!vivo) return;
        setCaiu(estado.configured && (estado.status === "disconnected" || estado.status === "failed"));
      })
      .catch(() => undefined);
    return () => { vivo = false; };
  }, [canRead]);

  if (!caiu) return null;

  return (
    <div className="billing-notice is-warning" role="status">
      <PlugZap aria-hidden />
      <p>
        O WhatsApp da igreja está desconectado. Enquanto estiver assim, nenhuma mensagem sai — o envio é recusado na
        hora, não fica esperando.
      </p>
      <Link className="billing-notice-action" href="/whatsapp">
        Reconectar<ArrowRight aria-hidden />
      </Link>
    </div>
  );
}
