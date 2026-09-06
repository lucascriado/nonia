import type { LucideIcon } from "lucide-react";
import {
  CalendarDays,
  CreditCard,
  Network,
  Puzzle,
  ShieldCheck,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";

export type FaqTopic = {
  id: string;
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  summary: string;
  /** Pontos que a animação escalona conforme a seção entra na tela. */
  points: string[];
  questions: Array<{ question: string; answer: string }>;
};

export const faqTopics: FaqTopic[] = [
  {
    id: "membros",
    icon: Users,
    eyebrow: "Comunidade",
    title: "Membros",
    summary:
      "O cadastro de membros é o centro do nonia. Tudo o que as outras telas mostram nasce daqui.",
    points: [
      "Dados pessoais, contato e endereço com máscara de CPF, telefone e CEP",
      "CEP completo consulta os Correios e preenche rua, bairro, cidade e estado",
      "Foto opcional; sem foto, o sistema mostra as iniciais da pessoa",
      "Busca por nome, filtros por situação e célula, com paginação",
    ],
    questions: [
      {
        question: "Quantos membros cabem no cadastro?",
        answer:
          "No plano Semente, até 100. Nos planos Comunidade e Rede não há limite — a listagem é paginada e filtrada no servidor, então o tamanho da igreja não deixa a tela lenta.",
      },
      {
        question: "Consigo importar a planilha que a secretaria já usa?",
        answer:
          "Sim. Na entrada dos planos pagos a gente recebe a sua planilha, confere as colunas e faz a carga inicial junto com você.",
      },
      {
        question: "Quem alterou o cadastro de uma pessoa?",
        answer:
          "Toda alteração relevante vira registro no histórico de atividades, com autor, o que mudou e a data.",
      },
    ],
  },
  {
    id: "visitantes",
    icon: UserPlus,
    eyebrow: "Comunidade",
    title: "Visitantes",
    summary:
      "Visitante não é membro — e também não é um nome perdido num caderno. O nonia acompanha a integração do primeiro culto até a membresia.",
    points: [
      "Etapas de integração visíveis em cada ficha",
      "Abas por situação, para separar quem chegou de quem já está em acompanhamento",
      "Conversão para membro sem redigitar nada: os dados pessoais são os mesmos",
      "Filtros e busca iguais aos de membros, para a equipe não reaprender a tela",
    ],
    questions: [
      {
        question: "O que acontece quando o visitante vira membro?",
        answer:
          "Os dados pessoais são compartilhados entre as duas fichas, então a conversão aproveita tudo o que já estava preenchido e preserva a data da primeira visita.",
      },
      {
        question: "Dá para saber quantos visitantes vieram no mês?",
        answer:
          "Sim, é um dos indicadores da abertura do painel, ao lado de membros ativos, células e aniversariantes.",
      },
    ],
  },
  {
    id: "celulas",
    icon: Network,
    eyebrow: "Comunidade",
    title: "Células",
    summary:
      "Cada célula com líder, endereço e composição. Quem está em qual grupo deixa de ser conhecimento de uma pessoa só.",
    points: [
      "Líder e anfitrião definidos entre os membros já cadastrados",
      "Endereço e dia de encontro em cada grupo",
      "Composição da célula montada a partir da lista de membros",
      "O vínculo aparece na ficha do membro e no filtro de células",
    ],
    questions: [
      {
        question: "Um membro pode estar em mais de uma célula?",
        answer:
          "O vínculo principal é um só, para que os relatórios não contem a mesma pessoa duas vezes. Participações extras costumam ser melhor representadas como ministério.",
      },
      {
        question: "O líder de célula precisa de conta no sistema?",
        answer:
          "Só se você quiser que ele acesse o painel. Nos planos pagos você cria usuários com permissões separadas das da secretaria.",
      },
    ],
  },
  {
    id: "ministerios",
    icon: Puzzle,
    eyebrow: "Comunidade",
    title: "Ministérios",
    summary:
      "Louvor, infantil, diaconia, mídia: equipes com responsáveis e registro de quem esteve presente.",
    points: [
      "Equipe montada entre os membros, com responsável definido",
      "Registro de presença por encontro",
      "Histórico de participação para conversar com quem sumiu",
      "Contagem de integrantes visível no cartão de cada ministério",
    ],
    questions: [
      {
        question: "Dá para registrar presença de um encontro passado?",
        answer:
          "Sim. A chamada é feita por data, então lançar o encontro da semana anterior é normal.",
      },
      {
        question: "Ministério e célula são a mesma coisa?",
        answer:
          "Não. Célula é o grupo de convivência com endereço e dia fixo; ministério é a equipe de serviço, com escala e presença. As duas telas são separadas de propósito.",
      },
    ],
  },
  {
    id: "agenda",
    icon: CalendarDays,
    eyebrow: "Rotina",
    title: "Agenda e calendário",
    summary:
      "Cultos, reuniões de liderança, ensaios e eventos especiais num calendário que a igreja inteira enxerga.",
    points: [
      "Visão de mês com os eventos marcados no dia",
      "Cores por tipo de evento, para o calendário ser lido de relance",
      "Próximos eventos em destaque na abertura do painel",
      "Local do evento junto do título, sem precisar abrir a ficha",
    ],
    questions: [
      {
        question: "Os aniversariantes aparecem no calendário?",
        answer:
          "Os aniversariantes do mês têm um bloco próprio no painel, com atalho para mandar a mensagem de parabéns pelo WhatsApp.",
      },
      {
        question: "Consigo criar um evento que se repete todo domingo?",
        answer:
          "Hoje cada evento é lançado individualmente. Recorrência está na fila do roadmap.",
      },
    ],
  },
  {
    id: "financeiro",
    icon: Wallet,
    eyebrow: "Administração",
    title: "Financeiro",
    summary:
      "Entradas, saídas, pendências e saldo disponível — com comprovante anexado onde importa.",
    points: [
      "Lançamentos de entrada e saída com categoria, origem ou destino e forma de pagamento",
      "Situação paga ou pendente, para o saldo refletir a realidade",
      "Comprovante em PNG, JPG ou PDF anexado ao lançamento",
      "Filtros por tipo, situação, categoria, presença de comprovante e busca livre",
    ],
    questions: [
      {
        question: "O financeiro do nonia substitui a contabilidade?",
        answer:
          "Não. Ele organiza o caixa da igreja e a prestação de contas para a liderança e a assembleia; a obrigação contábil e fiscal continua com o seu contador.",
      },
      {
        question: "Quem pode ver o financeiro?",
        answer:
          "Nos planos pagos o acesso é por permissão de usuário, então a tesouraria enxerga o módulo sem que todo mundo da secretaria enxergue.",
      },
    ],
  },
  {
    id: "planos",
    icon: CreditCard,
    eyebrow: "Assinatura",
    title: "Planos e cobrança",
    summary:
      "Uma assinatura por igreja. Sem fidelidade, sem taxa de instalação, sem cobrança por membro cadastrado.",
    points: [
      "Plano Semente gratuito e sem prazo para expirar, até 100 membros",
      "Planos pagos cobrados por mês, com valor fixo independente do tamanho da igreja",
      "Troca de plano a qualquer momento, com ajuste proporcional",
      "Cancelamento pela própria tela de configurações",
    ],
    questions: [
      {
        question: "Preciso de cartão para começar?",
        answer:
          "Não. O plano Semente é criado sem nenhum dado de pagamento.",
      },
      {
        question: "Se eu cancelar, perco meus dados?",
        answer:
          "Você consegue exportar os cadastros antes de encerrar, e a base fica disponível por um período após o cancelamento caso a igreja mude de ideia.",
      },
      {
        question: "Cada congregação da nossa rede precisa de uma assinatura?",
        answer:
          "No plano Rede, não: as congregações ficam sob o mesmo contrato, cada uma com o seu espaço, e a liderança da rede enxerga o consolidado.",
      },
    ],
  },
  {
    id: "seguranca",
    icon: ShieldCheck,
    eyebrow: "Confiança",
    title: "Dados e segurança",
    summary:
      "O cadastro da sua igreja tem dado pessoal de gente de verdade. Ele é tratado como tal.",
    points: [
      "Cada igreja em seu próprio espaço, isolada das demais assinaturas",
      "Conexão sempre por HTTPS",
      "Histórico de atividades como trilha de auditoria do que mudou",
      "Exportação dos seus dados sempre disponível — eles são da igreja, não nossos",
    ],
    questions: [
      {
        question: "Onde ficam hospedados os dados?",
        answer:
          "Em servidor próprio, com banco PostgreSQL e backup periódico. Nada é vendido nem compartilhado com terceiros.",
      },
      {
        question: "O nonia atende à LGPD?",
        answer:
          "O sistema fornece as ferramentas — acesso restrito por usuário, trilha de alterações e exportação. A igreja segue sendo a controladora dos dados dos seus membros.",
      },
    ],
  },
];
