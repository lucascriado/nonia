-- O plano Semente passa de 1 para 2 assentos de acesso.
--
-- POR QUE: com 1 acesso o dono já ocupava o único assento, então NENHUMA
-- igreja no gratuito conseguia convidar a secretaria -- e convidar a
-- secretaria é o segundo passo da vida de qualquer igreja. O teto não estava
-- limitando o crescimento; estava impedindo o uso. Com 2, o gratuito passa a
-- comportar o par que faz o sistema funcionar: quem lidera e quem digita.
--
-- Decisão do Lucas em 06/09/2026, respondendo à pendência "no plano Semente
-- não há assento para convidar ninguém".
--
-- A `description` muda JUNTO, e não é enfeite: ela vem do banco em
-- GET /api/billing/plans e é renderizada no cartão do plano dentro do app
-- (components/plan-panel.tsx). Subir o teto sem mexer nela faria o produto
-- prometer um administrador na mesma tela em que concede dois -- e é a tela
-- onde a pessoa decide.
--
-- O texto de marketing (app/(marketing)/plans.ts, billing-notice, plan-panel)
-- é do frontend e continua dizendo "1 usuário administrador". Está reportado;
-- não é editável daqui.
--
-- Idempotente pela guarda `max_users = 1`: uma segunda passagem não casa, e
-- um valor maior escolhido depois não é rebaixado.

UPDATE plans
   SET max_users = 2,
       description = 'Para começar: até 100 membros e 2 usuários.'
 WHERE slug = 'semente'
   AND max_users = 1;
