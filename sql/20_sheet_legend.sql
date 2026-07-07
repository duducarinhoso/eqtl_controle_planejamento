-- 20_sheet_legend.sql
-- Legenda (subtítulo) por aba, detectada de dentro da própria planilha.
-- O NOME da aba (ex.: "1.2") vem da origem e não muda; a LEGENDA (ex.: "Derivativos")
-- é detectada pela âncora "Grupo Equatorial" (1º texto abaixo que não é data) e pode
-- ser editada manualmente. Alimenta o subtítulo do painel lateral e o cabeçalho da
-- matriz Empresa×Aba do dashboard.
-- Aditivo e não-destrutivo. Rodar no SQL Editor do Supabase.
--
-- NULL  = nunca detectada (o app tenta detectar e preenche 1x, sem sobrescrever edição manual).
-- ''    = detectada mas não encontrada (fica para o usuário renomear); o app não re-detecta.
-- texto = legenda detectada ou editada manualmente.

alter table public.sheets
  add column if not exists legend text;
