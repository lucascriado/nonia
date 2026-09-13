"use client";

import { useState } from "react";
import { ChevronDown, Mail } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { faqTopics } from "@/lib/faq-topics";

/**
 * A documentação, DENTRO do app.
 *
 * O conteúdo é o mesmo da /faq pública e vem do mesmo módulo -- duas cópias
 * divergiriam e a igreja passaria a ter duas verdades sobre o próprio produto.
 *
 * A tela existe porque mandar quem já está logado para o site público é
 * estranho de um jeito que não se aceitaria em nenhuma outra tela: ele sai do
 * painel e cai numa página que oferece "Criar conta da igreja" para quem já
 * tem conta.
 */
export default function AjudaPage() {
  const [aberta, setAberta] = useState<string | null>(null);

  return (
    <DashboardShell title="Documentação">
      <main className="ajuda-main">
        <nav aria-label="Assuntos" className="ajuda-indice">
          {faqTopics.map((topico) => (
            <a href={`#${topico.id}`} key={topico.id}>
              <topico.icon aria-hidden />
              <span>{topico.title}</span>
            </a>
          ))}
        </nav>

        <div className="ajuda-conteudo">
          {faqTopics.map((topico) => (
            <section aria-labelledby={`${topico.id}-titulo`} className="ajuda-topico" id={topico.id} key={topico.id}>
              <header>
                <span aria-hidden className="ajuda-icone"><topico.icon /></span>
                <div>
                  <small>{topico.eyebrow}</small>
                  <h2 id={`${topico.id}-titulo`}>{topico.title}</h2>
                </div>
              </header>
              <p className="ajuda-resumo">{topico.summary}</p>

              <ul className="ajuda-pontos">
                {topico.points.map((ponto) => <li key={ponto}>{ponto}</li>)}
              </ul>

              <div className="ajuda-perguntas">
                {topico.questions.map((item) => {
                  const chave = `${topico.id}:${item.question}`;
                  const abertaAgora = aberta === chave;
                  return (
                    <div className={abertaAgora ? "is-aberta" : undefined} key={chave}>
                      <button aria-expanded={abertaAgora} onClick={() => setAberta(abertaAgora ? null : chave)} type="button">
                        <span>{item.question}</span>
                        <ChevronDown aria-hidden />
                      </button>
                      {abertaAgora && <p>{item.answer}</p>}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}

          {/* O caminho humano NÃO some com a troca do rótulo da barra lateral:
              ele desce para cá, que é onde está quem não achou a resposta.
              Antes desta tela, este era o único e-mail de suporte dentro do
              app -- tirá-lo da barra sem pôr em lugar nenhum deixaria a igreja
              sem saída humana. */}
          <section className="ajuda-contato">
            <h2>Não achou aqui?</h2>
            <p>Escreva para a gente. Respondemos em português, por gente que conhece a rotina de uma secretaria de igreja.</p>
            <a className="primary-action" href="mailto:suporte@nonia.app">
              <Mail aria-hidden />Falar com o suporte
            </a>
          </section>
        </div>
      </main>
    </DashboardShell>
  );
}
