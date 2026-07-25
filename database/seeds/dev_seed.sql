-- Seed de demonstração/desenvolvimento do Nonia.
-- Idempotente: pode ser executado mais de uma vez sem duplicar registros.
-- Não use em produção; o banco de produção começa vazio.

INSERT INTO ministries (name, color, description) VALUES
  ('Louvor', 'blue', 'Equipe de música e adoração.'),
  ('Missões', 'green', 'Projetos missionários e evangelismo.'),
  ('Acolhimento', 'purple', 'Recepção e integração de visitantes.'),
  ('Infantil', 'purple', 'Ministério com crianças.')
ON CONFLICT (name) DO UPDATE SET color = EXCLUDED.color, description = EXCLUDED.description;

INSERT INTO people (full_name, email, birth_date) VALUES
  ('Ana Clara Oliveira', 'ana.clara@exemplo.com', '1994-03-12'),
  ('Marcos Santos', 'marcos.santos@exemplo.com', '1988-07-25'),
  ('Julia Pereira', 'julia.p@exemplo.com', '1999-01-30'),
  ('Ricardo Mendes', 'mendes.r@exemplo.com', '1979-11-02'),
  ('Beatriz Lima', 'bia.lima@exemplo.com', '1996-05-18'),
  ('Gabriel Souza', 'gabriel.s@exemplo.com', '2001-09-09'),
  ('Carla Martins', 'carla.m@exemplo.com', '1985-12-21'),
  ('Paulo Henrique', 'paulo.h@exemplo.com', '1972-04-14'),
  ('Larissa Freitas', 'larissa.f@exemplo.com', '1998-08-08'),
  ('Daniel Rocha', 'daniel.r@exemplo.com', '1991-06-27'),
  ('Mariana Teixeira', 'mariana.t@exemplo.com', '1995-10-05'),
  ('Felipe Costa', 'felipe.c@exemplo.com', '1983-02-16'),
  ('Eduarda Silva', 'eduarda.s@exemplo.com', '1997-07-07'),
  ('Rafael Alves', 'rafael.a@exemplo.com', '1993-03-29'),
  ('Natália Cardoso', 'natalia.c@exemplo.com', '1990-09-23'),
  ('Vinícius Carvalho', 'vinicius.c@exemplo.com', '2000-01-11'),
  ('Isabela Santos', 'isabela.s@exemplo.com', '1992-05-31'),
  ('Henrique Oliveira', 'henrique.o@exemplo.com', '1987-08-19'),
  ('Ricardo Lima', 'ricardo.lima@exemplo.com', '1984-10-10'),
  ('Mariana Souza', 'mari.souza@exemplo.com', '1997-12-03'),
  ('Fernando Borges', 'fborges@exemplo.com', '1976-06-06'),
  ('Clara Pereira', 'clara.p@exemplo.com', '2002-02-22'),
  ('André Martins', 'andre.m@exemplo.com', '1989-04-04'),
  ('Letícia Costa', 'leticia.c@exemplo.com', '1995-11-15'),
  ('João Vitor', 'joao.v@exemplo.com', '1998-09-01'),
  ('Bianca Santos', 'bianca.s@exemplo.com', '1996-03-08'),
  ('Gustavo Melo', 'gustavo.m@exemplo.com', '1981-07-17'),
  ('Tainá Alves', 'taina.a@exemplo.com', '1999-05-25'),
  ('Renata Barbosa', 'renata.b@exemplo.com', '1986-01-19'),
  ('Diego Nunes', 'diego.n@exemplo.com', '1994-08-28')
ON CONFLICT ((lower(email))) DO UPDATE SET full_name = EXCLUDED.full_name;

