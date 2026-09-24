import postgres from 'postgres';

let client;
let schemaReady=false;

export function dbConfigured(){return !!process.env.DATABASE_URL}
export function getDb(){
  if(!dbConfigured()) return null;
  if(!client) client=postgres(process.env.DATABASE_URL,{max:3,prepare:false,idle_timeout:20,connect_timeout:10,ssl:'require'});
  return client;
}
export async function ensureSchema(){
  const sql=getDb();
  if(!sql) return false;
  if(schemaReady) return true;
  await sql`create table if not exists app_users (
    id text primary key,
    email text unique not null,
    password_hash text not null,
    plan text not null default 'free',
    stripe_customer_id text,
    stripe_subscription_id text,
    role text not null default 'user',
    ai_credits integer not null default 25,
    email_verified_at timestamptz,
    created_at timestamptz not null default now()
  )`;
  await sql`alter table app_users add column if not exists role text not null default 'user'`;
  await sql`alter table app_users add column if not exists ai_credits integer not null default 25`;
  await sql`alter table app_users add column if not exists email_verified_at timestamptz`;
  await sql`update app_users set email_verified_at=created_at where email_verified_at is null and created_at < now() - interval '1 minute'`;
  await sql`update app_users set role='owner',ai_credits=greatest(ai_credits,1000)
    where id=(select id from app_users order by created_at asc limit 1)
    and not exists(select 1 from app_users where role='owner')`;
  await sql`create table if not exists app_settings (
    key text primary key,
    value text,
    sensitive boolean not null default false,
    updated_at timestamptz not null default now()
  )`;
  await sql`create table if not exists email_verifications (
    id text primary key,
    user_id text not null references app_users(id) on delete cascade,
    token_hash text unique not null,
    expires_at timestamptz not null,
    created_at timestamptz not null default now()
  )`;
  await sql`create index if not exists email_verifications_token_idx on email_verifications(token_hash)`;
  await sql`create table if not exists credit_ledger (
    id text primary key,
    user_id text not null references app_users(id) on delete cascade,
    delta integer not null,
    reason text,
    created_at timestamptz not null default now()
  )`;
  await sql`create table if not exists app_sessions (
    id text primary key,
    user_id text not null references app_users(id) on delete cascade,
    token_hash text unique not null,
    expires_at timestamptz not null,
    created_at timestamptz not null default now()
  )`;
  await sql`create index if not exists app_sessions_token_idx on app_sessions(token_hash)`;
  await sql`create table if not exists pinterest_accounts (
    user_id text primary key references app_users(id) on delete cascade,
    username text,
    access_token text not null,
    refresh_token text,
    access_expires_at timestamptz,
    refresh_expires_at timestamptz,
    scopes text,
    updated_at timestamptz not null default now()
  )`;
  await sql`create table if not exists scheduled_pins (
    id text primary key,
    user_id text not null references app_users(id) on delete cascade,
    board_id text not null,
    board_name text,
    title text not null,
    description text,
    destination text,
    alt_text text,
    image_data text,
    image_url text,
    image_thumb text,
    content_type text,
    file_name text,
    scheduled_at timestamptz not null,
    approved_at timestamptz not null,
    status text not null default 'scheduled',
    pinterest_pin_id text,
    last_error text,
    published_at timestamptz,
    created_at timestamptz not null default now()
  )`;
  await sql`alter table scheduled_pins add column if not exists image_thumb text`;
  await sql`create index if not exists scheduled_pins_due_idx on scheduled_pins(status,scheduled_at)`;
  await sql`create index if not exists scheduled_pins_user_idx on scheduled_pins(user_id,scheduled_at)`;
  await sql`create table if not exists website_connections (
    id text primary key,
    user_id text not null references app_users(id) on delete cascade,
    site_url text not null,
    site_name text,
    kind text not null default 'wordpress-public',
    created_at timestamptz not null default now(),
    unique(user_id,site_url)
  )`;
  schemaReady=true;
  return true;
}
