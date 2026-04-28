-- Copy-paste this to Supabase SQL Editor
-- Creates profiles for existing auth users based on email
-- Run AFTER creating users in Supabase Dashboard with these emails:
-- ceo@yurtcamp.com, manager@yurtcamp.com, reserver@yurtcamp.com, cook@yurtcamp.com

INSERT INTO profiles (id, email, full_name, role)
SELECT 
  id,
  email,
  COALESCE(raw_user_meta_data->>'full_name', email) as full_name,
  CASE 
    WHEN email = 'ceo@yurtcamp.com' THEN 'CEO'
    WHEN email = 'manager@yurtcamp.com' THEN 'Manager'
    WHEN email = 'reserver@yurtcamp.com' THEN 'Reserver'
    WHEN email = 'cook@yurtcamp.com' THEN 'Cook'
    ELSE 'Manager'
  END as role
FROM auth.users
WHERE email IN ('ceo@yurtcamp.com', 'manager@yurtcamp.com', 'reserver@yurtcamp.com', 'cook@yurtcamp.com')
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  full_name = EXCLUDED.full_name,
  role = EXCLUDED.role;
