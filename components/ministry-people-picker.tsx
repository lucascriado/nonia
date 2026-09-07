"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Crown, Search, Users } from "lucide-react";
import { Avatar } from "@/components/avatar";

/**
 * Uma pessoa no seletor, já com os compromissos que a API devolve em
 * `GET /api/members?compromissos=1` (opt-in: a rota é a mais pesada do sistema).
 *
 * `lidera` é ARRAY porque `ministries.leader_id` não tem UNIQUE -- uma pessoa
 * pode liderar mais de um ministério. `ministerio` é OBJETO OU NULL porque
 * `members` tem uma única coluna `ministry_id`: cada pessoa pertence a NO MÁXIMO
 * UM ministério. Não trate "pertencer" como plural -- o banco não guarda isso, e
 * prometer na tela o que ele não guarda vira defeito de dado. Ver o contrato do
 * backend (feat/auth-multitenant, 62cddf0).
 */
export type PickerPerson = {
  id: string;
  name: string;
  email: string;
  lidera?: { id: string; name: string }[];
  ministerio?: { id: string; name: string } | null;
};

/** Cerca de três nomes por página, como o Lucas pediu. */
const POR_PAGINA = 3;

/**
 * O compromisso que a pessoa JÁ tem, sinalizado em cinza -- e sempre em OUTRO
 * ministério que não este. Ao editar o ministério X, quem lidera X ou pertence a
 * X não está "comprometido em outro lugar": está aqui, e aparece como escolhido,
 * não como cinza. Na criação não há "este", então todo compromisso conta.
 *
 * Retorna a frase pronta, ou `null` quando a pessoa está livre.
 */
function compromissoDe(pessoa: PickerPerson, ministerioAtualId?: string): string | null {
  const lideraOutros = (pessoa.lidera ?? []).filter((m) => m.id !== ministerioAtualId);
  const pertenceOutro =
    pessoa.ministerio && pessoa.ministerio.id !== ministerioAtualId ? pessoa.ministerio : null;

  const partes: string[] = [];
  if (lideraOutros.length) partes.push(`Lidera ${lideraOutros.map((m) => m.name).join(", ")}`);
  if (pertenceOutro) partes.push(`No ministério ${pertenceOutro.name}`);
  return partes.length ? partes.join(" · ") : null;
}

export function MinistryPeoplePicker({
  people,
  mode,
  selectedIds,
  onToggle,
  ministryId,
  emptyLabel = "Ninguém no cadastro de membros ainda.",
}: {
  people: PickerPerson[];
  /** `leader` escolhe uma pessoa (rádio); `members` marca várias. */
  mode: "leader" | "members";
  /** Quem está escolhido -- um id no modo líder, vários no de membros. */
  selectedIds: string[];
  /** Alterna a pessoa. No modo líder, clicar em quem já está escolhido tira. */
  onToggle: (id: string) => void;
  /** Ao editar, o ministério sendo editado: quem já é dele não fica cinza. */
  ministryId?: string;
  emptyLabel?: string;
}) {
  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(0);

  const termo = busca.trim().toLocaleLowerCase("pt-BR");
  const filtradas = useMemo(() => {
    if (!termo) return people;
    return people.filter((p) => `${p.name} ${p.email}`.toLocaleLowerCase("pt-BR").includes(termo));
  }, [people, termo]);

  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / POR_PAGINA));
  // A busca muda o tamanho da lista; sem isto a página podia ficar além do fim
  // e a tela mostrar vazio com resultados existindo.
  useEffect(() => {
    setPagina((atual) => Math.min(atual, totalPaginas - 1));
  }, [totalPaginas]);
  useEffect(() => {
    setPagina(0);
  }, [termo]);

  const inicio = pagina * POR_PAGINA;
  const daPagina = filtradas.slice(inicio, inicio + POR_PAGINA);

  return (
    <div className="mpk">
      <label className="mpk-busca">
        <Search aria-hidden />
        <input
          value={busca}
          onChange={(evento) => setBusca(evento.target.value)}
          placeholder="Buscar pelo nome ou e-mail…"
        />
      </label>

      {filtradas.length === 0 ? (
        <p className="mpk-vazio">{termo ? "Ninguém com esse nome." : emptyLabel}</p>
      ) : (
        <>
          <ul className="mpk-lista">
            {daPagina.map((pessoa) => {
              const escolhida = selectedIds.includes(pessoa.id);
              const compromisso = compromissoDe(pessoa, ministryId);
              const classes = ["mpk-card", escolhida ? "is-escolhida" : "", compromisso ? "is-comprometida" : ""]
                .filter(Boolean)
                .join(" ");
              return (
                <li key={pessoa.id}>
                  <button
                    type="button"
                    className={classes}
                    role={mode === "leader" ? "radio" : "checkbox"}
                    aria-checked={escolhida}
                    onClick={() => onToggle(pessoa.id)}
                  >
                    <Avatar name={pessoa.name} size={38} />
                    <span className="mpk-dados">
                      <strong>{pessoa.name}</strong>
                      <small className="mpk-email">{pessoa.email}</small>
                      {compromisso && (
                        <small className="mpk-compromisso">
                          {(pessoa.lidera ?? []).some((m) => m.id !== ministryId) ? <Crown aria-hidden /> : <Users aria-hidden />}
                          {compromisso}
                        </small>
                      )}
                    </span>
                    <span className="mpk-marca" aria-hidden>{escolhida && <Check />}</span>
                  </button>
                </li>
              );
            })}
          </ul>

          {totalPaginas > 1 && (
            <div className="mpk-paginacao">
              <button type="button" onClick={() => setPagina((p) => Math.max(0, p - 1))} disabled={pagina === 0} aria-label="Página anterior">
                <ChevronLeft aria-hidden />
              </button>
              <span>{pagina + 1} de {totalPaginas}</span>
              <button type="button" onClick={() => setPagina((p) => Math.min(totalPaginas - 1, p + 1))} disabled={pagina >= totalPaginas - 1} aria-label="Próxima página">
                <ChevronRight aria-hidden />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
