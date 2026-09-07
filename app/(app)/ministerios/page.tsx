"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Baby, BookOpenCheck, Edit3, Eye, HeartHandshake, Layers, LoaderCircle, Music, Plus, Puzzle, Search, ShieldCheck, Trash2, Users, Video, X } from "lucide-react";
import { toast } from "sonner";
import { DashboardShell } from "@/components/dashboard-shell";
import { FirstLoad } from "@/components/first-load";
import { FirstRun } from "@/components/first-run";
import { HttpError, LoadFailure } from "@/components/load-failure";
import { READ_ONLY_REASON, usePermission, useReadOnly } from "@/components/current-user";
import { FilterDisclosure } from "@/components/filter-disclosure";
import { NumberSkeleton, Skeleton } from "@/components/skeleton";
import { AnimatedNumber } from "@/components/animated-number";
import { DeleteRecordDialog } from "@/components/person-record-dialog";

type MemberOption = { id: string; name: string; email: string; ministry?: string };
type Ministry = {
  id: string;
  name: string;
  color: "blue" | "green" | "gray" | "purple";
  description: string | null;
  leaderId: string | null;
  leaderName: string | null;
  memberCount: number;
  members: MemberOption[];
};
type Summary = { totalVolunteers: number; activeMinistries: number };
type MinistryFormValues = { name: string; description: string; color: "blue" | "green" | "gray" | "purple"; leaderId: string; memberIds: string[] };
type AttendanceMember = { id: string; name: string; email: string; present: boolean; notes: string | null };
type AttendanceHistory = { id: string; date: string; title: string | null; recordCount: number; presentCount: number; absentCount: number };

const emptyMinistry: MinistryFormValues = { name: "", description: "", color: "purple", leaderId: "", memberIds: [] };
const colorLabels: Record<Ministry["color"], string> = { blue: "Azul", green: "Verde", gray: "Cinza", purple: "Roxo" };

