import { ALLOWED_TRANSITIONS, SUBSCRIPTION_STATUSES, canTransition, GRACE_DAYS, resolveAccess }
  from "/tmp/claude-1000/-home-lucas/9c1bbca8-a665-457b-ace0-faa9c8f27d22/scratchpad/shim/subscription-state.ts";
let pass = 0, fail = 0;
const ok = (c, l, e = "") => { c ? (pass++, console.log(`  ok    ${l}`)) : (fail++, console.log(`  FALHA ${l} ${e}`)); };

console.log("== tabela de transicoes ==");
ok(SUBSCRIPTION_STATUSES.length === 6, "6 estados", SUBSCRIPTION_STATUSES.join(","));
ok(SUBSCRIPTION_STATUSES.every((s) => ALLOWED_TRANSITIONS[s]), "todo estado tem transicoes declaradas");
ok(Object.values(ALLOWED_TRANSITIONS).flat().every((s) => SUBSCRIPTION_STATUSES.includes(s)),
   "nenhuma transicao aponta para estado inexistente");

console.log("\n== o que o webhook do MP nao pode fazer ==");
ok(!canTransition("canceled", "past_due"), "cancelada nao volta a vencida");
ok(!canTransition("canceled", "trialing"), "cancelada nao volta a avaliacao");
ok(!canTransition("expired", "trialing"), "expirada nao volta a avaliacao");
ok(!canTransition("active", "trialing"), "paga nao regride para avaliacao");
ok(!canTransition("active", "incomplete"), "paga nao regride para cobranca em aberto");
ok(!canTransition("past_due", "trialing"), "vencida nao vira avaliacao");

console.log("\n== o que ele PODE ==");
ok(canTransition("incomplete", "active"), "cobranca confirmada -> paga");
ok(canTransition("trialing", "active"), "avaliacao -> assinou");
ok(canTransition("active", "past_due"), "paga -> venceu");
ok(canTransition("past_due", "active"), "vencida -> pagou");
ok(canTransition("canceled", "active"), "cancelada -> reassinou");
ok(canTransition("active", "active"), "reenvio do mesmo evento e inocuo (idempotencia)");

console.log("\n== carencia ==");
ok(GRACE_DAYS === 7, "carencia de 7 dias", GRACE_DAYS);
const base = { planSlug: "comunidade", planName: "Comunidade", maxMembers: null, maxUsers: 10, trialEndsAt: null };
ok(resolveAccess(null).level === "full", "sem assinatura -> full");
ok(resolveAccess({ ...base, status: "active", currentPeriodEnd: new Date() }).level === "full", "active -> full");
ok(resolveAccess({ ...base, status: "trialing", currentPeriodEnd: null }).level === "full", "trialing -> full");
ok(resolveAccess({ ...base, status: "incomplete", currentPeriodEnd: null }).level === "full", "incomplete -> full (nao e divida)");
ok(resolveAccess({ ...base, status: "past_due", currentPeriodEnd: new Date(Date.now() - 1 * 86400000) }).level === "grace", "vencida ha 1 dia -> grace");
ok(resolveAccess({ ...base, status: "past_due", currentPeriodEnd: new Date(Date.now() - 6.9 * 86400000) }).level === "grace", "vencida ha 6,9 dias -> ainda grace");
ok(resolveAccess({ ...base, status: "past_due", currentPeriodEnd: new Date(Date.now() - 7.1 * 86400000) }).level === "read_only", "vencida ha 7,1 dias -> read_only");
ok(resolveAccess({ ...base, status: "past_due", currentPeriodEnd: null }).level === "grace",
   "vencida SEM data de vencimento -> grace, nunca tranca por falta de dado nosso");

console.log(`\n=========== ${pass} passaram, ${fail} falharam ===========`);
process.exit(fail ? 1 : 0);
