-- Seed data for SpongeBob World theme
INSERT OR IGNORE INTO themes (
  theme_id,
  theme,
  model,
  style,
  master_prompt
) VALUES (
  'spongebob-world-imagen4-animation',
  'SpongeBob World',
  'IMAGEN_4',
  'Animation',
  '[subject] [action] in Bikini Bottom, underwater cartoon animation style, bright colors'
);

-- Add all testing elements for SpongeBob World
INSERT OR IGNORE INTO testing_elements (theme_id, element, element_type, test_order) VALUES
-- Main Characters (1-20)
('spongebob-world-imagen4-animation', 'SpongeBob', 'character', 1),
('spongebob-world-imagen4-animation', 'Patrick', 'character', 2),
('spongebob-world-imagen4-animation', 'Squidward', 'character', 3),
('spongebob-world-imagen4-animation', 'Mr. Krabs', 'character', 4),
('spongebob-world-imagen4-animation', 'Sandy Cheeks', 'character', 5),
('spongebob-world-imagen4-animation', 'Plankton', 'character', 6),
('spongebob-world-imagen4-animation', 'Gary', 'character', 7),
('spongebob-world-imagen4-animation', 'Pearl', 'character', 8),
('spongebob-world-imagen4-animation', 'Mrs. Puff', 'character', 9),
('spongebob-world-imagen4-animation', 'Larry Lobster', 'character', 10),
('spongebob-world-imagen4-animation', 'Flying Dutchman', 'character', 11),
('spongebob-world-imagen4-animation', 'Karen', 'character', 12),
('spongebob-world-imagen4-animation', 'Bubble Bass', 'character', 13),
('spongebob-world-imagen4-animation', 'Mermaid Man', 'character', 14),
('spongebob-world-imagen4-animation', 'Barnacle Boy', 'character', 15),
('spongebob-world-imagen4-animation', 'Squilliam', 'character', 16),
('spongebob-world-imagen4-animation', 'Kevin the Cucumber', 'character', 17),
('spongebob-world-imagen4-animation', 'Patchy the Pirate', 'character', 18),
('spongebob-world-imagen4-animation', 'Potty the Parrot', 'character', 19),
('spongebob-world-imagen4-animation', 'Fred Fish', 'character', 20),

-- Locations (21-35)
('spongebob-world-imagen4-animation', 'Krusty Krab', 'location', 21),
('spongebob-world-imagen4-animation', 'Bikini Bottom', 'location', 22),
('spongebob-world-imagen4-animation', 'Jellyfish Fields', 'location', 23),
('spongebob-world-imagen4-animation', 'Chum Bucket', 'location', 24),
('spongebob-world-imagen4-animation', 'Goo Lagoon', 'location', 25),
('spongebob-world-imagen4-animation', 'Rock Bottom', 'location', 26),
('spongebob-world-imagen4-animation', 'Glove World', 'location', 27),
('spongebob-world-imagen4-animation', 'SpongeBob house', 'location', 28),
('spongebob-world-imagen4-animation', 'Patrick rock', 'location', 29),
('spongebob-world-imagen4-animation', 'Squidward house', 'location', 30),
('spongebob-world-imagen4-animation', 'Sandy tree dome', 'location', 31),
('spongebob-world-imagen4-animation', 'Boating School', 'location', 32),
('spongebob-world-imagen4-animation', 'Weenie Hut Jr', 'location', 33),
('spongebob-world-imagen4-animation', 'Salty Spitoon', 'location', 34),
('spongebob-world-imagen4-animation', 'Fancy restaurant', 'location', 35),

-- Actions/Activities (36-50)
('spongebob-world-imagen4-animation', 'jellyfishing', 'action', 36),
('spongebob-world-imagen4-animation', 'making Krabby Patty', 'action', 37),
('spongebob-world-imagen4-animation', 'blowing bubbles', 'action', 38),
('spongebob-world-imagen4-animation', 'driving boat', 'action', 39),
('spongebob-world-imagen4-animation', 'karate', 'action', 40),
('spongebob-world-imagen4-animation', 'working at Krusty Krab', 'action', 41),
('spongebob-world-imagen4-animation', 'playing clarinet', 'action', 42),
('spongebob-world-imagen4-animation', 'lifting weights', 'action', 43),
('spongebob-world-imagen4-animation', 'surfing', 'action', 44),
('spongebob-world-imagen4-animation', 'singing', 'action', 45),
('spongebob-world-imagen4-animation', 'dancing', 'action', 46),
('spongebob-world-imagen4-animation', 'cooking', 'action', 47),
('spongebob-world-imagen4-animation', 'reading', 'action', 48),
('spongebob-world-imagen4-animation', 'sleeping', 'action', 49),
('spongebob-world-imagen4-animation', 'laughing', 'action', 50);

