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

/**
 * Tabela comparativa de /precos. Os limites vêm dos planos cadastrados no
 * banco (semente: 100 pessoas e 1 usuário; comunidade: R$ 89, pessoas
 * ilimitadas e 10 usuários; rede: sob consulta).
 *
 * Importante no texto: a tabela descreve o que cada plano INCLUI. Nenhuma
 * rota aplica esses limites hoje, então nada aqui pode ser escrito como
 * "o sistema bloqueia ao passar de X".
 */
export type ComparisonValue = boolean | string;

export type ComparisonGroup = {
  title: string;
  rows: Array<{
    label: string;
    note?: string;
    /** Um valor por plano, na ordem de `plans`. */
    values: [ComparisonValue, ComparisonValue, ComparisonValue];
  }>;
};

export const planComparison: ComparisonGroup[] = [
  {
    title: "Tamanho da conta",
    rows: [
      { label: "Pessoas cadastradas", note: "Membros e visitantes somados.", values: ["Até 100", "Ilimitadas", "Ilimitadas"] },
      { label: "Usuários com acesso ao painel", values: ["1", "Até 10", "Ilimitados"] },
      { label: "Congregações no mesmo contrato", values: ["1", "1", "Várias"] },
    ],
  },
  {
    title: "Comunidade",
    rows: [
      { label: "Cadastro de membros", values: [true, true, true] },
      { label: "Cadastro e acompanhamento de visitantes", values: [true, true, true] },
      { label: "Conversão de visitante em membro", values: [true, true, true] },
      { label: "Células com líder e composição", values: [false, true, true] },
      { label: "Ministérios com equipe e responsável", values: [false, true, true] },
      { label: "Registro de presença nos encontros", values: [false, true, true] },
    ],
  },
  {
    title: "Rotina",
    rows: [
      { label: "Agenda e calendário de eventos", values: [true, true, true] },
      { label: "Próximos eventos e aniversariantes no painel", values: [true, true, true] },
      { label: "Histórico de atividades", note: "Quem alterou o quê e quando.", values: [true, true, true] },
    ],
  },
  {
    title: "Administração",
    rows: [
      { label: "Financeiro com entradas, saídas e pendências", values: [false, true, true] },
      { label: "Comprovante anexado ao lançamento", note: "PNG, JPG ou PDF.", values: [false, true, true] },
      { label: "Papéis e permissões por usuário", values: [false, true, true] },
      { label: "Consolidação financeira da rede", values: [false, false, true] },
      { label: "Exportação dos seus dados", values: [true, true, true] },
    ],
  },
  {
    title: "Suporte",
    rows: [
      { label: "Suporte por e-mail", values: [true, true, true] },
      { label: "Onboarding acompanhado", note: "A gente ajuda a importar a lista de membros.", values: [false, true, true] },
      { label: "Suporte prioritário", values: [false, false, true] },
    ],
  },
];
