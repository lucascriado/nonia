# Suítes de comportamento do backend

**Estavam fora do repositório até 07/09/2026 e por isso morreriam com a sessão
que as escreveu.** Entram como estão, sem portar, por uma razão de ordem:
código commitado e imperfeito é recuperável; código perfeito e não commitado
não existe.

## Como rodar

    bash tests-backend/subir.sh      # banco virgem + servidor, e PROVA que os dois são o mesmo banco
    node tests-backend/e2e.mjs       # uma suíte
    # 770 casos em 25 suítes contra banco novo

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
| `smoke`, `rede`, `caixa`, `whatsapp` | **isolamento entre igrejas** — a garantia mais forte do produto |
| `e2e`, `senha`, `perfil` | sessão, papéis e permissões |
| `whatsapp` | o laço do envio em massa: falha parcial, não reenviar, teto |
| `limites`, `avaliacao`, `somenteleitura`, `transicoes`, `impasse` | plano, carência e somente leitura |
| `contagens`, `recentes`, `email` | as marcas que nunca expiravam, e o e-mail opcional |
| `lixeira`, `resumo`, `paginacao`, `peso`, `exportar`, `comprovantes`, `zipcsv` | financeiro, listagens e exportação |

`openwa-falso.mjs` não é suíte: é um OpenWA de mentira que **modela o
`allowedSessions`**. Sem ele o teste da segunda camada de isolamento seria o
autor concordando consigo mesmo.