export default function MinistriesPage() {
  const readOnly = useReadOnly();
  /** Sem a permissão de escrita o botão não existe: o servidor recusaria. */
  const canWrite = usePermission("ministries.write");
  const [ministries, setMinistries] = useState<Ministry[]>([]);
  const [summary, setSummary] = useState<Summary>({ totalVolunteers: 0, activeMinistries: 0 });
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [loading, setLoading] = useState(true);
  /** Status HTTP da última leitura que falhou, ou `null`. Ver LoadFailure. */
  const [failed, setFailed] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [leader, setLeader] = useState("all");
  const [mode, setMode] = useState<"create" | "edit" | "view" | null>(null);
  const [selectedMinistry, setSelectedMinistry] = useState<Ministry | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Ministry | null>(null);

  async function loadData() {
    setLoading(true);
    try {
      const [ministriesResponse, membersResponse] = await Promise.all([
        fetch("/api/ministries", { cache: "no-store" }),
        fetch("/api/members?pageSize=100", { cache: "no-store" }),
      ]);
      // O status vem do de ministérios: é a leitura desta tela. A de membros
      // só alimenta o seletor do formulário.
      if (!ministriesResponse.ok) throw new HttpError(ministriesResponse.status, "Falha ao carregar ministérios");
      if (!membersResponse.ok) throw new HttpError(membersResponse.status, "Falha ao carregar membros");
      const data = await ministriesResponse.json() as { ministries: Ministry[]; summary: Summary };
      setMinistries(data.ministries);
      setSummary(data.summary);
      // /api/members passou a devolver { records, total }. O seletor de
      // membros precisa de TODOS, não de uma página — daí o pageSize no teto.
      const memberPayload = await membersResponse.json() as { records: MemberOption[] };
      setMembers(memberPayload.records.map((member) => ({ id: member.id, name: member.name, email: member.email, ministry: member.ministry })));
      setFailed(null);
    } catch (error) {
      setFailed(error instanceof HttpError ? error.status : 0);
      toast.error("Não foi possível carregar ministérios");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadData(); }, []);

  const leaders = useMemo(() => [...new Set(ministries.map((ministry) => ministry.leaderName).filter(Boolean))] as string[], [ministries]);
  const averageVolunteers = ministries.length ? Math.round(summary.totalVolunteers / ministries.length) : 0;
  const filteredMinistries = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return ministries.filter((ministry) => {
      const matchesSearch = !term || `${ministry.name} ${ministry.description ?? ""} ${ministry.leaderName ?? ""}`.toLocaleLowerCase("pt-BR").includes(term);
      return matchesSearch
        && (leader === "all" || ministry.leaderName === leader);
    });
  }, [leader, ministries, search]);

  const activeFilters = [leader !== "all", search.trim() !== ""].filter(Boolean).length;

  const firstRun = !loading && failed === null && !mode && ministries.length === 0 && activeFilters === 0;
  /* O terceiro estado: ainda NÃO SABEMOS se há registro.
     Sem ele, `firstRun` é falso enquanto carrega e o ramo de baixo desenha a
     tela cheia -- indicadores rotulados, filtros e abas -- que some quando a
     resposta chega vazia. Ver components/first-load.tsx. */
  const aguardando = loading && failed === null && !ministries.length && activeFilters === 0;

  function clearFilters() {
    setSearch("");
    setLeader("all");
  }

  async function saveMinistry(values: MinistryFormValues) {
    const editing = mode === "edit" && selectedMinistry;
    const response = await fetch(editing ? `/api/ministries/${selectedMinistry.id}` : "/api/ministries", {
      method: editing ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    if (!response.ok) {
      toast.error("Não foi possível salvar o ministério");
      return false;
    }
    toast.success(editing ? "Ministério atualizado com sucesso" : "Ministério criado com sucesso");
    closeForm();
    await loadData();
    return true;
  }

  async function confirmDeleteMinistry() {
    if (!deleteTarget) return false;
    const response = await fetch(`/api/ministries/${deleteTarget.id}`, { method: "DELETE" });
    if (!response.ok) {
      toast.error("Não foi possível excluir o ministério");
      return false;
    }
    toast.success("Ministério excluído");
    setDeleteTarget(null);
    await loadData();
    return true;
  }

  function openForm(nextMode: "create" | "edit" | "view", ministry: Ministry | null = null) {
    setSelectedMinistry(ministry);
    setMode(nextMode);
  }

  function closeForm() {
    setMode(null);
    setSelectedMinistry(null);
  }

  return (
    <DashboardShell title="Gestão de Ministérios">
      <main className="ministries-main">
        {/* Sem título aqui: ele vive na BARRA DO TOPO, e só lá. A faixa de
            ações FICA -- ela é o que esta seção passa a ser. Ver
            components/header.tsx, que monta título e legenda de `searchItems`. */}
        <section className="resource-heading is-acoes">
          {!mode && canWrite && <button disabled={readOnly} title={readOnly ? READ_ONLY_REASON : undefined} className="primary-action" onClick={() => openForm("create")}><Plus />Novo Ministério</button>}
        </section>

        {mode ? (
          <MinistryForm mode={mode} ministry={selectedMinistry} members={members} onClose={closeForm} onSubmit={saveMinistry} />
        ) : (
          <>
            {failed !== null ? (
              <LoadFailure onRetry={() => void loadData()} status={failed} />
            ) : aguardando ? (
          <FirstLoad label="Carregando os ministérios" />
        ) : firstRun ? (
              <FirstRun
                action={
                  readOnly ? undefined : (
                    <button className="primary-action" onClick={() => openForm("create")} type="button">
                      <Plus />Criar o primeiro ministério
                    </button>
                  )
                }
                icon={Puzzle}
                text="Monte as equipes que servem na igreja, com responsável e registro de presença nos encontros."
                title="Nenhum ministério cadastrado ainda"
              />
            ) : (
            <>
            <section className="resource-stats">
              <article><span><Users /></span><small>Total voluntários</small><strong>{loading ? <NumberSkeleton /> : <><AnimatedNumber value={summary.totalVolunteers} /> pessoas</>}</strong></article>
              <article><span><HeartHandshake /></span><small>Ministérios ativos</small><strong>{loading ? <NumberSkeleton /> : <><AnimatedNumber value={summary.activeMinistries} /> grupos</>}</strong></article>
              <article><span><Layers /></span><small>Média por ministério</small><strong>{loading ? <NumberSkeleton /> : <><AnimatedNumber value={averageVolunteers} /> pessoas</>}</strong></article>
            </section>

            <FilterDisclosure activeCount={activeFilters}>
              <div className="member-filters resource-filters">
                <select aria-label="Filtrar por líder" value={leader} onChange={(event) => setLeader(event.target.value)}>
                  <option value="all">Líder: Todos</option>
                  {leaders.map((item) => <option key={item}>{item}</option>)}
                </select>
                <label className="member-filter-search"><Search /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Filtrar ministério..." /></label>
                <button className="clear-filters" onClick={clearFilters}>Limpar Filtros</button>
              </div>
            </FilterDisclosure>

            <section className="ministries-grid">
              {loading && Array.from({ length: 4 }).map((_, index) => <ResourceCardSkeleton key={index} />)}
              {!loading && filteredMinistries.map((ministry) => (
                <article className={`resource-card ministry-card tone-${ministry.color}`} key={ministry.id}>
                  <header>
                    <span className="resource-icon">{ministryIcon(ministry.name)}</span>
                    <em>{ministry.memberCount.toString().padStart(2, "0")} pessoas</em>
                  </header>
                  <h3>{ministry.name}</h3>
                  <p>{ministry.description || "Sem descrição cadastrada para este ministério."}</p>
                  <small>Líder: {ministry.leaderName || "não definido"}</small>
                  <footer>
                    <button onClick={() => openForm("view", ministry)}><Eye />Visualizar</button>
                    {canWrite && <>
                    <button disabled={readOnly} title={readOnly ? READ_ONLY_REASON : undefined} onClick={() => openForm("edit", ministry)}><Edit3 />Editar</button>
                    <button className="danger" disabled={readOnly} title={readOnly ? READ_ONLY_REASON : undefined} onClick={() => setDeleteTarget(ministry)}><Trash2 />Excluir</button>
                    </>}
                  </footer>
                </article>
              ))}
              {!loading && !filteredMinistries.length && <p className="data-empty">{ministries.length ? "Nenhum ministério encontrado com esses filtros." : "Nenhum ministério cadastrado ainda. Crie o primeiro pelo botão Novo Ministério."}</p>}
            </section>
            </>
            )}
          </>
        )}
      </main>
      <DeleteRecordDialog open={deleteTarget !== null} name={deleteTarget?.name ?? ""} kind="ministry" onClose={() => setDeleteTarget(null)} onConfirm={confirmDeleteMinistry} />
    </DashboardShell>
  );
}

function MinistryForm({ mode, ministry, members, onClose, onSubmit }: { mode: "create" | "edit" | "view"; ministry: Ministry | null; members: MemberOption[]; onClose: () => void; onSubmit: (values: MinistryFormValues) => Promise<boolean> }) {
  const [values, setValues] = useState<MinistryFormValues>(emptyMinistry);
  const [memberSearch, setMemberSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const readOnly = mode === "view";
  /**
   * Quem JÁ está no ministério, na ordem em que se lê um nome.
   *
   * Antes esta lista não existia: as pessoas do ministério eram as caixas
   * marcadas no meio de todas as outras, e para saber quem estava dentro era
   * preciso percorrer trinta linhas procurando o que estava marcado.
   */
  const equipe = useMemo(
    () => values.memberIds
      .map((id) => members.find((m) => m.id === id))
      .filter((m): m is MemberOption => Boolean(m))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    [members, values.memberIds],
  );

  /**
   * A BUSCA é o caminho para achar alguém, e não a lista inteira.
   *
   * Antes eram trinta e poucas caixas de seleção numa grade rolante, dentro de
   * um formulário que já não cabia na janela -- medi 911px numa tela de 900. E
   * a alternativa de paginar não resolve: com 100 pessoas em blocos de três
   * são 34 páginas para achar UMA. Paginação serve para folhear, e ninguém
   * folheia para montar equipe -- quem monta já sabe o nome.
   *
   * Por isso nada aparece com a busca vazia: sugestão sem pergunta é a parede
   * de caixas com outra roupa.
   */
  const sugestoes = useMemo(() => {
    const term = memberSearch.trim().toLocaleLowerCase("pt-BR");
    if (term.length < 2) return [];
    return members
      .filter((member) => !values.memberIds.includes(member.id))
      .filter((member) => `${member.name} ${member.email}`.toLocaleLowerCase("pt-BR").includes(term))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
      .slice(0, 6);
  }, [memberSearch, members, values.memberIds]);

  useEffect(() => {
    setSaving(false);
    setMemberSearch("");
    setValues(ministry ? {
      name: ministry.name,
      description: ministry.description ?? "",
      color: ministry.color,
      leaderId: ministry.leaderId ?? "",
      memberIds: ministry.members.map((member) => member.id),
    } : emptyMinistry);
  }, [ministry]);

  /**
   * A equipe mudou e ainda NÃO foi salva.
   *
   * A interação mudou e o contrato não: a associação continua indo no mesmo
   * PUT do ministério. Quem clica em incluir e fecha sem salvar acha que
   * incluiu -- e a tela tem que dizer isso ANTES, não depois.
   */
  const equipeMudou = useMemo(() => {
    if (!ministry) return false;
    const salvos = [...ministry.members.map((m) => m.id)].sort();
    const agora = [...values.memberIds].sort();
    return salvos.length !== agora.length || salvos.some((id, i) => id !== agora[i]);
  }, [ministry, values.memberIds]);

  function incluirMembro(memberId: string) {
    setValues((current) => current.memberIds.includes(memberId)
      ? current
      : { ...current, memberIds: [...current.memberIds, memberId] });
    setMemberSearch("");
  }

  function tirarMembro(memberId: string) {
    setValues((current) => ({ ...current, memberIds: current.memberIds.filter((id) => id !== memberId) }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving || readOnly) return;
    setSaving(true);
    try {
      await onSubmit(values);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="resource-dialog resource-page-form ministry-resource-dialog" onSubmit={submit}>
      <header><div><strong>{mode === "create" ? "Novo Ministério" : mode === "view" ? "Visualizar Ministério" : "Editar Ministério"}</strong><span>Vincule membros existentes ao ministério.</span></div><button type="button" onClick={onClose} aria-label="Fechar"><X /></button></header>
      <fieldset disabled={saving}>
        <label><span>Nome *</span><input required readOnly={readOnly} value={values.name} onChange={(event) => setValues((current) => ({ ...current, name: event.target.value }))} /></label>
        <label><span>Líder</span><select disabled={readOnly} value={values.leaderId} onChange={(event) => setValues((current) => ({ ...current, leaderId: event.target.value }))}><option value="">Sem líder definido</option>{members.map((member) => <option value={member.id} key={member.id}>{member.name}</option>)}</select></label>
        <label><span>Cor</span><select disabled={readOnly} value={values.color} onChange={(event) => setValues((current) => ({ ...current, color: event.target.value as MinistryFormValues["color"] }))}><option value="purple">Roxo</option><option value="blue">Azul</option><option value="green">Verde</option><option value="gray">Cinza</option></select></label>
        <label className="wide form-section-field"><span>Descrição</span><textarea readOnly={readOnly} value={values.description} onChange={(event) => setValues((current) => ({ ...current, description: event.target.value }))} /></label>
        {/* CRIAR MINISTÉRIO NÃO EXIGE ESCOLHER GENTE. No cadastro o bloco de
            equipe nem aparece: o ministério nasce com nome, líder, cor e
            descrição, e as pessoas entram depois, aqui mesmo, quando ele já
            existe. Isso é metade do que derrubou os 911px que não cabiam. */}
        {mode !== "create" && (
          <div className="equipe wide">
            <span className="equipe-titulo">Membros do ministério</span>

            {equipe.length > 0 ? (
              <ul className="equipe-lista">
                {equipe.map((membro) => (
                  <li key={membro.id}>
                    <strong>{membro.name}</strong>
                    <small>{membro.email}</small>
                    {!readOnly && (
                      <button aria-label={`Tirar ${membro.name} do ministério`} onClick={() => tirarMembro(membro.id)} type="button">
                        <X aria-hidden />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="equipe-vazia">Ninguém neste ministério ainda.</p>
            )}

            {/* Dito ANTES de fechar, e não depois: a associação vai no mesmo
                Salvar do ministério, e quem inclui e sai sem salvar acha que
                incluiu. */}
            {equipeMudou && !readOnly && (
              <p className="equipe-pendente" role="status">
                A equipe mudou e ainda não foi salva. Clique em <strong>Salvar Ministério</strong> para valer.
              </p>
            )}

            {!readOnly && (
              <div className="equipe-busca">
                <label className="member-filter-search">
                  <Search aria-hidden />
                  <input
                    onChange={(event) => setMemberSearch(event.target.value)}
                    placeholder="Buscar quem já está cadastrado…"
                    value={memberSearch}
                  />
                </label>
                {/* Nada aparece com a busca vazia: lista inteira sem pergunta é
                    a parede de caixas de antes com outra roupa. */}
                {memberSearch.trim().length >= 2 && (
                  sugestoes.length ? (
                    <ul className="equipe-sugestoes">
                      {sugestoes.map((membro) => (
                        <li key={membro.id}>
                          <button onClick={() => incluirMembro(membro.id)} type="button">
                            <strong>{membro.name}</strong>
                            <small>{membro.ministry && membro.ministry !== "Nenhum" ? `Hoje em ${membro.ministry}` : "Sem ministério"}</small>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="equipe-vazia">Ninguém com esse nome fora deste ministério.</p>
                  )
                )}
                {/* O lugar de chamar quem AINDA NÃO existe no cadastro fica
                    marcado e vazio de propósito: o convite que o produto tem
                    cria USUÁRIO e ocupa assento do plano, e voluntário de
                    ministério não precisa de login. Enquanto não se decidir se
                    é dar acesso ou só avisar a pessoa, qualquer comportamento
                    aqui tem chance de ser o errado -- e o errado gasta assento
                    pago por voluntário. */}
                <small className="equipe-nota">Só aparece quem já está no cadastro de membros.</small>
              </div>
            )}
          </div>
        )}
      </fieldset>
      {!readOnly && <footer><button type="button" onClick={onClose} disabled={saving}>Cancelar</button><button className="primary-action" disabled={saving}>{saving ? <LoaderCircle className="button-spinner" /> : <Plus />}{saving ? "Salvando..." : "Salvar Ministério"}</button></footer>}
    </form>
  );
}

function ResourceCardSkeleton() {
  return (
    <article className="resource-card resource-loading-card">
      <div className="resource-loading-top"><Skeleton className="resource-loading-icon" /><Skeleton className="resource-loading-pill" /></div>
      <Skeleton className="resource-loading-title" />
      <Skeleton className="resource-loading-text" />
      <Skeleton className="resource-loading-text short" />
      <div className="resource-loading-actions"><Skeleton /><Skeleton /><Skeleton /></div>
    </article>
  );
}

function AttendanceDialog({ ministry, onClose }: { ministry: Ministry | null; onClose: () => void }) {
  const [date, setDate] = useState(nextSunday());
  const [members, setMembers] = useState<AttendanceMember[]>([]);
  const [history, setHistory] = useState<AttendanceHistory[]>([]);
  const [memberSearch, setMemberSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const filteredMembers = useMemo(() => {
    const term = memberSearch.trim().toLocaleLowerCase("pt-BR");
    return members.filter((member) => !term || `${member.name} ${member.email}`.toLocaleLowerCase("pt-BR").includes(term));
  }, [memberSearch, members]);

  useEffect(() => {
    if (!ministry) return;
    setDate(nextSunday());
    setMemberSearch("");
  }, [ministry]);

  useEffect(() => {
    if (!ministry) return;
    const controller = new AbortController();
    const ministryId = ministry.id;
    async function loadHistory() {
      setHistoryLoading(true);
      try {
        const response = await fetch(`/api/ministries/${ministryId}/attendance?history=1`, { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error("Falha ao carregar histórico");
        const data = await response.json() as { records: AttendanceHistory[] };
        setHistory(data.records);
      } catch (error) {
        if ((error as Error).name !== "AbortError") toast.error("Não foi possível carregar o histórico de chamadas");
      } finally {
        setHistoryLoading(false);
      }
    }
    void loadHistory();
    return () => controller.abort();
  }, [ministry]);

  useEffect(() => {
    if (!ministry) return;
    const controller = new AbortController();
    const ministryId = ministry.id;
    async function loadAttendance() {
      setLoading(true);
      try {
        const response = await fetch(`/api/ministries/${ministryId}/attendance?date=${date}`, { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error("Falha ao carregar chamada");
        const data = await response.json() as { members: AttendanceMember[] };
        setMembers(data.members);
        setMemberSearch("");
      } catch (error) {
        if ((error as Error).name !== "AbortError") toast.error("Não foi possível carregar a chamada");
      } finally {
        setLoading(false);
      }
    }
    void loadAttendance();
    return () => controller.abort();
  }, [date, ministry]);

  if (!ministry) return null;
  const currentMinistry = ministry;

  async function saveAttendance() {
    setSaving(true);
    try {
      const response = await fetch(`/api/ministries/${currentMinistry.id}/attendance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, records: members.map((member) => ({ memberId: member.id, present: member.present, notes: member.notes ?? "" })) }),
      });
      if (!response.ok) throw new Error("Falha ao salvar chamada");
      toast.success("Chamada salva com sucesso");
      onClose();
    } catch {
      toast.error("Não foi possível salvar a chamada");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="record-dialog-layer attendance-dialog-layer" role="dialog" aria-modal="true">
      <section className="resource-dialog attendance-dialog">
        <header><div><strong>Chamada da Escola Bíblica</strong><span>{ministry.name}</span></div><button type="button" onClick={onClose} aria-label="Fechar"><X /></button></header>
        <div className="attendance-toolbar"><label><span>Data</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label><button onClick={() => setMembers((current) => current.map((member) => ({ ...member, present: true })))}>Marcar todos</button></div>
        <div className="attendance-layout">
          <section className="attendance-members-panel">
            <label className="attendance-search"><Search /><input value={memberSearch} onChange={(event) => setMemberSearch(event.target.value)} placeholder="Pesquisar membro..." /></label>
            <div className="attendance-list">
              {loading && <p className="data-empty">Carregando chamada...</p>}
              {!loading && filteredMembers.map((member) => (
                <label key={member.id} className={member.present ? "present" : ""}>
                  <input type="checkbox" checked={member.present} onChange={(event) => setMembers((current) => current.map((item) => item.id === member.id ? { ...item, present: event.target.checked } : item))} />
                  <span><strong>{member.name}</strong><small>{member.email}</small></span>
                </label>
              ))}
              {!loading && !members.length && <p className="data-empty">Este ministério ainda não tem membros vinculados.</p>}
              {!loading && members.length > 0 && !filteredMembers.length && <p className="data-empty">Nenhum membro encontrado.</p>}
            </div>
          </section>
          <aside className="attendance-history">
            <h3>Histórico de Chamadas</h3>
            {historyLoading && <p className="data-empty">Carregando histórico...</p>}
            {!historyLoading && history.map((item) => (
              <button className={item.date.slice(0, 10) === date ? "active" : undefined} key={item.id} onClick={() => setDate(item.date.slice(0, 10))}>
                <strong>{formatAttendanceDate(item.date)}</strong>
                <span>{item.presentCount}/{item.recordCount} presentes</span>
              </button>
            ))}
            {!historyLoading && !history.length && <p className="data-empty">Nenhuma chamada registrada.</p>}
          </aside>
        </div>
        <footer><button onClick={onClose} disabled={saving}>Cancelar</button><button className="primary-action" onClick={saveAttendance} disabled={saving || loading}>{saving ? <LoaderCircle className="button-spinner" /> : <BookOpenCheck />}{saving ? "Salvando..." : "Salvar Chamada"}</button></footer>
      </section>
    </div>
  );
}

function ministryIcon(name: string) {
  const normalized = name.toLocaleLowerCase("pt-BR");
  if (normalized.includes("acolhimento")) return <HeartHandshake />;
  if (normalized.includes("infantil") || normalized.includes("crian")) return <Baby />;
  if (normalized.includes("louvor")) return <Music />;
  if (normalized.includes("mídia") || normalized.includes("midia")) return <Video />;
  if (normalized.includes("recepção") || normalized.includes("recepcao")) return <HeartHandshake />;
  if (normalized.includes("segurança") || normalized.includes("seguranca")) return <ShieldCheck />;
  return <Users />;
}

function nextSunday() {
  const date = new Date();
  const day = date.getDay();
  const offset = day === 0 ? 0 : 7 - day;
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
}

function formatAttendanceDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(value)).replace(".", "");
}
