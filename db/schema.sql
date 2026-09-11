CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN CREATE TYPE member_role AS ENUM ('OWNER','DM','PLAYER'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE character_kind AS ENUM ('PLAYER','COMPANION','MERCENARY','NPC'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE quest_status AS ENUM ('AVAILABLE','ACTIVE','COMPLETED','DECLINED','FAILED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE knowledge_level AS ENUM ('UNKNOWN','RUMOR','SEEN','STUDIED','COMPLETE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), display_name text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL REFERENCES users(id), name text NOT NULL,
  description text NOT NULL DEFAULT '', chapter text NOT NULL DEFAULT '', ruleset text NOT NULL DEFAULT 'DND5E',
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','PAUSED','ARCHIVED')), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS campaign_members (
  campaign_id uuid REFERENCES campaigns(id) ON DELETE CASCADE, user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  role member_role NOT NULL, PRIMARY KEY (campaign_id,user_id)
);
CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  title text NOT NULL, started_at timestamptz NOT NULL DEFAULT now(), ended_at timestamptz
);
CREATE TABLE IF NOT EXISTS characters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL, kind character_kind NOT NULL DEFAULT 'PLAYER', name text NOT NULL,
  race text NOT NULL DEFAULT '', class_name text NOT NULL DEFAULT '', subclass text NOT NULL DEFAULT '', background text NOT NULL DEFAULT '',
  rank text NOT NULL DEFAULT '', level smallint NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 20), xp integer NOT NULL DEFAULT 0 CHECK (xp >= 0),
  xp_next integer NOT NULL DEFAULT 300 CHECK (xp_next > 0), hp integer NOT NULL, hp_max integer NOT NULL CHECK (hp_max > 0),
  temp_hp integer NOT NULL DEFAULT 0 CHECK (temp_hp >= 0), armor_class smallint NOT NULL DEFAULT 10, speed integer NOT NULL DEFAULT 30,
  initiative integer NOT NULL DEFAULT 0, proficiency_bonus smallint NOT NULL DEFAULT 2, inspiration boolean NOT NULL DEFAULT false,
  spell_save_dc smallint, spell_attack_bonus smallint, hit_dice text NOT NULL DEFAULT '1d8', death_saves jsonb NOT NULL DEFAULT '{"success":0,"failure":0}',
  abilities jsonb NOT NULL DEFAULT '{"str":10,"dex":10,"con":10,"int":10,"wis":10,"cha":10}',
  saving_throw_proficiencies text[] NOT NULL DEFAULT '{}', skill_proficiencies jsonb NOT NULL DEFAULT '{}',
  proficiencies text[] NOT NULL DEFAULT '{}', languages text[] NOT NULL DEFAULT '{}', senses jsonb NOT NULL DEFAULT '{}',
  traits jsonb NOT NULL DEFAULT '[]', currency jsonb NOT NULL DEFAULT '{"cp":0,"sp":0,"ep":0,"gp":0,"pp":0}',
  biography text NOT NULL DEFAULT '', portrait_url text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (hp <= hp_max)
);
CREATE TABLE IF NOT EXISTS party_members (
  campaign_id uuid REFERENCES campaigns(id) ON DELETE CASCADE, character_id uuid REFERENCES characters(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(), active boolean NOT NULL DEFAULT true, recruitment_type text NOT NULL DEFAULT 'START',
  wage_gp integer NOT NULL DEFAULT 0, PRIMARY KEY (campaign_id,character_id)
);
CREATE TABLE IF NOT EXISTS locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES locations(id) ON DELETE SET NULL, name text NOT NULL, description text NOT NULL DEFAULT '',
  x numeric, y numeric, discovered boolean NOT NULL DEFAULT false, visited boolean NOT NULL DEFAULT false, secrets jsonb NOT NULL DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS creatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), campaign_id uuid REFERENCES campaigns(id) ON DELETE CASCADE,
  name text NOT NULL, creature_type text NOT NULL DEFAULT '', challenge_rating numeric, armor_class smallint, hp_average integer,
  public_data jsonb NOT NULL DEFAULT '{}', secret_data jsonb NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS knowledge_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  character_id uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE, subject_type text NOT NULL,
  subject_id uuid NOT NULL, level knowledge_level NOT NULL DEFAULT 'UNKNOWN', facts jsonb NOT NULL DEFAULT '[]',
  updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(character_id,subject_type,subject_id)
);
CREATE TABLE IF NOT EXISTS items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), campaign_id uuid REFERENCES campaigns(id) ON DELETE CASCADE,
  name text NOT NULL, item_type text NOT NULL, rarity text NOT NULL DEFAULT 'COMMON', description text NOT NULL DEFAULT '',
  weight numeric NOT NULL DEFAULT 0, base_value_gp numeric NOT NULL DEFAULT 0, consumable boolean NOT NULL DEFAULT false,
  stackable boolean NOT NULL DEFAULT false, properties jsonb NOT NULL DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS inventory_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), character_id uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES items(id), quantity integer NOT NULL DEFAULT 1 CHECK (quantity >= 0), equipped boolean NOT NULL DEFAULT false,
  attuned boolean NOT NULL DEFAULT false, charges integer, custom_name text, notes text NOT NULL DEFAULT '', UNIQUE(character_id,item_id)
);
CREATE TABLE IF NOT EXISTS item_discoveries (
  inventory_entry_id uuid REFERENCES inventory_entries(id) ON DELETE CASCADE, property_key text NOT NULL,
  method text NOT NULL, discovered_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(inventory_entry_id,property_key)
);
CREATE TABLE IF NOT EXISTS effects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  target_character_id uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE, source_character_id uuid REFERENCES characters(id) ON DELETE SET NULL,
  name text NOT NULL, category text NOT NULL CHECK (category IN ('BUFF','DEBUFF','CONDITION')),
  description text NOT NULL DEFAULT '', value jsonb NOT NULL DEFAULT '{}', duration_rounds integer,
  concentration boolean NOT NULL DEFAULT false, started_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz, active boolean NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX IF NOT EXISTS one_concentration_per_character ON effects(source_character_id) WHERE concentration AND active;
