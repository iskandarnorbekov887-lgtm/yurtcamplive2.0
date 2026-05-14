-- 1. Rename columns to match the new UI logic
ALTER TABLE bookings RENAME COLUMN number_of_people TO number_of_adults;
ALTER TABLE bookings RENAME COLUMN children_under_12 TO number_of_children;

-- 2. Reload schema cache so PostgREST sees the new columns
NOTIFY pgrst, 'reload schema';

-- 3. Verify the changes
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'bookings' 
AND column_name IN ('number_of_adults', 'number_of_children');
