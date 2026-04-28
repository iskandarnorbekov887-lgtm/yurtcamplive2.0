-- Seed script to create default users for each role
-- Run this in Supabase SQL Editor after migrations are applied

-- IMPORTANT: These are DEFAULT credentials. Change passwords immediately after first login!

-- Default credentials:
-- CEO: ceo@yurtcamp.com / CEOadmin123
-- Manager: manager@yurtcamp.com / Manager123
-- Reserver: reserver@yurtcamp.com / Reserver123
-- Cook: cook@yurtcamp.com / Cook123

-- Note: Creating Supabase Auth users directly via SQL requires proper password hashing.
-- This script uses the built-in auth.users table with bcrypt hashed passwords.
-- For production, consider using the Supabase Dashboard or API to create users.

-- Insert CEO user
INSERT INTO auth.users (
  id,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_user_meta_data,
  created_at,
  updated_at
) VALUES (
  gen_random_uuid(),
  'ceo@yurtcamp.com',
  crypt('CEOadmin123', gen_salt('bf')),
  now(),
  '{"full_name": "CEO Admin"}',
  now(),
  now()
) ON CONFLICT (email) DO NOTHING;

-- Insert Manager user
INSERT INTO auth.users (
  id,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_user_meta_data,
  created_at,
  updated_at
) VALUES (
  gen_random_uuid(),
  'manager@yurtcamp.com',
  crypt('Manager123', gen_salt('bf')),
  now(),
  '{"full_name": "Camp Manager"}',
  now(),
  now()
) ON CONFLICT (email) DO NOTHING;

-- Insert Reserver user
INSERT INTO auth.users (
  id,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_user_meta_data,
  created_at,
  updated_at
) VALUES (
  gen_random_uuid(),
  'reserver@yurtcamp.com',
  crypt('Reserver123', gen_salt('bf')),
  now(),
  '{"full_name": "Booking Reserver"}',
  now(),
  now()
) ON CONFLICT (email) DO NOTHING;

-- Insert Cook user
INSERT INTO auth.users (
  id,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_user_meta_data,
  created_at,
  updated_at
) VALUES (
  gen_random_uuid(),
  'cook@yurtcamp.com',
  crypt('Cook123', gen_salt('bf')),
  now(),
  '{"full_name": "Camp Cook"}',
  now(),
  now()
) ON CONFLICT (email) DO NOTHING;

-- Create corresponding profiles with roles
INSERT INTO profiles (id, email, full_name, role)
SELECT 
  id, 
  email, 
  raw_user_meta_data->>'full_name' as full_name,
  CASE 
    WHEN email = 'ceo@yurtcamp.com' THEN 'CEO'
    WHEN email = 'manager@yurtcamp.com' THEN 'Manager'
    WHEN email = 'reserver@yurtcamp.com' THEN 'Reserver'
    WHEN email = 'cook@yurtcamp.com' THEN 'Cook'
  END as role
FROM auth.users
WHERE email IN ('ceo@yurtcamp.com', 'manager@yurtcamp.com', 'reserver@yurtcamp.com', 'cook@yurtcamp.com')
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  full_name = EXCLUDED.full_name,
  role = EXCLUDED.role;
