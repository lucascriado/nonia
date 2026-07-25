-- Módulo financeiro: entradas, saídas e comprovantes.

CREATE TABLE financial_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type varchar(10) NOT NULL,
  description varchar(160) NOT NULL,
  category varchar(60) NOT NULL,
  counterparty varchar(160),
  amount numeric(12,2) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'paid',
  transaction_date date NOT NULL DEFAULT CURRENT_DATE,
  payment_method varchar(40),
  attachment_url text,
  attachment_name varchar(160),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT financial_transactions_type_check CHECK (type IN ('income', 'expense')),
  CONSTRAINT financial_transactions_status_check CHECK (status IN ('paid', 'pending')),
  CONSTRAINT financial_transactions_amount_check CHECK (amount > 0),
  CONSTRAINT financial_transactions_category_check CHECK (
    (type = 'income' AND category IN ('Dízimos', 'Ofertas', 'Doações', 'Eventos', 'Outras Receitas'))
    OR (type = 'expense' AND category IN ('Aluguel', 'Contas e Utilidades', 'Manutenção', 'Missões', 'Salários', 'Materiais', 'Eventos', 'Outras Despesas'))
  ),
  CONSTRAINT financial_transactions_attachment_check CHECK (
    attachment_url IS NULL OR (
      length(attachment_url) <= 2800000
      AND attachment_url ~ '^data:(image/(png|jpeg)|application/pdf);base64,[A-Za-z0-9+/=]+$'
    )
  )
);

CREATE INDEX financial_transactions_type_idx ON financial_transactions (type);
CREATE INDEX financial_transactions_status_idx ON financial_transactions (status);
CREATE INDEX financial_transactions_date_idx ON financial_transactions (transaction_date DESC);
CREATE INDEX financial_transactions_category_idx ON financial_transactions (category);

CREATE TRIGGER financial_transactions_set_updated_at BEFORE UPDATE ON financial_transactions
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE activities DROP CONSTRAINT activities_category_check;
ALTER TABLE activities ADD CONSTRAINT activities_category_check
  CHECK (category IN ('members', 'visitors', 'calendar', 'system', 'financial'));
