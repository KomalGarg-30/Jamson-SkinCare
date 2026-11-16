DO $$
DECLARE
  skin_care_id uuid;
BEGIN
  SELECT id INTO skin_care_id
  FROM categories
  WHERE slug = 'skin-care'
  LIMIT 1;

  IF skin_care_id IS NULL THEN
    INSERT INTO categories (name, slug, description, image_url)
    VALUES ('Skin Care', 'skin-care', 'Thoughtful daily essentials for healthy, glowing skin.', '/images/skin-care.svg')
    ON CONFLICT (slug) DO NOTHING
    RETURNING id INTO skin_care_id;

    IF skin_care_id IS NULL THEN
      SELECT id INTO skin_care_id
      FROM categories
      WHERE slug = 'skin-care'
      LIMIT 1;
    END IF;
  END IF;

  UPDATE products
  SET category_id = skin_care_id
  WHERE category_id IN (
    SELECT id
    FROM categories
    WHERE slug = 'skin' OR lower(trim(name)) = 'skin'
  );

  DELETE FROM categories
  WHERE slug = 'skin' OR lower(trim(name)) = 'skin';
END $$;