INSERT INTO members (person_id, ministry_id, status, baptism_status, admission_date, is_new, cell_name)
SELECT p.id, mi.id, data.status, data.baptism_status, data.admission_date, data.is_new, data.cell_name
FROM (
  VALUES
    ('ana.clara@exemplo.com', 'Louvor', 'active', 'baptized', DATE '2021-05-15', false, 'Célula Esperança'),
    ('marcos.santos@exemplo.com', 'Missões', 'active', 'baptized', DATE '2020-01-10', false, 'Célula Graça'),
    ('julia.p@exemplo.com', NULL, 'inactive', 'waiting', DATE '2023-08-22', false, 'Sem célula'),
    ('mendes.r@exemplo.com', 'Acolhimento', 'active', 'baptized', DATE '2019-04-05', false, 'Célula Família'),
    ('bia.lima@exemplo.com', 'Infantil', 'active', 'baptized', DATE '2022-02-18', true, 'Célula Esperança'),
    ('gabriel.s@exemplo.com', 'Louvor', 'active', 'waiting', DATE '2024-03-03', true, 'Célula Jovens'),
    ('carla.m@exemplo.com', 'Missões', 'active', 'baptized', DATE '2018-09-11', false, 'Célula Graça'),
    ('paulo.h@exemplo.com', 'Acolhimento', 'inactive', 'baptized', DATE '2017-06-29', false, 'Célula Família'),
    ('larissa.f@exemplo.com', 'Infantil', 'active', 'waiting', DATE '2024-05-07', true, 'Célula Jovens'),
    ('daniel.r@exemplo.com', 'Louvor', 'active', 'baptized', DATE '2020-11-14', false, 'Célula Esperança'),
    ('mariana.t@exemplo.com', NULL, 'active', 'waiting', DATE '2024-04-23', true, 'Sem célula'),
    ('felipe.c@exemplo.com', 'Missões', 'inactive', 'baptized', DATE '2016-07-17', false, 'Célula Graça'),
    ('eduarda.s@exemplo.com', 'Acolhimento', 'active', 'baptized', DATE '2021-10-09', false, 'Célula Família'),
    ('rafael.a@exemplo.com', 'Louvor', 'active', 'waiting', DATE '2024-05-28', true, 'Célula Jovens'),
    ('natalia.c@exemplo.com', 'Infantil', 'active', 'baptized', DATE '2019-12-12', false, 'Célula Esperança'),
    ('vinicius.c@exemplo.com', NULL, 'inactive', 'waiting', DATE '2023-01-06', false, 'Sem célula'),
    ('isabela.s@exemplo.com', 'Missões', 'active', 'baptized', DATE '2022-08-19', false, 'Célula Graça'),
    ('henrique.o@exemplo.com', 'Acolhimento', 'active', 'waiting', DATE '2024-05-02', true, 'Célula Família')
) AS data(email, ministry, status, baptism_status, admission_date, is_new, cell_name)
JOIN people p ON lower(p.email) = lower(data.email)
LEFT JOIN ministries mi ON mi.name = data.ministry
ON CONFLICT (person_id) DO UPDATE SET
  ministry_id = EXCLUDED.ministry_id,
  status = EXCLUDED.status,
  baptism_status = EXCLUDED.baptism_status,
  admission_date = EXCLUDED.admission_date,
  is_new = EXCLUDED.is_new,
  cell_name = EXCLUDED.cell_name;

