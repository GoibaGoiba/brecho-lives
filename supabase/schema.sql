-- ✿ Brechó · Controle de Lives — banco de dados no Supabase
-- Como usar: Supabase → SQL Editor → New query → cole TUDO isto → Run.
-- Pode rodar de novo sem problema (não apaga dados).

-- ---------- Tabelas ----------
create table if not exists public.ajustes (
  id      int primary key default 1 check (id = 1),
  taxa    numeric,                                   -- % da plataforma (null = sem taxa)
  faixas  jsonb not null default '[30,50,80,120,200]'
);

create table if not exists public.vendedoras (
  id       text primary key,
  nome     text not null default '',
  modelo   text not null default '',
  pct      numeric,
  fixo     numeric,
  por_hora numeric,
  obs      text not null default '',
  ordem    int not null default 0
);

create table if not exists public.lives (
  id            text primary key,
  nome          text not null default '',
  data          date,
  vendedora_id  text,
  horas         numeric,
  ordem         int not null default 0
);

create table if not exists public.pecas (
  id         text primary key,
  live_id    text not null references public.lives(id) on delete cascade,
  ref        text,                                    -- liga a mesma peça entre lives
  nome       text not null default '',
  categoria  text not null default '',
  valor      numeric,
  status     text not null default '',               -- 'Vendida' | 'Devolvida' | ''
  ordem      int not null default 0
);
create index if not exists pecas_live_idx on public.pecas(live_id);

-- Preço pago de cada peça: tabela separada que SÓ O DONO lê (o visitante vê só a soma por live).
create table if not exists public.pecas_custo (
  peca_id  text primary key references public.pecas(id) on delete cascade,
  custo    numeric
);

create table if not exists public.gastos (
  id         text primary key,
  live_id    text not null references public.lives(id) on delete cascade,
  descricao  text not null default '',
  valor      numeric,
  ordem      int not null default 0
);
create index if not exists gastos_live_idx on public.gastos(live_id);

-- Quem pode editar (os donos). Veja o passo 2 no fim do arquivo.
create table if not exists public.donos (
  user_id uuid primary key references auth.users(id) on delete cascade
);

-- ---------- Função: o usuário logado é dono? ----------
create or replace function public.e_dono() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.donos where user_id = auth.uid());
$$;

-- ---------- Permissões da API (as regras RLS abaixo decidem quem pode o quê) ----------
grant usage on schema public to anon, authenticated;
grant select on public.ajustes, public.vendedoras, public.lives, public.pecas, public.gastos to anon, authenticated;
grant insert, update, delete on public.ajustes, public.vendedoras, public.lives, public.pecas, public.gastos to authenticated;
grant select on public.donos to authenticated;

-- ---------- Segurança (RLS) ----------
-- Qualquer pessoa com o link VÊ os dados; só donos logados EDITAM.
do $$
declare t text;
begin
  foreach t in array array['ajustes','vendedoras','lives','pecas','gastos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "todos leem" on public.%I', t);
    execute format('drop policy if exists "donos editam" on public.%I', t);
    execute format('create policy "todos leem" on public.%I for select to anon, authenticated using (true)', t);
    execute format('create policy "donos editam" on public.%I for all to authenticated using (public.e_dono()) with check (public.e_dono())', t);
  end loop;
end $$;

alter table public.donos enable row level security;
drop policy if exists "dono se ve" on public.donos;
create policy "dono se ve" on public.donos for select to authenticated using (user_id = auth.uid());

-- ---------- Preço pago: só o dono lê/edita; visitante recebe só a soma por live ----------
revoke all on public.pecas_custo from anon;
grant select, insert, update, delete on public.pecas_custo to authenticated;
alter table public.pecas_custo enable row level security;
drop policy if exists "so donos" on public.pecas_custo;
create policy "so donos" on public.pecas_custo for all to authenticated using (public.e_dono()) with check (public.e_dono());

create or replace function public.custos_por_live() returns table (live_id text, custo numeric)
language sql stable security definer set search_path = public as $$
  select p.live_id, coalesce(sum(c.custo), 0)
  from public.pecas p join public.pecas_custo c on c.peca_id = p.id
  where p.status = 'Vendida'
  group by p.live_id;
$$;
revoke all on function public.custos_por_live() from public;
grant execute on function public.custos_por_live() to anon, authenticated;

-- ---------- Atualização ao vivo entre aparelhos ----------
do $$
declare t text;
begin
  foreach t in array array['ajustes','vendedoras','lives','pecas','pecas_custo','gastos'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- =====================================================================
-- PASSO 2 (depois de criar seu usuário em Authentication → Users):
-- troque o e-mail abaixo pelo seu, selecione SÓ esta linha e rode.
--
-- insert into public.donos (user_id) select id from auth.users where email = 'SEU_EMAIL_AQUI' on conflict do nothing;
-- =====================================================================
