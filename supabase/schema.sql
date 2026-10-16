-- =============================================================================
-- Pokibind : base de données Supabase (à coller dans « SQL Editor » puis « Run »)
-- =============================================================================
-- Principes de sécurité :
--   1. Row Level Security (RLS) sur toutes les tables : par défaut, tout est interdit.
--   2. Chacun ne lit et ne modifie que ses propres lignes (user_id = auth.uid()).
--   3. Les données ne sont accessibles qu'avec une vraie session (email confirmé ou Google),
--      jamais avec un compte anonyme.
--   4. Pièces, badges et achats : jamais modifiables directement par le site,
--      seulement par les fonctions de ce fichier (« security definer »).
--   5. Profils partagés (« Amis », « Public ») : seulement des colonnes choisies,
--      jamais l'email, le scellé, les prix d'achat ni les chase cards.
--   6. Contraintes sur toutes les colonnes (longueurs, valeurs, tailles des JSON).
-- Le fichier peut être relancé : il ne supprime aucune donnée.
-- =============================================================================

-- ---------- Fonctions d'aide ----------

-- Vrai si la session courante est celle d'un vrai compte (connecté, pas anonyme)
create or replace function public.est_verifie()
returns boolean
language sql stable
set search_path = ''
as $$
  select auth.uid() is not null and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false;
$$;

-- Identifiant de l'utilisateur, seulement si sa session est valide (sinon null : aucune ligne)
create or replace function public.moi()
returns uuid
language sql stable
set search_path = ''
as $$
  select case when public.est_verifie() then auth.uid() end;
$$;

-- Taille d'un JSON en octets (pour limiter ce que le site peut enregistrer)
create or replace function public.taille_json(valeur jsonb)
returns integer
language sql immutable
set search_path = ''
as $$
  select octet_length(valeur::text);
$$;

-- Exemplaires d'une carte : { "normale": 2, "reverse": 1 } (variantes connues, de 1 à 999)
create or replace function public.variantes_valides(variantes jsonb)
returns boolean
language sql immutable
set search_path = ''
as $$
  select jsonb_typeof(variantes) = 'object'
    and not exists (
      select 1 from jsonb_each(variantes) e
      where e.key not in ('normale', 'reverse', 'holo', 'pokeball', 'masterball')
        or jsonb_typeof(e.value) <> 'number'
        or (e.value::text) !~ '^[0-9]{1,3}$'
        or (e.value::text)::integer not between 1 and 999
    );
$$;

-- ---------- Profils ----------

create table if not exists public.profils (
  id uuid primary key references auth.users (id) on delete cascade,
  pseudo text not null check (pseudo ~ '^[a-zA-Z0-9._-]{2,20}$'),
  nom text not null check (char_length(nom) between 1 and 40),
  bio text not null default '' check (char_length(bio) <= 160),
  banniere text not null default 'lagune' check (banniere ~ '^[a-z0-9-]{1,40}$'),
  cadre text not null default 'classique' check (cadre ~ '^[a-z0-9-]{1,40}$'),
  badge text not null default '' check (badge ~ '^[a-z0-9-]{0,40}$'),
  favorites jsonb not null default '[]' check (jsonb_typeof(favorites) = 'array' and jsonb_array_length(favorites) <= 3 and public.taille_json(favorites) <= 4000),
  visibilite text not null default 'prive' check (visibilite in ('prive', 'amis', 'public')),
  cree_le timestamptz not null default now()
);
create unique index if not exists profils_pseudo_unique on public.profils (lower(pseudo));

-- ---------- Collection ----------

create table if not exists public.collection (
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  carte_id text not null check (carte_id ~ '^[A-Za-z0-9._%-]{1,60}$'),
  carte jsonb not null check (jsonb_typeof(carte) = 'object' and public.taille_json(carte) <= 4000),
  variantes jsonb not null check (public.variantes_valides(variantes)),
  ajoutee_le timestamptz not null default now(),
  primary key (user_id, carte_id)
);

-- ---------- Binders ----------

