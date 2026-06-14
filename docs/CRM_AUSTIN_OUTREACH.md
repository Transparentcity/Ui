# CRM / Contacts — review + Austin City Council outreach

_Last updated: 2026-06-14_

This doc covers (1) a review of the CRM/Contacts module, (2) the Austin City
Council outreach setup added in this branch, and (3) suggested improvements.

---

## 1. Module review — is it working?

The CRM lives under `/contacts` (`src/app/contacts/page.tsx`) and renders
`ContactsTable` (`src/components/contacts-table.tsx`). Data flows through the
`prospects` table via `src/lib/db.ts` (Postgres) and server actions in
`src/app/actions/contacts.ts`.

What works well:

- **Contacts table**: search, type filter, column sort, pagination (25/page),
  CSV export, per-row Edit / Generate Draft / Activity / Delete.
- **Bulk actions**: assign city, add keywords, set contact type (batched, 50 at a time).
- **City scoping**: the table is scoped to the globally-selected CRM city, giving
  a clean single-city mailbox.
- **Import**: multi-step CSV import (upload → map → preview → result) with header
  auto-detection and per-row validation.
- **Templates**: stored in `templates`, personalized via `src/lib/template-engine.ts`
  (`{{name}}`, `{{title}}`, `{{organization}}`, `{{department}}`, `{{jurisdiction}}`,
  `{{email}}`, `{{city}}`).

Conclusion: the module is functional. **No schema/migration change is needed**
for this outreach — the council contacts use the existing `city_staff` contact
type (the default, already allowed by the schema) and are categorized as
government/city council via keyword tags. The `013` file is therefore a plain
**data seed** (INSERTs only), not a migration.

> Note (not changed here): migration `009`'s `contact_type` CHECK constraint only
> allows `('city_staff','media')`, while the UI also offers `elected_official`,
> `academic`, `nonprofit`, `lobbyist`, and `community_leader`. Saving a contact as
> one of those would fail the constraint. Left as-is per request; tracked under
> Improvements.

---

## 2. Austin City Council outreach

### What was added

- **`scripts/013_seed_austin_city_council.sql`** — idempotent **data seed** (no
  schema change) that:
  1. Seeds `Government` and `City Council` keywords.
  2. Inserts the Mayor + 10 district council members as `prospects`
     (`contact_type = city_staff`, `city_id = 56718` / Austin,
     `jurisdiction = "District N"`).
  3. Tags each with `Government` + `City Council`.
  4. Seeds the weekly-update invitation email template.
- **`scripts/austin-city-council-contacts.csv`** — the same 11 contacts, ready to
  drop into the Contacts → **Import CSV** flow (auto-maps every column).

Subscriptions to the weekly Sunday digest are handled separately (outside this
repo); nothing here writes a subscription record.

### How to load it

Preferred (sets `city_id` so contacts show in the Austin mailbox + tags them):

```bash
psql "$DATABASE_URL" -f scripts/013_seed_austin_city_council.sql
```

Or via the UI: Contacts → **Import CSV** → upload `scripts/austin-city-council-contacts.csv`.
⚠️ The CSV importer does **not** set `city_id` (see Improvements), so after import
select the rows and use **Assign City → Austin**, otherwise they won't appear in
the Austin-scoped view.

### The roster (verified June 2026)

| District | Member | Email |
|---|---|---|
| Mayor | Kirk Watson | kirk.watson@austintexas.gov |
| 1 | Natasha Harper-Madison | district1@austintexas.gov |
| 2 | Vanessa Fuentes | district2@austintexas.gov |
| 3 | José Velásquez | district3@austintexas.gov |
| 4 | José "Chito" Vela | district4@austintexas.gov |
| 5 | Ryan Alter | district5@austintexas.gov |
| 6 | Krista Laine | district6@austintexas.gov |
| 7 | Mike Siegel | district7@austintexas.gov |
| 8 | Paige Ellis | district8@austintexas.gov |
| 9 | Zohaib "Zo" Qadri | district9@austintexas.gov |
| 10 | Marc Duchen | district10@austintexas.gov |

Sources: <https://www.austintexas.gov/council>, <https://en.wikipedia.org/wiki/Austin_City_Council>.
Council offices use the `district<N>@austintexas.gov` general-inquiry mailbox; the
Mayor uses a named mailbox.

### The invitation email (template "Austin Council — Weekly District Update (invite)")

Casual / handwritten tone with intentional lowercase. Subject and lead headline
are real facts pulled from the Austin public feed. Personalized per recipient via
`{{name}}` and `{{jurisdiction}}`.

> **Subject:** austin drug crime is up 29% this year — reversing a 5-year decline
>
> hey {{name}},
>
> i'm adam — i run transparent city. we turn austin's open data into a
> plain-english read so nobody has to dig through dashboards. couple things that
> jumped out this month:
>
> • austin drug crime up 29%, reversing a five-year decline
> • traffic crashes down 19% — the lowest pace in a decade
> • parking complaints up 27%, now driving the whole 311 surge
>
> heads up — i've gone ahead and subscribed you to a weekly transparent city
> update for {{jurisdiction}}. the first one lands THIS sunday, and you'll get one
> every sunday after that. just the numbers that actually moved in your district,
> nothing else.
>
> if there's stuff you care about more (housing? public safety? permits?) just hit
> reply and tell me — i'll tune it to your interests. and if it's not for you,
> reply "stop" and i'll take you right off, no worries.
>
> talk soon,
> adam

Facts are current as of the June 2026 Austin feed; refresh the headlines before a
send if time has passed.

---

## 3. Suggested improvements

1. **CSV import should support city + region.** The importer (`contact-import-dialog.tsx`)
   hard-codes `city_id: null` / `city_name: null`, so every imported contact is
   invisible in city-scoped views until manually re-assigned. Add a "default city
   for this import" picker (or map a city column).
2. **A real "Government / City Council" contact type or tag taxonomy.** Today
   "city council" is expressed as `elected_official` + free-text keywords. Consider
   a first-class `office_group` (referenced in `template-engine.ts` but not in the
   schema/UI) so council offices can be grouped and mail-merged cleanly.
3. **Subscription tracking.** The invite promises a weekly Sunday digest, but there
   is no `subscriptions` concept in the schema. Add a table (contact_id, city_id,
   district, cadence, status) so "subscribed / unsubscribed / paused" is durable and
   the Sunday job has a source of truth. Wire reply-driven "refine my interests" and
   "stop" into it (keywords + `status='unsubscribed'`).
4. **Unsubscribe + CAN-SPAM footer.** Outreach to public officials should include a
   physical address and one-click unsubscribe; right now that's manual ("reply stop").
5. **Bulk "Generate Drafts" from a selection.** Single-row "Generate Draft" exists;
   a bulk version over the current selection (using a chosen template) would make a
   roster-wide invite a one-click action instead of 11 separate ones.
6. **Duplicate-on-import guard.** `checkDuplicateEmail` exists for the single-contact
   dialog but the CSV importer doesn't use it, so re-importing the roster creates
   duplicates. (The SQL seed in `013` is guarded; the importer is not.)
