import postgres from 'postgres';

let client;
let schemaReady=false;

export function dbConfigured(){return !!process.env.DATABASE_URL}

export function getDb(){
  if(!dbConfigured()) return null;
  if(!client) client=postgres(process.env.DATABASE_URL,{max:1,prepare:false,idle_timeout:20,connect_timeout:10,ssl:'require'});
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
    content_type text,
    scheduled_at timestamptz not null,
    approved_at timestamptz not null,
    status text not null default 'scheduled',
    pinterest_pin_id text,
    last_error text,
    published_at timestamptz,
    created_at timestamptz not null default now()
  )`;
  await sql`create index if not exists scheduled_pins_due_idx on scheduled_pins(status,scheduled_at)`;
  await sql`create index if not exists scheduled_pins_user_idx on scheduled_pins(user_id,scheduled_at)`;
  schemaReady=true;
  return true;
}