create table if not exists public.binders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  nom text not null check (char_length(nom) between 1 and 40),
  couverture text not null check (couverture ~ '^[a-z0-9-]{1,40}$'),
  cartes jsonb not null default '[]' check (jsonb_typeof(cartes) = 'array' and jsonb_array_length(cartes) <= 900 and public.taille_json(cartes) <= 400000),
  cree_le timestamptz not null default now()
);
create index if not exists binders_user on public.binders (user_id);

-- ---------- Chase cards ----------

create table if not exists public.chase_cards (
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  carte_id text not null check (carte_id ~ '^[A-Za-z0-9._%-]{1,60}$'),
  carte jsonb not null check (jsonb_typeof(carte) = 'object' and public.taille_json(carte) <= 4000),
  variante text not null check (variante in ('normale', 'reverse', 'holo', 'pokeball', 'masterball')),
  prix_max numeric(10, 2) not null check (prix_max > 0 and prix_max < 1000000),
  priorite text not null default 'moyenne' check (priorite in ('haute', 'moyenne', 'basse')),
  prix numeric(10, 2) check (prix is null or prix >= 0),
  prix_le timestamptz,
  alerte_envoyee_le timestamptz,  -- dernière alerte email (une seule par passage sous le prix max)
  ajoutee_le timestamptz not null default now(),
  primary key (user_id, carte_id)
);

-- Réglages privés : budget des chase cards, alertes par email
create table if not exists public.reglages (
  user_id uuid primary key references auth.users (id) on delete cascade default auth.uid(),
  budget numeric(12, 2) check (budget is null or (budget >= 0 and budget < 100000000)),
  alertes_email boolean not null default false
);

-- ---------- Scellé ----------

create table if not exists public.scelle (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  nom text not null check (char_length(nom) between 1 and 120),
  type text not null check (type in ('Booster', 'Display', 'Tripack', 'Coffret Dresseur d''Élite', 'Coffret', 'Pokébox', 'Autre')),
  serie text not null default '' check (serie ~ '^[a-z0-9._-]{0,30}$'),
  set_id text not null default '' check (set_id ~ '^[A-Za-z0-9._-]{0,40}$'),
  set_nom text not null default '' check (char_length(set_nom) <= 80),
  quantite integer not null check (quantite between 1 and 999),
  achat numeric(10, 2) check (achat is null or (achat >= 0 and achat < 1000000)),
  revente numeric(10, 2) check (revente is null or (revente >= 0 and revente < 1000000)),
  ajoute_le timestamptz not null default now()
);
create index if not exists scelle_user on public.scelle (user_id);

-- ---------- Historique de la valeur (un relevé par jour) ----------

create table if not exists public.historique (
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  jour date not null,
  cartes numeric(14, 2) not null check (cartes >= 0),
  scelle numeric(14, 2) not null check (scelle >= 0),
  primary key (user_id, jour)
);

-- ---------- Pièces, badges, achats (écriture réservée aux fonctions) ----------

create table if not exists public.recompenses (
  user_id uuid primary key references auth.users (id) on delete cascade,
  pieces integer not null default 0 check (pieces >= 0),
  dernier_jour date,
  serie integer not null default 0 check (serie >= 0),
  meilleure_serie integer not null default 0 check (meilleure_serie >= 0),
  obtenus jsonb not null default '{}' check (jsonb_typeof(obtenus) = 'object')
);

create table if not exists public.journal_recompenses (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  date timestamptz not null default now(),
  cle text not null,
  texte text not null,
  pieces integer not null
);
create index if not exists journal_user on public.journal_recompenses (user_id, date desc);

-- Prix de la boutique : fixés ici, jamais envoyés par le site
create table if not exists public.objets_boutique (
  id text primary key,
  categorie text not null check (categorie in ('couvertures', 'objets')),
  nom text not null,
  prix integer not null check (prix > 0)
);

create table if not exists public.deblocages (
  user_id uuid not null references auth.users (id) on delete cascade,
  objet_id text not null references public.objets_boutique (id),
  achete_le timestamptz not null default now(),
  primary key (user_id, objet_id)
);

-- ---------- Amis ----------