INSERT INTO visitors (person_id, visit_date, invited_by, follow_up_status, membership_stage, is_recent)
SELECT p.id, data.visit_date, data.invited_by, data.follow_up_status, data.membership_stage, data.is_recent
FROM (
  VALUES
    ('ricardo.lima@exemplo.com', CURRENT_DATE - 3, 'Pr. Anderson', 'waiting_contact', 'visited', true),
    ('mari.souza@exemplo.com', CURRENT_DATE - 6, 'Espontâneo', 'following_up', 'contacted', true),
    ('fborges@exemplo.com', CURRENT_DATE - 13, 'Lucas Santos', 'integrated', 'member', true),
    ('clara.p@exemplo.com', CURRENT_DATE - 3, 'Marta Oliveira', 'waiting_contact', 'visited', true),
    ('andre.m@exemplo.com', CURRENT_DATE - 20, 'Paulo Henrique', 'following_up', 'home_visit', false),
    ('leticia.c@exemplo.com', CURRENT_DATE - 27, 'Ana Clara', 'integrated', 'member', false),
    ('joao.v@exemplo.com', CURRENT_DATE - 34, 'Espontâneo', 'waiting_contact', 'visited', false),
    ('bianca.s@exemplo.com', CURRENT_DATE - 41, 'Marcos Santos', 'following_up', 'contacted', false),
    ('gustavo.m@exemplo.com', CURRENT_DATE - 48, 'Ricardo Mendes', 'integrated', 'baptism', false),
    ('taina.a@exemplo.com', CURRENT_DATE - 55, 'Marta Oliveira', 'waiting_contact', 'visited', false),
    ('renata.b@exemplo.com', CURRENT_DATE - 62, 'Pr. Anderson', 'following_up', 'contacted', false),
    ('diego.n@exemplo.com', CURRENT_DATE - 69, 'Espontâneo', 'integrated', 'member', false)
) AS data(email, visit_date, invited_by, follow_up_status, membership_stage, is_recent)
JOIN people p ON lower(p.email) = lower(data.email)
ON CONFLICT (person_id) DO UPDATE SET
  visit_date = EXCLUDED.visit_date,
  invited_by = EXCLUDED.invited_by,
  follow_up_status = EXCLUDED.follow_up_status,
  membership_stage = EXCLUDED.membership_stage,
  is_recent = EXCLUDED.is_recent;

INSERT INTO cells (name, meeting_day, meeting_time, color)
SELECT DISTINCT cell_name, 'Domingo', '19:30'::time, 'purple'
FROM members
WHERE cell_name <> 'Sem célula'
ON CONFLICT (name) DO NOTHING;

INSERT INTO cell_members (cell_id, member_id)
SELECT c.id, m.person_id
FROM members m
JOIN cells c ON c.name = m.cell_name
ON CONFLICT DO NOTHING;

INSERT INTO events (title, description, location, starts_at, ends_at, color)
SELECT data.title, data.description, data.location, data.starts_at, data.ends_at, data.color
FROM (
  VALUES
    ('Culto de Celebração', 'Encontro semanal da congregação.', 'Templo Principal', date_trunc('day', now()) + interval '2 days 19 hours', date_trunc('day', now()) + interval '2 days 21 hours', 'purple'),
    ('Reunião de Liderança', 'Alinhamento mensal com líderes de ministérios.', 'Sala 04', date_trunc('day', now()) + interval '5 days 19 hours 30 minutes', date_trunc('day', now()) + interval '5 days 21 hours', 'green'),
    ('Encontro de Jovens', 'Noite de comunhão e palavra.', 'Auditório', date_trunc('day', now()) + interval '8 days 19 hours', date_trunc('day', now()) + interval '8 days 22 hours', 'blue'),
    ('Classe de Batismo', 'Preparação dos candidatos ao batismo.', 'Sala 02', date_trunc('day', now()) + interval '9 days 9 hours', date_trunc('day', now()) + interval '9 days 11 hours', 'green'),
    ('Conferência Missionária', 'Programação especial do ministério de missões.', 'Templo Principal', date_trunc('day', now()) + interval '15 days 18 hours', date_trunc('day', now()) + interval '15 days 22 hours', 'purple')
) AS data(title, description, location, starts_at, ends_at, color)
WHERE NOT EXISTS (SELECT 1 FROM events e WHERE e.title = data.title);

