import type { LucideIcon } from "lucide-react";
import { Building2, Sprout, Users } from "lucide-react";

// Fonte única dos planos: a landing e a futura `/precos` leem daqui, e o
// `id` é o mesmo que vai na query de `signupHref`.
export type Plan = {
  id: string;
  name: string;
  icon: LucideIcon;
  tagline: string;
  price: number | null;
  priceNote: string;
  highlight?: boolean;
  cta: string;
  features: string[];
};

export const plans: Plan[] = [
  {
    id: "semente",
    name: "Semente",
    icon: Sprout,
    tagline: "Para congregações que estão organizando a secretaria pela primeira vez.",
    price: 0,
    priceNote: "até 100 membros cadastrados",
    cta: "Começar de graça",
    features: [
      "Cadastro de membros e visitantes",
      "Agenda e calendário de eventos",
      "Histórico de atividades",
      "1 usuário administrador",
      "Suporte por e-mail",
    ],
  },
  {
    id: "comunidade",
    name: "Comunidade",
    icon: Users,
    tagline: "Para igrejas com células, ministérios e uma equipe cuidando da gestão.",
    price: 89,
    priceNote: "por mês, membros ilimitados",
    highlight: true,
    cta: "Assinar o Comunidade",
    features: [
      "Tudo do Semente",
      "Células com líderes e acompanhamento",
      "Ministérios com escalas e presença",
      "Financeiro com entradas, saídas e comprovantes",
      "Até 10 usuários com permissões",
      "Relatórios e exportação",
    ],
  },
  {
    id: "rede",
    name: "Rede",
    icon: Building2,
    tagline: "Para redes e denominações que administram várias congregações.",
    price: null,
    priceNote: "sob consulta",
    cta: "Falar com a gente",
    features: [
      "Tudo do Comunidade",
      "Várias congregações no mesmo painel",
      "Consolidação financeira da rede",
      "Usuários ilimitados",
      "Onboarding acompanhado",
      "Suporte prioritário",
    ],
  },
];