CREATE TABLE IF NOT EXISTS quests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  title text NOT NULL, description text NOT NULL DEFAULT '', status quest_status NOT NULL DEFAULT 'AVAILABLE',
  source_type text NOT NULL DEFAULT 'NPC', source_id uuid, recommended_level smallint, reward jsonb NOT NULL DEFAULT '{}',
  accepted_at timestamptz, completed_at timestamptz
);
CREATE TABLE IF NOT EXISTS quest_objectives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), quest_id uuid NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
  title text NOT NULL, current_value integer NOT NULL DEFAULT 0, target_value integer NOT NULL DEFAULT 1,
  optional boolean NOT NULL DEFAULT false, completed boolean NOT NULL DEFAULT false, sort_order integer NOT NULL DEFAULT 0,
  UNIQUE(quest_id,title)
);
CREATE TABLE IF NOT EXISTS journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  session_id uuid REFERENCES sessions(id) ON DELETE SET NULL, author_character_id uuid REFERENCES characters(id) ON DELETE SET NULL,
  entry_type text NOT NULL DEFAULT 'EVENT', title text NOT NULL, body text NOT NULL, tags text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  session_id uuid REFERENCES sessions(id) ON DELETE SET NULL, character_id uuid REFERENCES characters(id) ON DELETE SET NULL,
  role text NOT NULL CHECK (role IN ('PLAYER','MASTER','SYSTEM')), body text NOT NULL, metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS dice_rolls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  character_id uuid REFERENCES characters(id) ON DELETE SET NULL, notation text NOT NULL, dice_total integer NOT NULL,
  modifier integer NOT NULL DEFAULT 0, total integer NOT NULL, reason text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS game_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  session_id uuid REFERENCES sessions(id) ON DELETE SET NULL, actor_character_id uuid REFERENCES characters(id) ON DELETE SET NULL,
  event_type text NOT NULL, aggregate_type text NOT NULL, aggregate_id uuid, payload jsonb NOT NULL DEFAULT '{}',
  caused_by uuid REFERENCES game_events(id) ON DELETE SET NULL, sequence bigint GENERATED ALWAYS AS IDENTITY,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(campaign_id,sequence)
);
CREATE INDEX IF NOT EXISTS events_campaign_sequence ON game_events(campaign_id,sequence);
CREATE INDEX IF NOT EXISTS messages_campaign_created ON messages(campaign_id,created_at);
CREATE INDEX IF NOT EXISTS active_effects_target ON effects(target_character_id) WHERE active;
CREATE INDEX IF NOT EXISTS quest_campaign_status ON quests(campaign_id,status);
