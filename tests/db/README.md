# Veritabanı testleri (SQL)

`rls.sql` M3 bitti testinin veritabanı tarafını doğrular: seed sayıları, `L1.*` → `topic_id`, `item_keys`'in kimseye görünmemesi, öğrenci / öğretmen / admin RLS kapsamı, öğrencinin doğrudan yazamaması, RLS'i kapalı tablo olmaması ve hesap silme zinciri. Tamamı tek işlemde çalışır ve `rollback` ile biter; bir doğrulama tutmazsa `BAŞARISIZ: …` hatasıyla sıfır olmayan kodla çıkar.

## `dev` projesinde

```bash
psql "<dev-db-url>" -v ON_ERROR_STOP=1 -f tests/db/rls.sql
```

## Docker'sız yerel Postgres'te

`supabase-stub.sql` Supabase'in `auth` şemasını ve rollerini (`anon`, `authenticated`, `service_role`) taklit eder; yalnızca burada kullanılır.

```bash
createdb m3test
psql -d m3test -v ON_ERROR_STOP=1 -f tests/db/supabase-stub.sql
for f in supabase/migrations/*.sql; do psql -d m3test -v ON_ERROR_STOP=1 -f "$f"; done
psql -d m3test -v ON_ERROR_STOP=1 -f supabase/seed.sql
psql -d m3test -v ON_ERROR_STOP=1 -f tests/db/rls.sql
```

Aynı veritabanından tür üretimi (Docker gerekmez):

```bash
npx supabase gen types typescript --remote="postgresql://postgres@localhost:5432/m3test" --schema public > lib/db/types.ts
npx -y oxfmt lib/db/types.ts
```
