// Envio de e-mail transacional.
//
// Interface estreita de propósito, pelo mesmo motivo que o schema de cobrança
// é agnóstico ao gateway: o domínio não conhece o fornecedor. Quem chama sabe
// "enviar({para, assunto, html})" e mais nada. Trocar o Resend por outro é
// trocar este arquivo.
//
// PROPRIEDADE QUE NÃO PODE SER QUEBRADA: enviar e-mail NUNCA derruba a
// operação que o originou. Um convite que falha ao enviar continua existindo,
// e a inviteUrl continua voltando na resposta para quem convidou repassar à
// mão. Por isso esta função não lança: devolve o resultado.
//
// Sem RESEND_API_KEY no ambiente, o envio simplesmente não acontece e diz que
// não aconteceu. O produto não regride -- fica igual ao que era antes de
// existir e-mail.
//
// ATENÇÃO ao domínio: o Resend só entrega para terceiros a partir de um
// domínio VERIFICADO (DNS: MX e TXT em `send`, TXT em `resend._domainkey`; no
// Cloudflare os três precisam ficar "DNS only", com o proxy desligado). Com o
// remetente de teste onboarding@resend.dev a API responde 403 e só entrega
// para o e-mail do dono da conta -- o que para convite é inútil, já que o
// convidado nunca é o dono. Enquanto o domínio não for verificado, esperar
// falha registrada aqui é o comportamento correto, não um defeito.

const ENDPOINT = "https://api.resend.com/emails";
const REMETENTE_PADRAO = "Nonia <onboarding@resend.dev>";

export type EmailMessage = {
  para: string;
  assunto: string;
  html: string;
  texto: string;
};

export type EmailResult = {
  enviado: boolean;
  /** Por que não saiu. Só para log e para a resposta ser honesta com a tela. */
  motivo?: string;
};

export const emailConfigurado = () => Boolean(process.env.RESEND_API_KEY);

export async function enviarEmail(mensagem: EmailMessage): Promise<EmailResult> {
  const chave = process.env.RESEND_API_KEY;
  if (!chave) return { enviado: false, motivo: "envio de e-mail não configurado" };

  try {
    const resposta = await fetch(ENDPOINT, {
      method: "POST",
      headers: { authorization: `Bearer ${chave}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || REMETENTE_PADRAO,
        to: [mensagem.para],
        subject: mensagem.assunto,
        html: mensagem.html,
        text: mensagem.texto,
      }),
    });

    if (resposta.ok) return { enviado: true };

    // O corpo do erro do Resend não traz a chave; ainda assim só o texto dele
    // vai para o log, nunca o cabeçalho da requisição.
    const detalhe = await resposta.text().catch(() => "");
    const motivo = `Resend respondeu ${resposta.status}${detalhe ? `: ${detalhe.slice(0, 300)}` : ""}`;
    console.error(`[email] falha ao enviar para ${mensagem.para} — ${motivo}`);
    return { enviado: false, motivo };
  } catch (error) {
    const motivo = error instanceof Error ? error.message : "falha desconhecida";
    console.error(`[email] falha ao enviar para ${mensagem.para} — ${motivo}`);
    return { enviado: false, motivo };
  }
}

const escapar = (valor: string) =>
  valor.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Convite para entrar numa organização. */
export function templateConvite(dados: {
  organizacao: string;
  papel: string;
  convidadoPor: string;
  url: string;
  expiraEm: Date;
}): Omit<EmailMessage, "para"> {
  const validade = dados.expiraEm.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  const org = escapar(dados.organizacao);
  const papel = escapar(dados.papel);
  const quem = escapar(dados.convidadoPor);
  const url = escapar(dados.url);

  return {
    assunto: `Convite para acessar a ${dados.organizacao} no Nonia`,
    html: `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:15px;line-height:1.6;color:#1e293b">
  <p>Olá,</p>
  <p><strong>${quem}</strong> convidou você para acessar a <strong>${org}</strong> no Nonia, com o papel de <strong>${papel}</strong>.</p>
  <p><a href="${url}" style="display:inline-block;padding:12px 20px;background:#1e293b;color:#fff;border-radius:8px;text-decoration:none">Aceitar convite</a></p>
  <p style="color:#64748b;font-size:13px">Se o botão não funcionar, copie este endereço no navegador:<br>${url}</p>
  <p style="color:#64748b;font-size:13px">O convite vale até ${validade}. Se você não esperava por ele, pode ignorar esta mensagem.</p>
</div>`,
    texto: [
      `${dados.convidadoPor} convidou você para acessar a ${dados.organizacao} no Nonia, com o papel de ${dados.papel}.`,
      "",
      `Aceite o convite em: ${dados.url}`,
      "",
      `O convite vale até ${validade}. Se você não esperava por ele, pode ignorar esta mensagem.`,
    ].join("\n"),
  };
}
