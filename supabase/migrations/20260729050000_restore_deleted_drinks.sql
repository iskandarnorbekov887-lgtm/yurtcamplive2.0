-- ============================================================
-- RESTORE DELETED DRINKS
-- ============================================================

-- Insert deleted drinks back into the drinks table
INSERT INTO drinks (id, name, category, created_at) VALUES
  ('05812c40-d38d-42fd-9b24-8b6ef5bd7dda', 'Qibray', 'piva', '2026-07-23 17:00:35.448508+00'),
  ('0cbe9111-1001-490e-ac87-f41e677f84ab', 'Bog''i Zafron (qizil)', 'vino', '2026-07-23 17:00:35.448508+00'),
  ('416d3d57-aac3-4ba4-9468-94d29e0ebc1e', 'Khortytsia', 'aroq', '2026-07-23 17:00:35.448508+00'),
  ('4274a433-a6b1-456d-bf69-2ebd2cce6149', '7UP', 'saqlangan_ichimliklar', '2026-07-23 17:00:35.448508+00'),
  ('44dcc3e6-3547-4543-b1d3-aed89185425a', 'Sprite', 'saqlangan_ichimliklar', '2026-07-23 17:00:35.448508+00'),
  ('563deeb2-52c5-4237-a3b6-f1e135e594df', 'Tuborg', 'piva', '2026-07-23 17:00:35.448508+00'),
  ('698141e8-d93c-4dd4-8f0d-fcfc97f90fd5', 'Silk Road', 'aroq', '2026-07-23 17:00:35.448508+00'),
  ('728083e0-3cd0-402a-928c-8f699f2cacd5', 'Pulsar', 'piva', '2026-07-23 17:00:35.448508+00'),
  ('76d70db3-40d8-42f7-b100-43d76a6a8b82', 'Karat', 'aroq', '2026-07-23 17:00:35.448508+00'),
  ('9899b634-296d-45db-a9e6-cf7d10e351f9', 'Shirin', 'vino', '2026-07-23 17:00:35.448508+00'),
  ('9e675985-be2e-4408-bbcd-be1a75bf7d0a', 'Mirinda', 'saqlangan_ichimliklar', '2026-07-23 17:00:35.448508+00'),
  ('ad735924-d22e-42cb-86f8-149537742d44', 'Sarbast', 'piva', '2026-07-23 17:00:35.448508+00'),
  ('b476ccb5-8c7e-4f0d-a555-f0232eb46a93', 'Fanta', 'saqlangan_ichimliklar', '2026-07-23 17:00:35.448508+00'),
  ('cd7658ad-d7f4-4659-9dc1-a3aa5abc83ea', 'Coca-Cola', 'saqlangan_ichimliklar', '2026-07-23 17:00:35.448508+00'),
  ('d6ad9bfa-7abb-4925-abd4-f87bc142a64e', 'Pepsi', 'saqlangan_ichimliklar', '2026-07-23 17:00:35.448508+00')
ON CONFLICT (id) DO NOTHING;
