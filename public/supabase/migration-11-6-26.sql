create type public.training_qualification_status as enum ('Not Trained', 'Training', 'Trained', 'Trainer');

create table public.person_role_qualifications (
  person_id uuid not null default gen_random_uuid (),
  role text not null,
  qualification public.training_qualification_status null default 'Not Trained'::training_qualification_status,
  id uuid not null default gen_random_uuid (),
  constraint person_role_qualifications_pkey primary key (id),
  constraint person_role_qualifications_person_id_fkey foreign KEY (person_id) references profiles (id) on update CASCADE on delete CASCADE
) TABLESPACE pg_default;

-- Training provisions now have a coulmn for connecting a trainee's schedule to who is training them (for that particular shift).
alter table public.person_role_qualifications
add coulmn being_trained_by uuid;

create table public.volunteer_role_trainings (
  id uuid not null default gen_random_uuid (),
  created_by uuid null default gen_random_uuid (),
  updated_by uuid null default gen_random_uuid (),
  created_at timestamp with time zone not null default now(),
  role text null,
  roleoverview text[] null,
  trainer_roleoverview text[] null,
  trainee_material text null,
  trainer_material text null,
  updated_at timestamp with time zone null,
  constraint volunteer_role_trainings_pkey primary key (id),
  constraint volunteer_role_trainings_created_by_fkey foreign KEY (created_by) references profiles (id) on update CASCADE,
  constraint volunteer_role_trainings_updated_by_fkey foreign KEY (updated_by) references profiles (id) on update CASCADE
) TABLESPACE pg_default;
