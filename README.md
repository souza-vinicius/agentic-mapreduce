# Agentic MapReduce for Cursor

Replica do padrão [Agentic MapReduce](https://devin.ai/blog/agentic-map-reduce) da Cognition, feito para rodar **dentro do Cursor**: Shard determinístico na CLI, Plan/Map/Reduce/Verify como subagents.

```text
Plan (amr-planner)
  → Shard (amr CLI, sem modelo)
  → Map (N × amr-map-worker em paralelo)
  → Reduce (amr-reducer)
  → Verify (amr-verifier, opcional)
```

## O que este repo contém

| Peça | Caminho |
|------|---------|
| CLI Shard + gerador de prompts | `src/cli.ts` → `amr` |
| Profiles (security / breaking-change / migration) | `profiles/` |
| Subagents Cursor | `.cursor/agents/amr-*.md` |
| Skill de orquestração | `.cursor/skills/agentic-mapreduce/SKILL.md` |
| Fixture vulnerável | `fixtures/vulnerable-app/` |
| Notas de pesquisa | `agentic-mapreduce-docs.md` |

## Setup

```bash
npm install
npm run build
```

## Quickstart (Shard no fixture)

```bash
node dist/cli.js shard \
  --repo fixtures/vulnerable-app \
  --profile profiles/security.json \
  --out .amr/runs/demo \
  --batch-size 8
```

Saída esperada: `shard-manifest.json`, `batch-*.json`, `summary.json`.
Arquivos sem signal são dropados antes de qualquer Map.

Gerar prompt de um batch:

```bash
node dist/cli.js prompt map \
  --manifest .amr/runs/demo/shard-manifest.json \
  --batch batch-0000
```

## Orquestrar no Cursor

1. Abra este projeto no Cursor (ou copie `.cursor/agents` + `.cursor/skills` + `profiles` + a CLI para o monorepo alvo).
2. Peça ao Agent: *“Run Agentic MapReduce security scan on \<repo\> using the agentic-mapreduce skill”*.
3. O parent agent deve:
   - Plan (se o profile não serve) via `amr-planner`
   - Rodar `amr shard`
   - Disparar **um Task/subagent `amr-map-worker` por batch** em paralelo
   - Rodar `amr-reducer` uma vez
   - Opcional: `amr-verifier` nos P0/P1

Isso espelha Security Swarm: cobertura by construction no Shard, profundidade no Map, cadeias no Reduce, prova no Verify.

## Profiles

- `profiles/security.json` — sinks e boundaries comuns (recall alto)
- `profiles/breaking-change.json` — refine os símbolos no Plan
- `profiles/migration.json` — troque `legacy-package` / `LegacyClient` pelos nomes reais

## Incremental

```bash
node dist/cli.js shard --repo <path> --profile profiles/security.json --incremental <git-sha>
```

Só re-scaneia paths do `git diff` desde o commit.

## Limites (v0.1)

- Selectors só **lexical** (regex). AST/Tree-sitter e call-graph ficam para depois.
- Verify é agentic (sandbox local), não um harness automático por finding.
- Map/Reduce dependem do Agent do Cursor — a CLI não chama LLM.

## Por que isso e não um swarm solto

Cursor já tem paralelismo (subagents / multitask / Cloud Agents). O que faltava para whole-repo confiável era **Plan → Shard determinístico + schema de Reduce**. É isso que esta replica adiciona.
