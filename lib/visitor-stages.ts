/** Rótulos do formulário -> valores das CHECK constraints de `visitors`. */

export function visitorStatus(stage?: string) {
  if (stage === "Membro") return "integrated";
  if (stage && stage !== "Visitou a igreja") return "following_up";
  return "waiting_contact";
}

export function membershipStage(stage?: string) {
  if (stage === "Membro") return "member";
  if (stage === "Batismo") return "baptism";
  if (stage === "Visita em casa") return "home_visit";
  if (stage === "Contato realizado") return "contacted";
  return "visited";
}
