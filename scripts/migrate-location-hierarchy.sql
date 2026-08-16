-- Location hierarchy: add 'building' and 'floor' types so locations can model
-- Building → Floor → Room → Shelf. Additive / idempotent.

alter table public.locations drop constraint if exists locations_type_check;
alter table public.locations add constraint locations_type_check
  check (type in ('building','floor','warehouse','office','store','room','shelf','vehicle','other'));

notify pgrst, 'reload schema';
