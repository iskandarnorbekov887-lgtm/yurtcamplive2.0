-- Create profiles table for user roles and metadata
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'Manager' CHECK (role IN ('CEO', 'Manager', 'Reserver', 'Cook')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users full access to profiles (internal app, staff-only)
DROP POLICY IF EXISTS "Authenticated users can view profiles" ON profiles;
CREATE POLICY "Authenticated users can view profiles"
  ON profiles FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert profiles" ON profiles;
CREATE POLICY "Authenticated users can insert profiles"
  ON profiles FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update profiles" ON profiles;
CREATE POLICY "Authenticated users can update profiles"
  ON profiles FOR UPDATE
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can delete profiles" ON profiles;
CREATE POLICY "Authenticated users can delete profiles"
  ON profiles FOR DELETE
  USING (true);

-- Create index on email for faster lookups
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);

-- Create index on role for faster filtering
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);

-- Function to automatically create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    COALESCE(NEW.raw_user_meta_data->>'role', 'CEO')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to call function on new user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
