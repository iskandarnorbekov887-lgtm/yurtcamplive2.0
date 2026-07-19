DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bookings' AND column_name = 'number_of_people')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bookings' AND column_name = 'number_of_adults')
  THEN
    ALTER TABLE bookings RENAME COLUMN number_of_people TO number_of_adults;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bookings' AND column_name = 'children_under_12')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bookings' AND column_name = 'number_of_children')
  THEN
    ALTER TABLE bookings RENAME COLUMN children_under_12 TO number_of_children;
  END IF;
END $$;