-- Add Pokemon theme for demo
INSERT OR IGNORE INTO themes (
  theme_id,
  theme,
  model,
  style,
  master_prompt
) VALUES (
  'pokemon-world-imagen4-animation',
  'Pokemon World',
  'IMAGEN_4',
  'Animation',
  '[subject] [action] in Pokemon world, anime style, vibrant colors'
);

-- Add some Pokemon elements
INSERT OR IGNORE INTO testing_elements (theme_id, element, element_type, test_order) VALUES
('pokemon-world-imagen4-animation', 'Pikachu', 'character', 1),
('pokemon-world-imagen4-animation', 'Charizard', 'character', 2),
('pokemon-world-imagen4-animation', 'Bulbasaur', 'character', 3),
('pokemon-world-imagen4-animation', 'Squirtle', 'character', 4),
('pokemon-world-imagen4-animation', 'Eevee', 'character', 5),
('pokemon-world-imagen4-animation', 'Mewtwo', 'character', 6),
('pokemon-world-imagen4-animation', 'Gengar', 'character', 7),
('pokemon-world-imagen4-animation', 'Dragonite', 'character', 8),
('pokemon-world-imagen4-animation', 'Snorlax', 'character', 9),
('pokemon-world-imagen4-animation', 'Lucario', 'character', 10),
('pokemon-world-imagen4-animation', 'Pokemon Center', 'location', 11),
('pokemon-world-imagen4-animation', 'Pallet Town', 'location', 12),
('pokemon-world-imagen4-animation', 'Viridian Forest', 'location', 13),
('pokemon-world-imagen4-animation', 'Pokemon Gym', 'location', 14),
('pokemon-world-imagen4-animation', 'Pokemon Stadium', 'location', 15),
('pokemon-world-imagen4-animation', 'using thunderbolt', 'action', 16),
('pokemon-world-imagen4-animation', 'catching Pokemon', 'action', 17),
('pokemon-world-imagen4-animation', 'battling', 'action', 18),
('pokemon-world-imagen4-animation', 'evolving', 'action', 19),
('pokemon-world-imagen4-animation', 'training', 'action', 20);

-- Sample bulk theme profiles for local development (used by Bulk Deploy UI)
INSERT OR IGNORE INTO bulk_theme_profiles (
  category,
  theme,
  tier,
  tags,
  model,
  master_prompt
) VALUES
('Architecture', 'Brutalist Museum', 'A-TIER', '["concrete","monolithic","museum"]', 'IMAGEN_4',
 '[subject] inside a brutalist museum, high contrast light, architectural photography'),
('Nature', 'Alpine Sunrise', 'S-TIER', '["mountains","golden hour","mist"]', 'IMAGEN_4',
 '[subject] in alpine mountains at sunrise, cinematic lighting, ultra wide'),
('Food', 'Artisan Bakery', 'B-TIER', '["bread","flour","warm"]', 'SEED_DREAM',
 '[subject] in an artisan bakery, warm ambient light, shallow depth of field'),
('Fashion', 'Streetwear Editorial', 'A-TIER', '["urban","editorial","neon"]', 'IMAGEN_4',
 '[subject] streetwear editorial, neon accents, modern city backdrop'),
('Technology', 'Clean Robotics Lab', 'A-TIER', '["lab","robots","clean"]', 'SEED_DREAM',
 '[subject] in a clean robotics lab, soft light, minimal design'),
('Travel', 'Coastal Cliff Walk', 'B-TIER', '["coast","cliffs","windy"]', 'IMAGEN_4',
 '[subject] on a coastal cliff walk, dramatic sky, natural light');
