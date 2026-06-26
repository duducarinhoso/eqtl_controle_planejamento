-- 19_status_categoria.sql
-- I-0015 — "Status Geral" (categoria) por item da lista de status.
-- Desacopla COR (só identidade visual) de SEMÂNTICA: o dashboard passa a somar os
-- KPIs (Concluído / Pendências) pela categoria, não mais pela cor (klass).
-- Aditivo e não-destrutivo. Rodar no SQL Editor do Supabase.

alter table public.status_options
  add column if not exists categoria text not null default 'na'
  check (categoria in ('concluido', 'pendencia', 'na'));

-- Backfill: itens existentes herdam a categoria pela cor de hoje, só onde ainda
-- está no default. verde=Concluído; âmbar/teal/coral=Pendência; cinza=N/A.
update public.status_options set categoria = 'concluido'
  where klass = 'recebido' and categoria = 'na';
update public.status_options set categoria = 'pendencia'
  where klass in ('pendente', 'analise', 'parcial') and categoria = 'na';
-- klass = 'na' permanece 'na' (default).
