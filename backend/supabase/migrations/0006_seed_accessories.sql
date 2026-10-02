-- The shop catalogue.
--
-- Priced against the CO2-avoided formula, not the proposal's: docs/changes.md
-- 2.3 records that points per ride moved from roughly 200 to between 500 and
-- 2,500, and warns that a catalogue priced against the old scale is affordable
-- after two rides.
--
-- The arithmetic these prices assume, from changes.md 1.5: a Toyota Corolla
-- over 18 km with 2 passengers avoids 7.26 kg, which is 726 points - for the
-- driver and for each passenger. So:
--
--   400   half a ride          an impulse buy on the first completed trip
--   750   one ride
--   1,500 two rides
--   3,000 four rides
--   6,000 eight rides          the legendary tier, worth working toward
--
-- Stage gating does the rest of the pacing: 15 kg of avoided CO2 to hatch at
-- all, 800 kg to reach legendary, so the top items cannot be bought early
-- however many points someone has banked.

INSERT INTO accessories (name, description, category, cost, required_stage, image_url) VALUES
    ('Leaf cap',        'A little green cap. Everyone starts somewhere.', 'headwear',   400,  'egg',       '/pet/leaf-cap.svg'),
    ('Scarf',           'Knitted, slightly too long.',                    'clothing',   400,  'egg',       '/pet/scarf.svg'),
    ('Round glasses',   'For reading timetables.',                        'eyewear',    750,  'hatched',   '/pet/round-glasses.svg'),
    ('Beanie',          'Melbourne winter issue.',                        'headwear',   750,  'hatched',   '/pet/beanie.svg'),
    ('Umbrella',        'Also Melbourne winter issue.',                   'held_item',  1000, 'hatched',   '/pet/umbrella.svg'),
    ('Campus green',    'A patch of lawn to stand on.',                   'background', 1500, 'juvenile',  '/pet/campus-green.svg'),
    ('Hi-vis vest',     'Seen and not heard.',                            'clothing',   1500, 'juvenile',  '/pet/hi-vis.svg'),
    ('Sunglasses',      'For the drive east at 8am.',                     'eyewear',    1500, 'juvenile',  '/pet/sunglasses.svg'),
    ('Coffee cup',      'Reusable, obviously.',                           'held_item',  2000, 'juvenile',  '/pet/coffee.svg'),
    ('Graduation cap',  'Earned, one carpool at a time.',                 'headwear',   3000, 'adult',     '/pet/grad-cap.svg'),
    ('City skyline',    'Dusk over the Yarra.',                           'background', 3000, 'adult',     '/pet/skyline.svg'),
    ('Solar halo',      'Powered the same way the trams are.',            'headwear',   6000, 'legendary', '/pet/solar-halo.svg');
