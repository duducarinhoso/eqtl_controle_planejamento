-- 23_planning_observacoes.sql
-- Coluna "Observacoes" da Lista de pedidos (modelo de projeto 'tabela'):
-- texto livre por item, preenchido na carga (coluna do modelo de importacao)
-- ou editado inline na Base Gerencial (duplo-clique na celula).
-- Aditivo e nao-destrutivo. Linhas existentes ficam com NULL.
-- Rodar no SQL Editor do Supabase.

alter table public.planning_items
  add column if not exists observacoes text;
