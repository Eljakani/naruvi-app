-- Each entry kind gets its own fields (src/lib/entry-fields.ts); the generic title/role/organization/dates go away.
ALTER TABLE "entries" ADD COLUMN "fields" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
CREATE FUNCTION pg_temp.naruvi_month(raw text) RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  t text := lower(translate(coalesce(raw, ''), 'éèêëàâäôöûüùîïçÉÈÊÀÂÔÛÎÇ', 'eeeeaaaoouuuiiceeeaaouic'));
  y text := substring(t from '(?:19|20)\d{2}');
  num text := substring(t from '\m(0?[1-9]|1[0-2])\s*[/.-]\s*(?:19|20)\d{2}');
  m int;
BEGIN
  IF y IS NULL THEN RETURN NULL; END IF;
  IF num IS NOT NULL THEN RETURN y || '-' || lpad(num, 2, '0'); END IF;
  m := CASE
    WHEN t ~ '\mjan' THEN 1 WHEN t ~ '\m(fev|feb)' THEN 2 WHEN t ~ '\mmar' THEN 3 WHEN t ~ '\m(avr|apr)' THEN 4
    WHEN t ~ '\m(mai|may)' THEN 5 WHEN t ~ '\mjui?n' THEN 6 WHEN t ~ '\m(juil|jul)' THEN 7 WHEN t ~ '\m(aout|aug)' THEN 8
    WHEN t ~ '\msep' THEN 9 WHEN t ~ '\moct' THEN 10 WHEN t ~ '\mnov' THEN 11 WHEN t ~ '\mdec' THEN 12 END;
  RETURN CASE WHEN m IS NULL THEN y ELSE y || '-' || lpad(m::text, 2, '0') END;
END $$;--> statement-breakpoint
CREATE FUNCTION pg_temp.naruvi_range(raw text) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  parts text[] := regexp_split_to_array(trim(coalesce(raw, '')), '\s*[–—]\s*|\s+-\s+|(?<=\d{4})\s*-\s*(?=\D|\d{4})');
  s text; e text;
BEGIN
  IF trim(coalesce(raw, '')) = '' THEN RETURN NULL; END IF;
  s := pg_temp.naruvi_month(parts[1]);
  IF array_length(parts, 1) > 1 THEN
    e := CASE WHEN lower(parts[2]) ~ 'present|aujourd|now|current|en cours|actuel' THEN 'present' ELSE pg_temp.naruvi_month(parts[2]) END;
  ELSIF lower(raw) ~ 'present|aujourd|now|current|en cours|actuel' THEN e := 'present';
  END IF;
  IF s IS NULL THEN RETURN NULL; END IF;
  RETURN jsonb_strip_nulls(jsonb_build_object('start', s, 'end', e));
END $$;--> statement-breakpoint
-- The language an entry's text was written in: its own, else the one most of the profile uses, else the profile's default.
CREATE TEMP TABLE naruvi_lang AS
SELECT e.id, coalesce(
  (SELECT k FROM jsonb_object_keys(e.display) k LIMIT 1),
  (SELECT k FROM entries o, jsonb_object_keys(o.display) k WHERE o.profile_id = e.profile_id GROUP BY k ORDER BY count(*) DESC LIMIT 1),
  p.default_language) AS lang
