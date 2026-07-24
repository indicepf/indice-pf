# ADR 0A — Audiência das rotas de preditores e Laboratório

Data: 24/07/2026. Fase: 0A da auditoria `docs/014`. Achados: `SEC-001` a `SEC-006`, `SEC-009`.

## Contexto

Quatro Route Handlers executavam consultas com `service_role` e respondiam `200` a chamadas anônimas:

| Rota | Consumidor conhecido |
|---|---|
| `/api/preditores` | `IndicePainel` (só com `admin=true`) e `LabPreditores` |
| `/api/indice-retropolado` | `LabPreditores` (área administrativa) |
| `/api/confiabilidade` | `LabPreditores` (área administrativa) |
| `/api/catalogo-preditores` | nenhum consumidor no cliente |

O gate `RequireAdmin` é apenas de UI e não protege a API.

## Decisão

As quatro rotas são **privadas de administrador**. Aprovada pelo responsável em 24/07/2026.

- O cliente envia `Authorization: Bearer <access_token>` da sessão Supabase (renovada pelo supabase-js).
- O servidor valida o token, consulta `profiles.is_admin` e responde `401` sem sessão, `403` sem papel, `429` acima do limite e `200` só para admin.
- Respostas usam `Cache-Control: private, no-store` (dependem do usuário; nada em cache compartilhado).
- `/api/catalogo-preditores` permanece no ar (pode haver consumidor externo não inventariado), mas privada como as demais.
- Token nunca entra em URL, log ou chave de cache.

## Alternativas rejeitadas

- Catálogo público via view/role de leitura: sem consumidor conhecido, criar superfície pública é custo sem demanda.
- Remover o catálogo: sem telemetria de consumidores externos, a remoção é irreversível às cegas.

## Consequências

- `LabPreditores` e `IndicePainel` passam a enviar o token (helper `fetchAdmin`).
- Usuário anônimo ou comum perde o acesso direto às rotas — comportamento desejado.
- O rate limit é por instância (memória); um limitador distribuído fica para fase posterior.
- Se surgir necessidade de dados públicos de preditores, cria-se endpoint público próprio com view/RPC de mínimo privilégio, sem `service_role` (não reabrir estas rotas).