create table if not exists public.amities (
  demandeur uuid not null references auth.users (id) on delete cascade default auth.uid(),
  destinataire uuid not null references auth.users (id) on delete cascade,
  statut text not null default 'attente' check (statut in ('attente', 'acceptee')),
  cree_le timestamptz not null default now(),
  primary key (demandeur, destinataire),
  check (demandeur <> destinataire)
);

-- Vrai si les deux utilisateurs sont amis (demande acceptée, dans un sens ou dans l'autre)
create or replace function public.sont_amis(a uuid, b uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.amities
    where statut = 'acceptee'
      and ((demandeur = a and destinataire = b) or (demandeur = b and destinataire = a))
  );
$$;

-- Vrai si la personne connectée (ou un visiteur, pour un profil public) peut voir le profil de « proprietaire »
create or replace function public.peut_voir(proprietaire uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profils p
    where p.id = proprietaire
      and (
        p.id = public.moi()
        or p.visibilite = 'public'
        or (p.visibilite = 'amis' and public.moi() is not null and public.sont_amis(p.id, public.moi()))
      )
  );
$$;

-- =============================================================================
-- Droits : on retire tout, puis on rend seulement le nécessaire
-- =============================================================================

alter table public.profils enable row level security;
alter table public.collection enable row level security;
alter table public.binders enable row level security;
alter table public.chase_cards enable row level security;
alter table public.reglages enable row level security;
alter table public.scelle enable row level security;
alter table public.historique enable row level security;
alter table public.recompenses enable row level security;
alter table public.journal_recompenses enable row level security;
alter table public.objets_boutique enable row level security;
alter table public.deblocages enable row level security;
alter table public.amities enable row level security;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on functions from public, anon, authenticated;

-- Données personnelles : lecture et écriture de ses propres lignes
grant select, insert, update, delete on public.collection, public.binders, public.chase_cards,
  public.reglages, public.scelle, public.historique to authenticated;
grant select, insert, delete on public.amities to authenticated;
grant update (statut) on public.amities to authenticated;
-- Profil : la colonne id est fixée à l'insertion ; le reste est modifiable
grant select on public.profils to anon, authenticated;
grant insert (id, pseudo, nom, bio, banniere, cadre, badge, favorites, visibilite) on public.profils to authenticated;
grant update (pseudo, nom, bio, banniere, cadre, badge, favorites, visibilite) on public.profils to authenticated;
-- Lecture seule : pièces, journal, achats, catalogue de la boutique
grant select on public.recompenses, public.journal_recompenses, public.deblocages to authenticated;
grant select on public.objets_boutique to anon, authenticated;
-- Partage : binders d'un profil visible
grant select on public.binders to anon;

grant execute on function public.est_verifie(), public.moi(), public.taille_json(jsonb), public.variantes_valides(jsonb) to anon, authenticated;
grant execute on function public.peut_voir(uuid), public.sont_amis(uuid, uuid) to anon, authenticated;

-- ---------- Règles d'accès (RLS) ----------

-- (re)création des règles
do $$
declare regle record;
begin
  for regle in select policyname, tablename from pg_policies where schemaname = 'public' loop
    execute format('drop policy if exists %I on public.%I', regle.policyname, regle.tablename);
  end loop;
end $$;

-- Profils : chacun gère le sien ; les autres le voient selon sa visibilité
-- (id = moi() d'abord : à la création, peut_voir ne voit pas encore la nouvelle ligne)
create policy profils_lecture on public.profils for select to anon, authenticated
  using (id = public.moi() or public.peut_voir(id));
create policy profils_creation on public.profils for insert to authenticated
  with check (id = public.moi());
create policy profils_modification on public.profils for update to authenticated
  using (id = public.moi()) with check (id = public.moi());

-- Tables privées : uniquement son propre contenu, session vérifiée
create policy collection_proprietaire on public.collection for all to authenticated
  using (user_id = public.moi()) with check (user_id = public.moi());
create policy chase_proprietaire on public.chase_cards for all to authenticated
  using (user_id = public.moi()) with check (user_id = public.moi());
create policy reglages_proprietaire on public.reglages for all to authenticated
  using (user_id = public.moi()) with check (user_id = public.moi());
create policy scelle_proprietaire on public.scelle for all to authenticated
  using (user_id = public.moi()) with check (user_id = public.moi());
create policy historique_proprietaire on public.historique for all to authenticated
  using (user_id = public.moi()) with check (user_id = public.moi());

-- Binders : son propre contenu ; lecture seule pour un profil visible (amis ou public)
create policy binders_proprietaire on public.binders for all to authenticated
  using (user_id = public.moi()) with check (user_id = public.moi());
create policy binders_partages on public.binders for select to anon, authenticated
  using (public.peut_voir(user_id));

-- Pièces, journal et achats : lecture de ses propres lignes
create policy recompenses_lecture on public.recompenses for select to authenticated using (user_id = public.moi());
create policy journal_lecture on public.journal_recompenses for select to authenticated using (user_id = public.moi());
create policy deblocages_lecture on public.deblocages for select to authenticated using (user_id = public.moi());
create policy objets_lecture on public.objets_boutique for select to anon, authenticated using (true);

-- Amis : on voit les demandes qui nous concernent ; on envoie en son nom ;
-- seul le destinataire accepte ; chacun peut retirer une amitié ou une demande
create policy amities_lecture on public.amities for select to authenticated
  using (public.moi() in (demandeur, destinataire));
create policy amities_demande on public.amities for insert to authenticated
  with check (demandeur = public.moi() and statut = 'attente');
create policy amities_acceptation on public.amities for update to authenticated
  using (destinataire = public.moi()) with check (destinataire = public.moi() and statut = 'acceptee');
create policy amities_suppression on public.amities for delete to authenticated
  using (public.moi() in (demandeur, destinataire));

-- =============================================================================
-- Fonctions appelées par le site (rpc)
-- =============================================================================

-- Montants (provisoires) : à garder identiques à js/recompenses.js
create or replace function public.verifier_recompenses()
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  utilisateur uuid := public.moi();
  ligne public.recompenses;
  aujourdhui date := (now() at time zone 'Europe/Paris')::date;
  nouveautes jsonb := '[]';
  nb_cartes integer;
  nb_sets integer;
  nb_binders integer;
  nb_chase integer;
  set_complet record;
  badge record;
  valeur integer;
begin
  if utilisateur is null then
    raise exception 'session non vérifiée' using errcode = '42501';
  end if;

  insert into public.recompenses (user_id) values (utilisateur) on conflict (user_id) do nothing;
  select * into ligne from public.recompenses where user_id = utilisateur for update;

  -- Cadeau de bienvenue (une seule fois)
  if not (ligne.obtenus ? 'bienvenue') then
    ligne.pieces := ligne.pieces + 300;
    ligne.obtenus := ligne.obtenus || jsonb_build_object('bienvenue', aujourdhui);
    insert into public.journal_recompenses (user_id, cle, texte, pieces) values (utilisateur, 'bienvenue', 'Bienvenue sur Pokibind', 300);
    nouveautes := nouveautes || to_jsonb('Bienvenue sur Pokibind : +300 pièces'::text);
  end if;

  -- Connexion du jour et série de jours d'affilée
  if ligne.dernier_jour is distinct from aujourdhui then
    ligne.serie := case when ligne.dernier_jour = aujourdhui - 1 then ligne.serie + 1 else 1 end;
    ligne.meilleure_serie := greatest(ligne.meilleure_serie, ligne.serie);
    ligne.dernier_jour := aujourdhui;
    ligne.pieces := ligne.pieces + 10;
    nouveautes := nouveautes || to_jsonb('Connexion du jour : +10 pièces'::text);
  end if;

  -- Sets complétés : cartes numérotées (numéro ≤ total officiel) possédées
  for set_complet in
    select carte -> 'set' ->> 'id' as id, max(carte -> 'set' ->> 'nom') as nom
    from public.collection
    where user_id = utilisateur
      and (carte ->> 'numero') ~ '^[0-9]+$'
      and coalesce((carte -> 'set' ->> 'officiel')::integer, 0) > 0
      and (carte ->> 'numero')::integer <= (carte -> 'set' ->> 'officiel')::integer
    group by carte -> 'set' ->> 'id'
    having count(*) >= max((carte -> 'set' ->> 'officiel')::integer)
  loop
    if not (ligne.obtenus ? ('set:' || set_complet.id)) then
      ligne.pieces := ligne.pieces + 200;
      ligne.obtenus := ligne.obtenus || jsonb_build_object('set:' || set_complet.id, aujourdhui);
      insert into public.journal_recompenses (user_id, cle, texte, pieces)
        values (utilisateur, 'set:' || set_complet.id, 'Set ' || coalesce(set_complet.nom, set_complet.id) || ' complété', 200);
      nouveautes := nouveautes || to_jsonb(('Set ' || coalesce(set_complet.nom, set_complet.id) || ' complété : +200 pièces')::text);
    end if;
  end loop;

  -- Badges
  select coalesce(sum(v.n), 0) into nb_cartes
    from public.collection c, lateral (select sum(value::integer) as n from jsonb_each_text(c.variantes)) v
    where c.user_id = utilisateur;
  select count(*) into nb_binders from public.binders where user_id = utilisateur;
  select count(*) into nb_chase from public.chase_cards where user_id = utilisateur;
  select count(*) into nb_sets from jsonb_object_keys(ligne.obtenus) k where k like 'set:%';

  for badge in
    select * from (values
      ('cartes-10', '10 cartes', 'cartes', 10, 50), ('cartes-50', '50 cartes', 'cartes', 50, 50),
      ('cartes-100', '100 cartes', 'cartes', 100, 50), ('cartes-500', '500 cartes', 'cartes', 500, 50),
      ('cartes-1000', '1 000 cartes', 'cartes', 1000, 100),
      ('connexion-7', '7 jours d''affilée', 'serie', 7, 50), ('connexion-30', '30 jours d''affilée', 'serie', 30, 150),
      ('connexion-100', '100 jours d''affilée', 'serie', 100, 300), ('connexion-365', '365 jours d''affilée', 'serie', 365, 1000),
      ('premier-binder', 'Premier binder', 'binders', 1, 20), ('premiere-chase-card', 'Première chase card', 'chase', 1, 20),
      ('set-complete', 'Premier set complété', 'sets', 1, 0), ('sets-5', '5 sets complétés', 'sets', 5, 300)
    ) as b (cle, nom, mesure, objectif, gain)
  loop
    valeur := case badge.mesure when 'cartes' then nb_cartes when 'serie' then ligne.meilleure_serie
      when 'binders' then nb_binders when 'chase' then nb_chase else nb_sets end;
    if valeur >= badge.objectif and not (ligne.obtenus ? badge.cle) then
      ligne.pieces := ligne.pieces + badge.gain;
      ligne.obtenus := ligne.obtenus || jsonb_build_object(badge.cle, aujourdhui);
      insert into public.journal_recompenses (user_id, cle, texte, pieces)
        values (utilisateur, badge.cle, 'Badge « ' || badge.nom || ' » débloqué', badge.gain);
      nouveautes := nouveautes || to_jsonb(case when badge.gain > 0
        then 'Badge « ' || badge.nom || ' » débloqué : +' || badge.gain || ' pièces'
        else 'Badge « ' || badge.nom || ' » débloqué' end);
    end if;
  end loop;

  update public.recompenses set pieces = ligne.pieces, dernier_jour = ligne.dernier_jour, serie = ligne.serie,
    meilleure_serie = ligne.meilleure_serie, obtenus = ligne.obtenus
    where user_id = utilisateur;

  return jsonb_build_object('pieces', ligne.pieces, 'nouveautes', nouveautes);
end;
$$;

-- Achat dans la boutique : le prix vient de la table objets_boutique, jamais du site
create or replace function public.acheter_objet(objet text)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  utilisateur uuid := public.moi();
  article public.objets_boutique;
  solde integer;
begin
  if utilisateur is null then
    raise exception 'session non vérifiée' using errcode = '42501';
  end if;
  select * into article from public.objets_boutique where id = objet;
  if not found then
    return jsonb_build_object('ok', false, 'raison', 'inconnu');
  end if;
  insert into public.recompenses (user_id) values (utilisateur) on conflict (user_id) do nothing;
  select pieces into solde from public.recompenses where user_id = utilisateur for update;
  if exists (select 1 from public.deblocages where user_id = utilisateur and objet_id = objet) then
    return jsonb_build_object('ok', false, 'raison', 'deja', 'pieces', solde);
  end if;
  if solde < article.prix then
    return jsonb_build_object('ok', false, 'raison', 'pieces', 'pieces', solde);
  end if;
  update public.recompenses set pieces = pieces - article.prix where user_id = utilisateur returning pieces into solde;
  insert into public.deblocages (user_id, objet_id) values (utilisateur, objet);
  insert into public.journal_recompenses (user_id, cle, texte, pieces) values (utilisateur, 'achat:' || objet, article.nom, -article.prix);
  return jsonb_build_object('ok', true, 'pieces', solde);
end;
$$;

-- Supprimer son compte : efface l'utilisateur, et donc toutes ses données (on delete cascade)
create or replace function public.supprimer_mon_compte()
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  utilisateur uuid := public.moi();
begin
  if utilisateur is null then
    raise exception 'session non vérifiée' using errcode = '42501';
  end if;
  delete from auth.users where id = utilisateur;
end;
$$;

-- Trouver un profil par son pseudo (pour une demande d'ami) : seulement l'identifiant et le pseudo
create or replace function public.chercher_pseudo(recherche text)
returns table (id uuid, pseudo text, nom text)
language sql stable security definer
set search_path = ''
as $$
  select p.id, p.pseudo, p.nom from public.profils p
  where public.moi() is not null and lower(p.pseudo) = lower(recherche) and p.id <> public.moi()
  limit 1;
$$;

grant execute on function public.verifier_recompenses(), public.acheter_objet(text),
  public.supprimer_mon_compte(), public.chercher_pseudo(text) to authenticated;

-- =============================================================================
-- Catalogue de la boutique (prix provisoires, identiques à js/objets-profil.js et js/couvertures.js)
-- =============================================================================

insert into public.objets_boutique (id, categorie, nom, prix) values
  ('lagon', 'couvertures', 'Couverture Lagon', 500), ('sieste', 'couvertures', 'Couverture Sieste', 500),
  ('fleurs', 'couvertures', 'Couverture Fleurs', 500), ('vitrail', 'couvertures', 'Couverture Vitrail', 500),
  ('ciel', 'couvertures', 'Couverture Ciel', 500), ('forge', 'couvertures', 'Couverture Forge', 500),
  ('ectoplasma-cerisier', 'objets', 'Ectoplasma sous les cerisiers', 700), ('mew-neons', 'objets', 'Mew dans la ville', 700),
  ('fete-halloween', 'objets', 'Fête d''Halloween', 700), ('jirachi-nuit-etoilee', 'objets', 'Jirachi, nuit étoilée', 700),
  ('pikachu-plage', 'objets', 'Pikachu à la plage', 700), ('ho-oh-lugia', 'objets', 'Ho-Oh et Lugia', 700),
  ('primo-groudon', 'objets', 'Primo-Groudon', 700), ('mega-rayquaza', 'objets', 'Méga-Rayquaza', 700),
  ('aurore', 'objets', 'Aurore', 400), ('crepuscule', 'objets', 'Crépuscule', 400), ('abysses', 'objets', 'Abysses', 400),
  ('foret', 'objets', 'Forêt ancienne', 400), ('galaxie', 'objets', 'Galaxie', 600), ('arc-en-ciel', 'objets', 'Arc-en-ciel', 800),
  ('pikachu', 'objets', 'Cadre Pikachu', 700), ('etincelle', 'objets', 'Cadre étincelle', 700), ('pinceau', 'objets', 'Cadre coup de pinceau', 700),
  ('dore', 'objets', 'Cadre doré', 500), ('argent', 'objets', 'Cadre argent', 400), ('flamme', 'objets', 'Cadre flamme', 500),
  ('ocean', 'objets', 'Cadre océan', 500), ('foret-cadre', 'objets', 'Cadre forêt', 500), ('prisme', 'objets', 'Cadre prisme', 800)
on conflict (id) do update set categorie = excluded.categorie, nom = excluded.nom, prix = excluded.prix;