INSERT INTO activities (category, actor, action, subject, details, occurred_at)
SELECT data.category, data.actor, data.action, data.subject, data.details, data.occurred_at
FROM (
  VALUES
    ('members', 'Ana Silva', 'cadastrou um novo membro', 'Lucas Oliveira', 'Cadastro concluído com ministério e célula definidos.', now() - interval '2 hours'),
    ('calendar', 'Secretaria Geral', 'agendou uma classe de batismo', '12 candidatos', 'Atividade adicionada ao calendário ministerial.', now() - interval '5 hours'),
    ('system', 'Sistema', 'concluiu o backup automático', 'Banco de dados', 'Rotina diária executada sem falhas.', now() - interval '9 hours'),
    ('visitors', 'Pr. Renato', 'registrou o primeiro contato com', 'Mariana Souza', 'Visitante encaminhada para acompanhamento.', now() - interval '1 day 3 hours'),
    ('members', 'Marcos Paulo', 'atualizou as informações de contato de', 'Fernando Dias', 'Telefone e endereço atualizados.', now() - interval '1 day 8 hours'),
    ('calendar', 'Secretaria Geral', 'confirmou o evento', 'Culto de Celebração', 'Equipe e local confirmados.', now() - interval '2 days 4 hours'),
    ('visitors', 'Equipe de Acolhimento', 'integrou uma visitante', 'Clara Pereira', 'Integração concluída com sucesso.', now() - interval '2 days 7 hours'),
    ('members', 'Secretaria Geral', 'registrou o batismo de', 'Gabriel Souza', 'Situação de batismo atualizada.', now() - interval '3 days 6 hours')
) AS data(category, actor, action, subject, details, occurred_at)
WHERE NOT EXISTS (
  SELECT 1 FROM activities a
  WHERE a.category = data.category AND a.actor = data.actor AND a.action = data.action
    AND a.subject IS NOT DISTINCT FROM data.subject
);

INSERT INTO financial_transactions (type, description, category, counterparty, amount, status, transaction_date, payment_method, attachment_url, attachment_name, notes)
SELECT data.type, data.description, data.category, data.counterparty, data.amount, data.status, data.transaction_date, data.payment_method, data.attachment_url, data.attachment_name, data.notes
FROM (
  VALUES
    ('income', 'Dízimos do mês', 'Dízimos', 'Congregação', 18500.00, 'paid', CURRENT_DATE - 2, 'Pix', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'comprovante-dizimos.png', NULL),
    ('income', 'Oferta especial - Culto de Celebração', 'Ofertas', 'Congregação', 4230.50, 'paid', CURRENT_DATE - 5, 'Dinheiro', NULL, NULL, NULL),
    ('income', 'Doação para reforma do templo', 'Doações', 'Família Andrade', 3000.00, 'paid', CURRENT_DATE - 9, 'Transferência', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'comprovante-doacao.png', NULL),
    ('income', 'Inscrições do acampamento de jovens', 'Eventos', 'Ministério de Jovens', 2150.00, 'pending', CURRENT_DATE + 4, 'Pix', NULL, NULL, 'Aguardando repasse das últimas inscrições.'),
    ('expense', 'Aluguel do salão principal', 'Aluguel', 'Imobiliária Central', 3800.00, 'paid', CURRENT_DATE - 3, 'Boleto', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'boleto-aluguel.png', NULL),
    ('expense', 'Conta de energia elétrica', 'Contas e Utilidades', 'Companhia Elétrica', 612.40, 'paid', CURRENT_DATE - 6, 'Boleto', NULL, NULL, NULL),
    ('expense', 'Manutenção do sistema de som', 'Manutenção', 'Áudio & Som Ltda', 950.00, 'pending', CURRENT_DATE + 2, 'Transferência', NULL, NULL, 'Aguardando nota fiscal do fornecedor.'),
    ('expense', 'Apoio ao missionário no campo', 'Missões', 'Missão Fronteiras', 1200.00, 'paid', CURRENT_DATE - 12, 'Transferência', NULL, NULL, NULL),
    ('expense', 'Material gráfico para o culto infantil', 'Materiais', 'Gráfica Nova Vida', 340.00, 'pending', CURRENT_DATE + 1, 'Dinheiro', NULL, NULL, NULL)
) AS data(type, description, category, counterparty, amount, status, transaction_date, payment_method, attachment_url, attachment_name, notes)
WHERE NOT EXISTS (
  SELECT 1 FROM financial_transactions f
  WHERE f.description = data.description AND f.transaction_date = data.transaction_date
);
