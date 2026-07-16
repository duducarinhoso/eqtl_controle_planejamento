-- 21_project_kind.sql
-- Tipo do projeto:
--   'grade'  = espelho de Excel (abas/celulas) — modelo atual, padrao.
--   'tabela' = tabela estruturada de colunas fixas (Lista de pedidos) — modelo novo.
-- Aditivo e nao-destrutivo. Projetos existentes ficam 'grade' pelo default.
-- Rodar no SQL Editor do Supabase.

alter table public.projects
  add column if not exists kind text not null default 'grade';

alter table public.projects
  drop constraint if exists projects_kind_chk;
alter table public.projects
  add constraint projects_kind_chk check (kind in ('grade', 'tabela'));
