-- Add receipt_url column to camp_finances table for storing receipt image URLs
ALTER TABLE camp_finances 
ADD COLUMN IF NOT EXISTS receipt_url TEXT;

-- Create receipts storage bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('receipts', 'receipts', true)
ON CONFLICT (id) DO NOTHING;

-- Enable RLS on receipts bucket
ALTER TABLE storage.objects 
ENABLE ROW LEVEL SECURITY;

-- Policy: Allow authenticated users to upload to receipts bucket
CREATE POLICY IF NOT EXISTS "Authenticated users can upload to receipts"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'receipts');

-- Policy: Allow authenticated users to read from receipts bucket
CREATE POLICY IF NOT EXISTS "Authenticated users can read from receipts"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'receipts');

-- Policy: Allow authenticated users to delete from receipts bucket
CREATE POLICY IF NOT EXISTS "Authenticated users can delete from receipts"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'receipts');
