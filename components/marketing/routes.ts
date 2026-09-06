// Destinos das chamadas para ação do site público.
//
// Cadastro e checkout ainda não existem. Todo CTA da landing e do FAQ passa por
// aqui, então ligar o fluxo real depois é trocar as constantes deste arquivo —
// nenhuma página precisa ser tocada.
export const marketingRoutes = {
  signup: "/cadastro",
  pricing: "/precos",
  login: "/entrar",
  faq: "/faq",
  app: "/painel",
  contact: "mailto:contato@nonia.app",
  support: "mailto:suporte@nonia.app",
} as const;

// O plano escolhido viaja na query para que a tela de cadastro (e depois o
// checkout) já abra com o plano certo selecionado.
export function signupHref(planId?: string) {
  return planId ? `${marketingRoutes.signup}?plano=${planId}` : marketingRoutes.signup;
}
