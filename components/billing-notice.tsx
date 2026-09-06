"use client";

import Link from "next/link";
import { ArrowRight, Lock, TriangleAlert } from "lucide-react";
import { useSession } from "@/components/current-user";
import type { SessionPlan } from "@/components/auth/session";

/** A partir daqui o teto vira aviso, e não só informação. */
const WARN_AT = 0.8;
/** Dias de avaliação a partir dos quais vale interromper a tela com o aviso. */
const TRIAL_WARN_DAYS = 5;

type Notice = {
  tone: "info" | "warning" | "critical";
  icon: typeof TriangleAlert;
  message: string;
  action?: string;
};

/**
 * Faixa de cobrança, no topo de toda tela do app.
 *
 * Existe porque a carência de 7 dias não serve para nada se ninguém for
 * avisado dentro dela: ela foi criada para avisar ANTES de cortar, e sem esta
 * faixa a pessoa descobre esbarrando no erro. Pela mesma razão a faixa não é
 * dispensável quando o assunto é perder acesso — só o aviso de avaliação
 * tranquila fica de fora, para não virar ruído diário.
 */
export function BillingNotice() {
  const { plan } = useSession();
  if (!plan) return null;

  const notice = noticeFor(plan);
  if (!notice) return null;

  const Icon = notice.icon;

  return (
    <div className={`billing-notice is-${notice.tone}`} role={notice.tone === "info" ? undefined : "status"}>
      <Icon aria-hidden />
      <p>{notice.message}</p>
      {notice.action && (
        <Link className="billing-notice-action" href="/configuracoes">
          {notice.action} <ArrowRight aria-hidden />
        </Link>
      )}
    </div>
  );
}

function noticeFor(plan: SessionPlan): Notice | null {
  // Somente leitura: é o estado mais grave e o que a pessoa precisa entender
  // antes de tentar salvar qualquer coisa.
  if (plan.access.level === "read_only") {
    return {
      tone: "critical",
      icon: Lock,
      message:
        "A conta está em somente leitura por mensalidade em aberto. Consultar, buscar e exportar continuam funcionando; cadastrar e editar voltam assim que a assinatura for regularizada.",
      action: "Ver plano",
    };
  }

  if (plan.access.level === "grace") {
    const days = plan.access.graceDaysLeft;
    return {
      tone: "warning",
      icon: TriangleAlert,
      message:
        days && days > 0
          ? `Mensalidade em aberto. Faltam ${days} ${days === 1 ? "dia" : "dias"} para a conta passar a somente leitura, quando cadastrar e editar param.`
          : "Mensalidade em aberto. A conta passa a somente leitura a qualquer momento, e aí cadastrar e editar param.",
      action: "Regularizar",
    };
  }

  if (plan.source === "trial" && plan.trialExpired) {
    return {
      tone: "warning",
      icon: TriangleAlert,
      message: "A avaliação terminou. Escolha um plano para continuar com tudo liberado.",
      action: "Escolher plano",
    };
  }

  if (plan.source === "trial" && plan.trialDaysLeft !== null && plan.trialDaysLeft <= TRIAL_WARN_DAYS) {
    return {
      tone: "warning",
      icon: TriangleAlert,
      message:
        plan.trialDaysLeft <= 1
          ? "Último dia de avaliação. Depois dele a conta continua no plano gratuito, com teto de 100 pessoas e 1 usuário."
          : `Faltam ${plan.trialDaysLeft} dias de avaliação. Depois deles a conta continua no plano gratuito, com teto de 100 pessoas e 1 usuário.`,
      action: "Ver planos",
    };
  }

  // Teto de pessoas: avisar antes de encostar é o ponto.
  const members = ratio(plan.usage.members, plan.maxMembers);
  if (members !== null && members >= 1) {
    return {
      tone: "critical",
      icon: Lock,
      message: `Você atingiu o limite de ${plan.maxMembers} pessoas do plano ${plan.name}. Para cadastrar mais, mude de plano.`,
      action: "Ver planos",
    };
  }
  if (members !== null && members >= WARN_AT) {
    return {
      tone: "warning",
      icon: TriangleAlert,
      message: `Faltam ${plan.maxMembers! - plan.usage.members} pessoas para o limite do plano ${plan.name}.`,
      action: "Ver planos",
    };
  }

  return null;
}

function ratio(used: number, cap: number | null) {
  if (cap === null || cap <= 0) return null;
  return used / cap;
}
