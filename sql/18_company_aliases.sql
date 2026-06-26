-- 18_company_aliases.sql
-- De-Para de empresas: cada empresa pode ter "outras grafias" (aliases) que o
-- parser resolve para o nome canônico. Aditivo e não-destrutivo.
-- Rodar no SQL Editor do Supabase.

alter table public.companies
  add column if not exists aliases text[] not null default '{}';
