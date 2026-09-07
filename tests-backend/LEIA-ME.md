# Suítes de comportamento do backend

**Estavam fora do repositório até 07/09/2026 e por isso morreriam com a sessão
que as escreveu.** Entram como estão, sem portar, por uma razão de ordem:
código commitado e imperfeito é recuperável; código perfeito e não commitado
não existe.

## Como rodar

    bash tests-backend/subir.sh      # banco virgem + servidor, e PROVA que os dois são o mesmo banco
    node tests-backend/e2e.mjs       # uma suíte
    # 853 casos em 27 suítes contra banco novo

**Apague o `.next` antes de uma rodada que valha como prova.** Em 07/09/2026 um
`.next` velho fez a `smoke` falhar 12 casos com um diff que não tinha nada a ver
— e falhar do mesmo jeito com o diff guardado, o que mascarou a causa como "não
é meu código" em vez de "não é código nenhum". Com `rm -rf .next` a mesma suíte
passa 30 de 30.

Seis arquivos NÃO seguem a chamada acima, e não é falha deles:

| Arquivo | Como se roda | O que é |
| --- | --- | --- |
| `fks.mjs`, `verify.mjs` | `node ... <connection string>` | inspeção: imprimem o estado do schema, não contam casos |
| `backstop.mjs`, `reapply.mjs` | `node ... <connection string>` | `reapply` só reaplica a 004 e a 005, e **falha desde a 008**, que renomeou `max_people` |
| `demo.mjs` | servidor na porta **3212** | não é a porta do `subir.sh` |
| `transicoes.mjs` | importa um shim de um scratchpad de sessão | o caminho morreu com a sessão que o criou |

## O que ainda NÃO está portátil, para quem for pegar

- caminhos absolutos: `/home/lucas/www/nonia-auth/node_modules/pg`
- porta 3210 e Postgres efêmero em 54329, banco `nonia`, fixos na string
- `subir.sh` aponta para um scratchpad de sessão
- não são idempotentes entre si: **um banco novo por rodada completa**

Portar é trocar isso por variáveis de ambiente. Não foi feito por falta de
tempo, não por decisão.

## O que elas cobrem, do que dói mais para o que dói menos

| Suíte | O que morre se quebrar |
| --- | --- |
| `smoke`, `rede`, `caixa`, `whatsapp`, `espelho` | **isolamento entre igrejas** — a garantia mais forte do produto |
| `espelho` | encaminhar, citar, mídia nos dois sentidos, e o `@lid` sem o qual ninguém tem nome na caixa |
| `destinatarios` | quem exatamente recebe um disparo — e as duas coisas que só aparecem com nomes na tela: casal que divide telefone recebendo duas vezes, e o alvo sendo recalculado entre ver e enviar |
| `e2e`, `senha`, `perfil` | sessão, papéis e permissões |
| `whatsapp` | o laço do envio em massa: falha parcial, não reenviar, teto |
| `limites`, `avaliacao`, `somenteleitura`, `transicoes`, `impasse` | plano, carência e somente leitura |
| `contagens`, `recentes`, `email` | as marcas que nunca expiravam, e o e-mail opcional |
| `lixeira`, `resumo`, `paginacao`, `peso`, `exportar`, `comprovantes`, `zipcsv` | financeiro, listagens e exportação |

`openwa-falso.mjs` não é suíte: é um OpenWA de mentira que **modela o
`allowedSessions`**. Sem ele o teste da segunda camada de isolamento seria o
autor concordando consigo mesmo.

Ele tem uma regra que vale mais que as outras: **o stub tem que ser capaz de
contradizer quem o escreveu.** Duas vezes ele quase não foi —

- inventou `key` e `qr` onde o OpenWA tem `apiKey` e `qrCode`, e a suíte passou
  concordando com o erro até o primeiro pareamento de verdade;
- devolvia `media` no histórico **sem ninguém ter pedido `includeMedia`**. Um
  `hasMedia` deduzido da presença dos bytes teria passado aqui e nascido falso
  no ar — e falso justamente para toda foto acima de 1 MB, que é quase toda foto
  de celular. Hoje ele tira o campo, e por isso `hasMedia` sai do **tipo**.
