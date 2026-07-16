-- 22_planning_items.sql
-- Uma linha = uma solicitacao da "Lista de pedidos" (modelo de projeto 'tabela').
-- As 4 colunas de status (Status de entrega / Status Geral / Status Prazo / Dias de
-- atraso) NAO sao persistidas: a aplicacao as calcula no cliente (dependem de "hoje").
-- Aditivo e nao-destrutivo. Rodar no SQL Editor do Supabase.

create table if not exists public.planning_items (
  id                bigint generated always as identity primary key,
  project_id        uuid not null references public.projects(id) on delete cascade,
  item_num          text not null default '',
  referencia        text not null default '',
  grupo             text not null default '',
  descricao         text,
  empresa           text not null default '',
  segmento          text,
  data_base         date,
  status            text,
  data_solicitacao  timestamptz,
  prazo_recebimento date,
  area_responsavel  text,
  responsavel       text,
  entrega_efetiva   date,
  created_by        uuid,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Chave unica composta: bloqueia/atualiza no reimport (# + Referencia + Grupo + Empresa).
create unique index if not exists planning_items_key
  on public.planning_items (project_id, item_num, referencia, grupo, empresa);

create index if not exists planning_items_project on public.planning_items (project_id);

alter table public.planning_items enable row level security;

-- Mesmo padrao das demais tabelas do app (a allowlist ja gate o cadastro).
-- Se as outras tabelas usarem politica mais restrita, replicar a mesma aqui.
drop policy if exists planning_items_all on public.planning_items;
create policy planning_items_all on public.planning_items
  for all to authenticated using (true) with check (true);