FROM entries e JOIN profiles p ON p.id = e.profile_id;--> statement-breakpoint
-- Values written in one language, or the title when there is none.
CREATE FUNCTION pg_temp.naruvi_first(display jsonb, key text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT nullif(trim(v ->> key), '') FROM jsonb_each(display) AS d(k, v) WHERE nullif(trim(v ->> key), '') IS NOT NULL ORDER BY k = 'en' DESC LIMIT 1
$$;--> statement-breakpoint
CREATE FUNCTION pg_temp.naruvi_text(display jsonb, mapping jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(jsonb_object_agg(k, t), '{}'::jsonb) FROM (
    SELECT d.k, jsonb_strip_nulls((SELECT jsonb_object_agg(m.key, nullif(trim(d.v ->> (m.value #>> '{}')), '')) FROM jsonb_each(mapping) m)) AS t
    FROM jsonb_each(display) AS d(k, v)
  ) x WHERE t <> '{}'::jsonb
$$;--> statement-breakpoint
UPDATE entries e SET
  fields = jsonb_strip_nulls(jsonb_build_object(
    'company', pg_temp.naruvi_first(display, 'organization'),
    'employment', CASE
      WHEN pg_temp.naruvi_first(display, 'role') ~* 'freelance|ind[ée]pendant' THEN 'freelance'
      WHEN pg_temp.naruvi_first(display, 'role') ~* 'altern|apprenti' THEN 'apprenticeship'
      WHEN pg_temp.naruvi_first(display, 'role') ~* '\m(stage|stagiaire|intern|internship)\M|\mpfe\M' THEN 'internship' END,
    'dates', pg_temp.naruvi_range(pg_temp.naruvi_first(display, 'dates')))),
  display = (SELECT coalesce(jsonb_object_agg(k, t), '{}'::jsonb) FROM (
    SELECT d.k, jsonb_strip_nulls(jsonb_build_object(
      'position', nullif(trim(regexp_replace(d.v ->> 'role', '\s+(--|—|–|-)\s+(freelance|stage.*|alternance|internship|apprenticeship)$', '', 'i')), ''),
      'location', nullif(trim(d.v ->> 'location'), ''))) AS t
    FROM jsonb_each(e.display) AS d(k, v)) x WHERE t <> '{}'::jsonb)
WHERE kind = 'experience';--> statement-breakpoint
UPDATE entries e SET
  fields = jsonb_strip_nulls(jsonb_build_object('school', pg_temp.naruvi_first(display, 'organization'), 'dates', pg_temp.naruvi_range(pg_temp.naruvi_first(display, 'dates')))),
  display = pg_temp.naruvi_text(display, '{"degree":"role","location":"location"}')
WHERE kind = 'education';--> statement-breakpoint
UPDATE entries e SET
  fields = jsonb_strip_nulls(jsonb_build_object(
    'name', coalesce(nullif(trim(split_part(title, ' — ', 1)), ''), title),
    'dates', pg_temp.naruvi_range(pg_temp.naruvi_first(display, 'dates')))),
  display = CASE WHEN position(' — ' in title) > 0
    THEN jsonb_build_object((SELECT lang FROM naruvi_lang l WHERE l.id = e.id), jsonb_build_object('tagline', trim(substr(title, position(' — ' in title) + 3))))
    ELSE '{}'::jsonb END
WHERE kind = 'project';--> statement-breakpoint
UPDATE entries e SET
  fields = '{}'::jsonb,
  display = CASE WHEN pg_temp.naruvi_first(display, 'label') IS NOT NULL OR pg_temp.naruvi_first(display, 'role') IS NOT NULL
    THEN pg_temp.naruvi_text(display, CASE WHEN pg_temp.naruvi_first(display, 'label') IS NOT NULL THEN '{"name":"label"}'::jsonb ELSE '{"name":"role"}'::jsonb END)
    ELSE jsonb_build_object((SELECT lang FROM naruvi_lang l WHERE l.id = e.id), jsonb_build_object('name', trim(regexp_replace(title, '^(Comp[ée]tences|Skills)\s*[—–-]\s*', '', 'i')))) END
WHERE kind = 'skill';--> statement-breakpoint
UPDATE entries e SET
  fields = jsonb_strip_nulls(jsonb_build_object(
    'name', coalesce(pg_temp.naruvi_first(display, 'role'), nullif(trim(split_part(title, ' — ', 2)), ''), title),
    'issuer', coalesce(pg_temp.naruvi_first(display, 'organization'), CASE WHEN position(' — ' in title) > 0 THEN trim(split_part(title, ' — ', 1)) END),
    'issued', pg_temp.naruvi_range(pg_temp.naruvi_first(display, 'dates')) ->> 'start')),
  display = '{}'::jsonb
WHERE kind = 'certification';--> statement-breakpoint
UPDATE entries e SET
  fields = jsonb_strip_nulls(jsonb_build_object('issuer', pg_temp.naruvi_first(display, 'organization'), 'date', pg_temp.naruvi_range(pg_temp.naruvi_first(display, 'dates')) ->> 'start')),
  display = CASE WHEN pg_temp.naruvi_first(display, 'role') IS NOT NULL THEN pg_temp.naruvi_text(display, '{"title":"role"}')
    ELSE jsonb_build_object((SELECT lang FROM naruvi_lang l WHERE l.id = e.id), jsonb_build_object('title', title)) END
WHERE kind = 'achievement';--> statement-breakpoint
UPDATE entries e SET
  fields = jsonb_strip_nulls(jsonb_build_object('dates', pg_temp.naruvi_range(pg_temp.naruvi_first(display, 'dates')))),
  display = CASE WHEN pg_temp.naruvi_first(display, 'role') IS NOT NULL THEN pg_temp.naruvi_text(display, '{"title":"role","subtitle":"organization"}')
    ELSE jsonb_build_object((SELECT lang FROM naruvi_lang l WHERE l.id = e.id), jsonb_strip_nulls(jsonb_build_object('title', title, 'subtitle', pg_temp.naruvi_first(display, 'organization')))) END
WHERE kind = 'other';--> statement-breakpoint
ALTER TABLE "entries" DROP COLUMN "title";--> statement-breakpoint
-- A language entry used to be one list ("French (C1)", "English (fluent)"): now one entry per language.
INSERT INTO entries (profile_id, key, kind, status, display, fields, tags, skills, evidence, do_not_claim, confidential, sort_order, source)
SELECT DISTINCT ON (e.profile_id, lower(trim(split_part(item, '(', 1))))
  e.profile_id,
  'language-' || substr(md5(e.id::text || item), 1, 8),
  'language', e.status,
  jsonb_build_object(l.lang, jsonb_build_object('language', trim(split_part(item, '(', 1)))),
  jsonb_strip_nulls(jsonb_build_object(
    'level', CASE
      WHEN item ~* 'matern|native|natif|natal|mother' THEN 'native'
      WHEN upper(item) ~ '\m(A1|A2|B1|B2|C1|C2)\M' THEN substring(upper(item) from '\m(A1|A2|B1|B2|C1|C2)\M')
      WHEN item ~* 'bilingu|courant|fluent' THEN 'C1'
      WHEN item ~* 'professionnel|professional|avanc|advanced' THEN 'B2'
      WHEN item ~* 'interm' THEN 'B1'
      WHEN item ~* 'notions|basic|d[ée]butant|beginner|scolaire' THEN 'A2' END,
    'test', substring(upper(item) from '\m(TOEIC|TOEFL|IELTS|TCF|TEF|DELF|DALF|CAMBRIDGE|DELE|GOETHE)\M'))),
  '{}', '{}', '{}', '{}', false, ord::int, e.source
FROM entries e JOIN naruvi_lang l ON l.id = e.id, unnest(e.skills) WITH ORDINALITY AS s(item, ord)
WHERE e.kind = 'language' AND trim(item) <> ''
ORDER BY e.profile_id, lower(trim(split_part(item, '(', 1))), ord;--> statement-breakpoint
DELETE FROM entries WHERE kind = 'language' AND fields = '{}'::jsonb AND display = '{}'::jsonb AND cardinality(skills) > 0;--> statement-breakpoint
