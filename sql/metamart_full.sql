-- ============================================================
--  METAMART - complete database
--  Import this file into an EMPTY database (e.g. metama_db).
--
--  phpMyAdmin:  select the database -> Import -> choose this file -> Go
--  CLI:         mysql -u USER -p DBNAME < metamart_full.sql
--
--  WARNING: the schema section drops these tables if they already exist.
--
--  After importing, sign in to /admin with:
--      admin@metamart.local  /  ChangeMe!2026
--  and change that password immediately under Settings.
-- ============================================================

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
SET time_zone = "+00:00";
START TRANSACTION;

-- ============================================================
--  METAMART - virtual commerce platform
--  Schema for MySQL 8.0+   (charset utf8mb4)
-- ============================================================
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS audit_log, ai_jobs, settings,
  highlight_items, highlights, discounts,
  product_tags, tags, product_variants, product_images, product_search,
  products, categories, spaces, architectures, admin_users;

SET FOREIGN_KEY_CHECKS = 1;

-- ------------------------------------------------------------
-- Architectures - the 3D room blueprints. Capacity limits live
-- here, so a space can never hold more than its room can show.
-- ------------------------------------------------------------
CREATE TABLE architectures (
  id                        INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code                      VARCHAR(40)  NOT NULL UNIQUE,
  name                      VARCHAR(120) NOT NULL,
  description               VARCHAR(500) NULL,
  max_categories            TINYINT UNSIGNED NOT NULL DEFAULT 8,
  max_products_per_category TINYINT UNSIGNED NOT NULL DEFAULT 5,
  has_highlight_island      TINYINT(1)   NOT NULL DEFAULT 1,
  highlight_capacity        TINYINT UNSIGNED NOT NULL DEFAULT 4,
  layout_json               JSON         NULL,
  created_at                TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- Spaces - one per store/tenant. Each renders independently:
-- the client only ever loads the space it is standing in.
-- ------------------------------------------------------------
CREATE TABLE spaces (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  slug            VARCHAR(60)  NOT NULL UNIQUE,
  name            VARCHAR(120) NOT NULL,
  tagline         VARCHAR(200) NULL,
  description     TEXT         NULL,
  architecture_id INT UNSIGNED NOT NULL,
  accent_color    CHAR(7)      NOT NULL DEFAULT '#00e5ff',
  bay_index       TINYINT      NULL COMMENT 'plaza bay 0..8, NULL = gate/anchor store',
  status          ENUM('live','coming_soon','hidden') NOT NULL DEFAULT 'coming_soon',
  sort_order      SMALLINT     NOT NULL DEFAULT 0,
  created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_space_arch FOREIGN KEY (architecture_id) REFERENCES architectures(id),
  UNIQUE KEY uq_space_bay (bay_index),
  KEY idx_space_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- Categories - the wall zones inside a space. slot_index maps to
-- a physical wall position in the architecture layout.
-- ------------------------------------------------------------
CREATE TABLE categories (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  space_id     INT UNSIGNED NOT NULL,
  slug         VARCHAR(60)  NOT NULL,
  name         VARCHAR(120) NOT NULL,
  accent_color CHAR(7)      NOT NULL DEFAULT '#00e5ff',
  slot_index   TINYINT UNSIGNED NOT NULL COMMENT 'physical zone slot in the room',
  sort_order   SMALLINT     NOT NULL DEFAULT 0,
  is_active    TINYINT(1)   NOT NULL DEFAULT 1,
  created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_cat_space FOREIGN KEY (space_id) REFERENCES spaces(id) ON DELETE CASCADE,
  UNIQUE KEY uq_cat_slug (space_id, slug),
  UNIQUE KEY uq_cat_slot (space_id, slot_index)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- Products. Money is stored in integer cents - never floats.
-- ------------------------------------------------------------
CREATE TABLE products (
  id                     INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  space_id               INT UNSIGNED NOT NULL,
  category_id            INT UNSIGNED NOT NULL,
  sku                    VARCHAR(64)  NOT NULL UNIQUE,
  slug                   VARCHAR(120) NOT NULL,
  name                   VARCHAR(200) NOT NULL,
  brand                  VARCHAR(120) NULL,
  short_description      VARCHAR(320) NULL,
  description            TEXT         NULL,
  price_cents            INT UNSIGNED NOT NULL DEFAULT 0,
  compare_at_price_cents INT UNSIGNED NULL COMMENT 'original price when discounted',
  currency               CHAR(3)      NOT NULL DEFAULT 'USD',
  slot_index             TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'pedestal slot in its zone',
  status                 ENUM('active','draft','archived') NOT NULL DEFAULT 'active',
  badge                  VARCHAR(32)  NULL COMMENT 'NEW / ICON / TRENDING / HEAT',
  colorway               VARCHAR(120) NULL,
  material               VARCHAR(120) NULL,
  rating                 DECIMAL(3,2) NULL,
  review_count           INT UNSIGNED NOT NULL DEFAULT 0,
  stock                  INT          NOT NULL DEFAULT 0,
  attributes_json        JSON         NULL,
  ai_fields_json         JSON         NULL COMMENT 'which fields were AI-filled + confidence',
  created_by             INT UNSIGNED NULL,
  created_at             TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at             TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_prod_space FOREIGN KEY (space_id)    REFERENCES spaces(id)     ON DELETE CASCADE,
  CONSTRAINT fk_prod_cat   FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE,
  UNIQUE KEY uq_prod_slug (space_id, slug),
  KEY idx_prod_cat (category_id, status),
  KEY idx_prod_space (space_id, status),
  KEY idx_prod_brand (brand),
  FULLTEXT KEY ft_prod (name, brand, short_description, description, colorway)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- Images - files live in the repo (public/products/...), the DB
-- stores the path only.
-- ------------------------------------------------------------
CREATE TABLE product_images (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  product_id INT UNSIGNED NOT NULL,
  file_path  VARCHAR(300) NOT NULL COMMENT 'repo-relative, e.g. products/nike-dunk-panda.jpg',
  alt_text   VARCHAR(240) NULL,
  sort_order SMALLINT     NOT NULL DEFAULT 0,
  is_primary TINYINT(1)   NOT NULL DEFAULT 0,
  width      SMALLINT UNSIGNED NULL,
  height     SMALLINT UNSIGNED NULL,
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_img_prod FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  KEY idx_img_prod (product_id, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- Variants - sizes. size_system keeps EU/US/alpha apart.
-- ------------------------------------------------------------
CREATE TABLE product_variants (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  product_id        INT UNSIGNED NOT NULL,
  size_label        VARCHAR(24)  NOT NULL,
  size_system       ENUM('EU','US','UK','ALPHA','ONE_SIZE') NOT NULL DEFAULT 'EU',
  sku               VARCHAR(64)  NULL,
  stock             INT          NOT NULL DEFAULT 0,
  price_delta_cents INT          NOT NULL DEFAULT 0,
  sort_order        SMALLINT     NOT NULL DEFAULT 0,
  is_active         TINYINT(1)   NOT NULL DEFAULT 1,
  CONSTRAINT fk_var_prod FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  UNIQUE KEY uq_var (product_id, size_system, size_label)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- Tags - drives faceted + semantic search.
-- ------------------------------------------------------------
CREATE TABLE tags (
  id   INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  slug VARCHAR(60)  NOT NULL UNIQUE,
  name VARCHAR(80)  NOT NULL,
  kind ENUM('style','color','use','material','audience','other') NOT NULL DEFAULT 'other'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE product_tags (
  product_id INT UNSIGNED NOT NULL,
  tag_id     INT UNSIGNED NOT NULL,
  source     ENUM('human','ai') NOT NULL DEFAULT 'human',
  PRIMARY KEY (product_id, tag_id),
  CONSTRAINT fk_pt_prod FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  CONSTRAINT fk_pt_tag  FOREIGN KEY (tag_id)     REFERENCES tags(id)     ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- Search index - denormalised text + embedding for the search
-- and image-search agents.
-- ------------------------------------------------------------
CREATE TABLE product_search (
  product_id     INT UNSIGNED NOT NULL PRIMARY KEY,
  content        MEDIUMTEXT   NOT NULL,
  embedding_json JSON         NULL,
  image_vec_json JSON         NULL,
  updated_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_ps_prod FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  FULLTEXT KEY ft_search (content)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- Highlights - the centre island. Title is free text so an admin
-- can call it Sale, Popular, New Arrivals, or anything else.
-- ------------------------------------------------------------
CREATE TABLE highlights (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  space_id     INT UNSIGNED NOT NULL,
  code         VARCHAR(40)  NOT NULL COMMENT 'sale | popular | new_arrival | custom-*',
  title        VARCHAR(80)  NOT NULL COMMENT 'text shown on the island sign',
  subtitle     VARCHAR(160) NULL,
  accent_color CHAR(7)      NOT NULL DEFAULT '#ff2d55',
  is_active    TINYINT(1)   NOT NULL DEFAULT 0 COMMENT 'only one active per space',
  sort_order   SMALLINT     NOT NULL DEFAULT 0,
  created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_hl_space FOREIGN KEY (space_id) REFERENCES spaces(id) ON DELETE CASCADE,
  UNIQUE KEY uq_hl_code (space_id, code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE highlight_items (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  highlight_id INT UNSIGNED NOT NULL,
  product_id   INT UNSIGNED NOT NULL,
  sort_order   SMALLINT     NOT NULL DEFAULT 0,
  CONSTRAINT fk_hi_hl   FOREIGN KEY (highlight_id) REFERENCES highlights(id) ON DELETE CASCADE,
  CONSTRAINT fk_hi_prod FOREIGN KEY (product_id)   REFERENCES products(id)   ON DELETE CASCADE,
  UNIQUE KEY uq_hi (highlight_id, product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- Discounts - can target one product, a category, a space, or all.
-- ------------------------------------------------------------
CREATE TABLE discounts (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code       VARCHAR(40)  NULL UNIQUE,
  name       VARCHAR(120) NOT NULL,
  kind       ENUM('percent','fixed') NOT NULL DEFAULT 'percent',
  value      INT UNSIGNED NOT NULL COMMENT 'percent 0-100, or cents off',
  scope      ENUM('product','category','space','global') NOT NULL DEFAULT 'product',
  target_id  INT UNSIGNED NULL COMMENT 'id of product/category/space per scope',
  starts_at  DATETIME     NULL,
  ends_at    DATETIME     NULL,
  is_active  TINYINT(1)   NOT NULL DEFAULT 1,
  priority   SMALLINT     NOT NULL DEFAULT 0,
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_disc_scope (scope, target_id, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- Admin users
-- ------------------------------------------------------------
CREATE TABLE admin_users (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email         VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  name          VARCHAR(120) NOT NULL,
  role          ENUM('owner','admin','editor') NOT NULL DEFAULT 'admin',
  is_active     TINYINT(1)   NOT NULL DEFAULT 1,
  last_login_at DATETIME     NULL,
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- AI job log - every agent call, for cost, latency and guardrail
-- audit. This is what makes the agent layer debuggable.
-- ------------------------------------------------------------
CREATE TABLE ai_jobs (
  id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  request_id      CHAR(36)     NOT NULL,
  agent           VARCHAR(40)  NOT NULL,
  intent          VARCHAR(60)  NULL,
  provider        VARCHAR(24)  NULL,
  model           VARCHAR(80)  NULL,
  status          ENUM('ok','blocked','error','fallback') NOT NULL,
  input_summary   VARCHAR(600) NULL,
  output_summary  MEDIUMTEXT   NULL,
  tokens_in       INT UNSIGNED NOT NULL DEFAULT 0,
  tokens_out      INT UNSIGNED NOT NULL DEFAULT 0,
  cost_usd        DECIMAL(10,6) NOT NULL DEFAULT 0,
  latency_ms      INT UNSIGNED NOT NULL DEFAULT 0,
  guardrail_flags JSON         NULL,
  error           VARCHAR(500) NULL,
  actor_type      ENUM('admin','shopper','system') NOT NULL DEFAULT 'system',
  actor_id        VARCHAR(64)  NULL,
  created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_ai_agent (agent, created_at),
  KEY idx_ai_req (request_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- Audit log - who changed what.
-- ------------------------------------------------------------
CREATE TABLE audit_log (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  actor_id    INT UNSIGNED NULL,
  actor_email VARCHAR(190) NULL,
  action      VARCHAR(40)  NOT NULL,
  entity      VARCHAR(40)  NOT NULL,
  entity_id   INT UNSIGNED NULL,
  before_json JSON         NULL,
  after_json  JSON         NULL,
  ip          VARCHAR(45)  NULL,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_audit_entity (entity, entity_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- Settings
-- ------------------------------------------------------------
CREATE TABLE settings (
  k          VARCHAR(80) PRIMARY KEY,
  v_json     JSON        NOT NULL,
  updated_at TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================
--  METAMART - seed data
--  Generated by scripts/gen-seed.mjs - do not edit by hand.
-- ============================================================
SET NAMES utf8mb4;

-- ---------- architectures ----------
INSERT INTO architectures (code, name, description, max_categories, max_products_per_category, has_highlight_island, highlight_capacity, layout_json) VALUES
  ('l_hall', 'L-Hall Flagship', 'Anchor store: main hall plus a wing, brand walls on three sides and a highlight island in the centre.', 8, 5, 1, 4, '{"regions":["hall","wing"],"categorySlots":[{"slot":0,"wall":"west","label":"Main hall west"},{"slot":1,"wall":"north","label":"Main hall north"},{"slot":2,"wall":"east","label":"Main hall east"},{"slot":3,"wall":"wing_west","label":"Wing west"},{"slot":4,"wall":"wing_east","label":"Wing east"},{"slot":5,"wall":"wing_south","label":"Wing south"},{"slot":6,"wall":"hall_south_a","label":"Hall south A"},{"slot":7,"wall":"hall_south_b","label":"Hall south B"}]}');
INSERT INTO architectures (code, name, description, max_categories, max_products_per_category, has_highlight_island, highlight_capacity, layout_json) VALUES
  ('boutique', 'Boutique Room', 'Single square room, four display walls and a small centre plinth. For smaller tenants.', 4, 5, 1, 3, '{"regions":["room"],"categorySlots":[{"slot":0,"wall":"west","label":"West wall"},{"slot":1,"wall":"north","label":"North wall"},{"slot":2,"wall":"east","label":"East wall"},{"slot":3,"wall":"south","label":"South wall"}]}');
INSERT INTO architectures (code, name, description, max_categories, max_products_per_category, has_highlight_island, highlight_capacity, layout_json) VALUES
  ('gallery', 'Gallery Loft', 'Long daylight gallery with six bays down two colonnades and an end-wall feature.', 7, 5, 0, 0, '{"regions":["gallery"],"categorySlots":[{"slot":0,"wall":"bay_w1","label":"West bay 1"},{"slot":1,"wall":"bay_w2","label":"West bay 2"},{"slot":2,"wall":"bay_w3","label":"West bay 3"},{"slot":3,"wall":"bay_e1","label":"East bay 1"},{"slot":4,"wall":"bay_e2","label":"East bay 2"},{"slot":5,"wall":"bay_e3","label":"East bay 3"},{"slot":6,"wall":"end","label":"End wall feature"}]}');

-- ---------- spaces ----------
INSERT INTO spaces (slug, name, tagline, description, architecture_id, accent_color, bay_index, status, sort_order) VALUES
  ('solespace', 'SoleSpace', 'Sneakers, curated.', 'The anchor store of METAMART: six brand walls across a daylight hall and wing, plus a rotating highlight island.', (SELECT id FROM architectures WHERE code='l_hall'), '#00e5ff', NULL, 'live', 0),
  ('menswear', 'Men''s Wear', 'Opening soon on METAMART.', NULL, (SELECT id FROM architectures WHERE code='gallery'), '#4cc9f0', 0, 'coming_soon', 1),
  ('womenswear', 'Women''s Wear', 'Opening soon on METAMART.', NULL, (SELECT id FROM architectures WHERE code='gallery'), '#ff7ab6', 1, 'coming_soon', 2),
  ('gadgets', 'Gadgets', 'Opening soon on METAMART.', NULL, (SELECT id FROM architectures WHERE code='boutique'), '#9b5de5', 2, 'coming_soon', 3),
  ('bags', 'Bags & Luggage', 'Opening soon on METAMART.', NULL, (SELECT id FROM architectures WHERE code='boutique'), '#c98b5e', 3, 'coming_soon', 4),
  ('sports', 'Sports & Jerseys', 'Opening soon on METAMART.', NULL, (SELECT id FROM architectures WHERE code='gallery'), '#3ddc84', 4, 'coming_soon', 5),
  ('watches', 'Watches', 'Opening soon on METAMART.', NULL, (SELECT id FROM architectures WHERE code='boutique'), '#ffd166', 5, 'coming_soon', 6),
  ('beauty', 'Beauty', 'Opening soon on METAMART.', NULL, (SELECT id FROM architectures WHERE code='boutique'), '#ff6a8a', 6, 'coming_soon', 7),
  ('kids', 'Kids & Toys', 'Opening soon on METAMART.', NULL, (SELECT id FROM architectures WHERE code='gallery'), '#ffa94d', 7, 'coming_soon', 8),
  ('home', 'Home & Living', 'Opening soon on METAMART.', NULL, (SELECT id FROM architectures WHERE code='boutique'), '#2ec4b6', 8, 'coming_soon', 9);

-- ---------- categories (SoleSpace) ----------
INSERT INTO categories (space_id, slug, name, accent_color, slot_index, sort_order) VALUES
  ((SELECT id FROM spaces WHERE slug='solespace'), 'nike', 'Nike', '#ff6a2b', 0, 0),
  ((SELECT id FROM spaces WHERE slug='solespace'), 'jordan', 'Jordan', '#e63946', 1, 1),
  ((SELECT id FROM spaces WHERE slug='solespace'), 'adidas', 'adidas', '#4895ef', 2, 2),
  ((SELECT id FROM spaces WHERE slug='solespace'), 'newbalance', 'New Balance', '#2ec4b6', 3, 3),
  ((SELECT id FROM spaces WHERE slug='solespace'), 'asics', 'ASICS', '#9b5de5', 4, 4),
  ((SELECT id FROM spaces WHERE slug='solespace'), 'converse', 'Converse', '#ffd166', 5, 5);

-- ---------- products ----------
INSERT INTO products (space_id, category_id, sku, slug, name, brand, short_description, description, price_cents, currency, slot_index, status, badge, stock, attributes_json) VALUES
  ((SELECT id FROM spaces WHERE slug='solespace'), (SELECT id FROM categories WHERE slug='nike' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), 'SS-NIK-01-DUNKPANDA', 'dunk-panda', 'Dunk Low "Panda"', 'Nike', 'The black-and-white staple that refuses to stay in stock. Goes with everything you own.', 'The black-and-white staple that refuses to stay in stock. Goes with everything you own.', 11500, 'USD', 0, 'active', NULL, 20, '{"source":"seed","original_id":"dunk-panda"}'),
  ((SELECT id FROM spaces WHERE slug='solespace'), (SELECT id FROM categories WHERE slug='nike' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), 'SS-NIK-02-AF1WHITE', 'af1-white', 'Air Force 1 ''07', 'Nike', 'Triple white. The most worn sneaker on planet Earth, and still undefeated.', 'Triple white. The most worn sneaker on planet Earth, and still undefeated.', 11000, 'USD', 1, 'active', NULL, 27, '{"source":"seed","original_id":"af1-white"}'),
  ((SELECT id FROM spaces WHERE slug='solespace'), (SELECT id FROM categories WHERE slug='nike' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), 'SS-NIK-03-DUNKGREYFO', 'dunk-grey-fog', 'Dunk Low "Grey Fog"', 'Nike', 'Soft grey overlays on crisp white leather. The Panda''s calmer sibling.', 'Soft grey overlays on crisp white leather. The Panda''s calmer sibling.', 11000, 'USD', 2, 'active', NULL, 34, '{"source":"seed","original_id":"dunk-grey-fog"}'),
  ((SELECT id FROM spaces WHERE slug='solespace'), (SELECT id FROM categories WHERE slug='nike' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), 'SS-NIK-04-KOBE6GRINC', 'kobe-6-grinch', 'Kobe 6 "Reverse Grinch"', 'Nike', 'Christmas-day energy all year. Sharp, fast, and impossible to miss on court.', 'Christmas-day energy all year. Sharp, fast, and impossible to miss on court.', 19000, 'USD', 3, 'active', 'HEAT', 41, '{"source":"seed","original_id":"kobe-6-grinch"}'),
  ((SELECT id FROM spaces WHERE slug='solespace'), (SELECT id FROM categories WHERE slug='jordan' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), 'SS-JOR-01-AJ3WHITECE', 'aj3-white-cement', 'Air Jordan 3 "White Cement"', 'Jordan', 'Elephant print, visible Air, and history in every step. The ''88 icon reimagined.', 'Elephant print, visible Air, and history in every step. The ''88 icon reimagined.', 20000, 'USD', 0, 'active', NULL, 20, '{"source":"seed","original_id":"aj3-white-cement"}'),
  ((SELECT id FROM spaces WHERE slug='solespace'), (SELECT id FROM categories WHERE slug='jordan' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), 'SS-JOR-02-AJ4MILITAR', 'aj4-military', 'Air Jordan 4 "Military Black"', 'Jordan', 'Clean white base, black hits, endless outfit rotation. A modern-day essential.', 'Clean white base, black hits, endless outfit rotation. A modern-day essential.', 21500, 'USD', 1, 'active', 'ICON', 27, '{"source":"seed","original_id":"aj4-military"}'),
  ((SELECT id FROM spaces WHERE slug='solespace'), (SELECT id FROM categories WHERE slug='jordan' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), 'SS-JOR-03-AJ11COOLGR', 'aj11-cool-grey', 'Air Jordan 11 "Cool Grey"', 'Jordan', 'Patent leather shine in signature Cool Grey. Dress code approved, court certified.', 'Patent leather shine in signature Cool Grey. Dress code approved, court certified.', 22500, 'USD', 2, 'active', NULL, 34, '{"source":"seed","original_id":"aj11-cool-grey"}'),
  ((SELECT id FROM spaces WHERE slug='solespace'), (SELECT id FROM categories WHERE slug='adidas' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), 'SS-ADI-01-SAMBAOG', 'samba-og', 'Samba OG', 'adidas', 'Terrace classic turned global fashion staple. White leather, gum sole, done.', 'Terrace classic turned global fashion staple. White leather, gum sole, done.', 10000, 'USD', 0, 'active', 'TRENDING', 20, '{"source":"seed","original_id":"samba-og"}'),
  ((SELECT id FROM spaces WHERE slug='solespace'), (SELECT id FROM categories WHERE slug='adidas' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), 'SS-ADI-02-CAMPUS00S', 'campus-00s', 'Campus 00s', 'adidas', 'Chunky Y2K proportions with premium suede. The skate-shop look, revived.', 'Chunky Y2K proportions with premium suede. The skate-shop look, revived.', 11000, 'USD', 1, 'active', NULL, 27, '{"source":"seed","original_id":"campus-00s"}'),
  ((SELECT id FROM spaces WHERE slug='solespace'), (SELECT id FROM categories WHERE slug='adidas' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), 'SS-ADI-03-SUPERSTAR', 'superstar', 'Superstar', 'adidas', 'Shell toe. Three stripes. Fifty years of street cred in one silhouette.', 'Shell toe. Three stripes. Fifty years of street cred in one silhouette.', 9500, 'USD', 2, 'active', NULL, 34, '{"source":"seed","original_id":"superstar"}'),
  ((SELECT id FROM spaces WHERE slug='solespace'), (SELECT id FROM categories WHERE slug='adidas' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), 'SS-ADI-04-YEEZY350ZE', 'yeezy-350-zebra', 'Yeezy Boost 350 V2 "Zebra"', 'adidas', 'The unmistakable stripe pattern on Primeknit, riding full-length Boost.', 'The unmistakable stripe pattern on Primeknit, riding full-length Boost.', 23000, 'USD', 3, 'active', NULL, 41, '{"source":"seed","original_id":"yeezy-350-zebra"}'),
  ((SELECT id FROM spaces WHERE slug='solespace'), (SELECT id FROM categories WHERE slug='newbalance' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), 'SS-NEW-01-NB550', 'nb-550', '550 "White Grey"', 'New Balance', 'The ''89 basketball shape that took over the streets. Perfectly aged proportions.', 'The ''89 basketball shape that took over the streets. Perfectly aged proportions.', 13000, 'USD', 0, 'active', NULL, 20, '{"source":"seed","original_id":"nb-550"}'),
  ((SELECT id FROM spaces WHERE slug='solespace'), (SELECT id FROM categories WHERE slug='newbalance' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), 'SS-NEW-02-NB2002RRAI', 'nb-2002r-rain', '2002R "Rain Cloud"', 'New Balance', 'Protection Pack construction with soft layered greys. Comfort with edge.', 'Protection Pack construction with soft layered greys. Comfort with edge.', 15000, 'USD', 1, 'active', 'NEW', 27, '{"source":"seed","original_id":"nb-2002r-rain"}'),
  ((SELECT id FROM spaces WHERE slug='solespace'), (SELECT id FROM categories WHERE slug='newbalance' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), 'SS-NEW-03-NB9060', 'nb-9060', '9060 "Sea Salt"', 'New Balance', 'Warped lines and creamy tones — a futurist remix of the classic 99X series.', 'Warped lines and creamy tones — a futurist remix of the classic 99X series.', 16000, 'USD', 2, 'active', NULL, 34, '{"source":"seed","original_id":"nb-9060"}'),
  ((SELECT id FROM spaces WHERE slug='solespace'), (SELECT id FROM categories WHERE slug='asics' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), 'SS-ASI-01-GELKAYANO1', 'gel-kayano-14', 'GEL-Kayano 14', 'ASICS', 'Y2K running tech turned runway favorite. White and pure silver mesh magic.', 'Y2K running tech turned runway favorite. White and pure silver mesh magic.', 15000, 'USD', 0, 'active', 'NEW', 20, '{"source":"seed","original_id":"gel-kayano-14"}'),
  ((SELECT id FROM spaces WHERE slug='solespace'), (SELECT id FROM categories WHERE slug='asics' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), 'SS-ASI-02-GEL1130', 'gel-1130', 'GEL-1130 "Clay Canyon"', 'ASICS', 'Retro runner DNA with modern comfort. The quiet flex of people who know.', 'Retro runner DNA with modern comfort. The quiet flex of people who know.', 12000, 'USD', 1, 'active', NULL, 27, '{"source":"seed","original_id":"gel-1130"}'),
  ((SELECT id FROM spaces WHERE slug='solespace'), (SELECT id FROM categories WHERE slug='asics' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), 'SS-ASI-03-GELNYCARCT', 'gel-nyc-arctic', 'GEL-NYC "Arctic Sky"', 'ASICS', 'Layered cream and icy blue inspired by early-2000s city marathons.', 'Layered cream and icy blue inspired by early-2000s city marathons.', 13000, 'USD', 2, 'active', NULL, 34, '{"source":"seed","original_id":"gel-nyc-arctic"}'),
  ((SELECT id FROM spaces WHERE slug='solespace'), (SELECT id FROM categories WHERE slug='asics' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), 'SS-ASI-04-GELNYCGRAP', 'gel-nyc-graphite', 'GEL-NYC "Graphite"', 'ASICS', 'Tonal grey stack with reflective hits. Urban camouflage, elevated.', 'Tonal grey stack with reflective hits. Urban camouflage, elevated.', 13000, 'USD', 3, 'active', NULL, 41, '{"source":"seed","original_id":"gel-nyc-graphite"}'),
  ((SELECT id FROM spaces WHERE slug='solespace'), (SELECT id FROM categories WHERE slug='converse' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), 'SS-CON-01-CHUCKHI', 'chuck-hi', 'Chuck Taylor All Star Hi', 'Converse', 'The canvas high-top that started it all. Every generation makes it theirs.', 'The canvas high-top that started it all. Every generation makes it theirs.', 6500, 'USD', 0, 'active', NULL, 20, '{"source":"seed","original_id":"chuck-hi"}'),
  ((SELECT id FROM spaces WHERE slug='solespace'), (SELECT id FROM categories WHERE slug='converse' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), 'SS-CON-02-CHUCK70OX', 'chuck-70-ox', 'Chuck 70 Ox "Parchment"', 'Converse', 'Vintage-spec construction, warmer canvas, higher foxing. The connoisseur''s Chuck.', 'Vintage-spec construction, warmer canvas, higher foxing. The connoisseur''s Chuck.', 8500, 'USD', 1, 'active', NULL, 27, '{"source":"seed","original_id":"chuck-70-ox"}'),
  ((SELECT id FROM spaces WHERE slug='solespace'), (SELECT id FROM categories WHERE slug='converse' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), 'SS-CON-03-RUNSTARHIK', 'run-star-hike', 'Run Star Hike', 'Converse', 'The Chuck on a platform lugged sole. Height, attitude, and grip included.', 'The Chuck on a platform lugged sole. Height, attitude, and grip included.', 11000, 'USD', 2, 'active', NULL, 34, '{"source":"seed","original_id":"run-star-hike"}'),
  ((SELECT id FROM spaces WHERE slug='solespace'), (SELECT id FROM categories WHERE slug='adidas' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), 'SS-ADI-05-YEEZYFOAMR', 'yeezy-foam-rnnr', 'Yeezy Foam Runner "Onyx"', 'adidas', 'Sculptural one-piece foam. Feels like walking on the moon, priced like Earth.', 'Sculptural one-piece foam. Feels like walking on the moon, priced like Earth.', 9000, 'USD', 4, 'active', 'SALE', 48, '{"source":"seed","original_id":"yeezy-foam-rnnr"}'),
  ((SELECT id FROM spaces WHERE slug='solespace'), (SELECT id FROM categories WHERE slug='newbalance' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), 'SS-NEW-04-NB530', 'nb-530', 'New Balance 530', 'New Balance', 'Silvery retro runner with everyday comfort. Last sizes going fast.', 'Silvery retro runner with everyday comfort. Last sizes going fast.', 10000, 'USD', 3, 'active', 'SALE', 41, '{"source":"seed","original_id":"nb-530"}'),
  ((SELECT id FROM spaces WHERE slug='solespace'), (SELECT id FROM categories WHERE slug='asics' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), 'SS-ASI-05-GEL1130BLA', 'gel-1130-black', 'ASICS GEL-1130 "Black"', 'ASICS', 'The stealth colorway of the fan favorite. Discounted, not discontinued.', 'The stealth colorway of the fan favorite. Discounted, not discontinued.', 12000, 'USD', 4, 'active', 'SALE', 48, '{"source":"seed","original_id":"gel-1130-black"}'),
  ((SELECT id FROM spaces WHERE slug='solespace'), (SELECT id FROM categories WHERE slug='newbalance' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), 'SS-NEW-05-NB1906R', 'nb-1906r', 'New Balance 1906R', 'New Balance', 'Tech-runner shine in Sea Salt metallics. Premium comfort, clearance price.', 'Tech-runner shine in Sea Salt metallics. Premium comfort, clearance price.', 15500, 'USD', 4, 'active', 'SALE', 48, '{"source":"seed","original_id":"nb-1906r"}');

-- ---------- product images ----------
INSERT INTO product_images (product_id, file_path, alt_text, sort_order, is_primary) VALUES
  ((SELECT id FROM products WHERE slug='dunk-panda' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), 'products/nike-dunk-panda.jpg', 'Dunk Low "Panda" product photo', 0, 1),
  ((SELECT id FROM products WHERE slug='af1-white' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), 'products/nike-af1-a.jpg', 'Air Force 1 ''07 product photo', 0, 1),
  ((SELECT id FROM products WHERE slug='dunk-grey-fog' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), 'products/nike-dunk-fog.jpg', 'Dunk Low "Grey Fog" product photo', 0, 1),
  ((SELECT id FROM products WHERE slug='kobe-6-grinch' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), 'products/nike-kobe6.jpg', 'Kobe 6 "Reverse Grinch" product photo', 0, 1),
  ((SELECT id FROM products WHERE slug='aj3-white-cement' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), 'products/aj3-cement.jpg', 'Air Jordan 3 "White Cement" product photo', 0, 1),
  ((SELECT id FROM products WHERE slug='aj4-military' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), 'products/aj4-military.jpg', 'Air Jordan 4 "Military Black" product photo', 0, 1),
  ((SELECT id FROM products WHERE slug='aj11-cool-grey' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), 'products/aj11-cool-grey.jpg', 'Air Jordan 11 "Cool Grey" product photo', 0, 1),
  ((SELECT id FROM products WHERE slug='samba-og' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), 'products/samba-og.jpg', 'Samba OG product photo', 0, 1),
  ((SELECT id FROM products WHERE slug='campus-00s' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), 'products/campus-00s.jpg', 'Campus 00s product photo', 0, 1),
  ((SELECT id FROM products WHERE slug='superstar' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), 'products/superstar.jpg', 'Superstar product photo', 0, 1),
  ((SELECT id FROM products WHERE slug='yeezy-350-zebra' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), 'products/yeezy-350-zebra.jpg', 'Yeezy Boost 350 V2 "Zebra" product photo', 0, 1),
  ((SELECT id FROM products WHERE slug='nb-550' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), 'products/nb-550.jpg', '550 "White Grey" product photo', 0, 1),
  ((SELECT id FROM products WHERE slug='nb-2002r-rain' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), 'products/nb-2002r-rain.jpg', '2002R "Rain Cloud" product photo', 0, 1),
  ((SELECT id FROM products WHERE slug='nb-9060' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), 'products/nb-9060-sea-salt.jpg', '9060 "Sea Salt" product photo', 0, 1),
  ((SELECT id FROM products WHERE slug='gel-kayano-14' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), 'products/asics-k14-silver.jpg', 'GEL-Kayano 14 product photo', 0, 1),
  ((SELECT id FROM products WHERE slug='gel-1130' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), 'products/asics-1130.jpg', 'GEL-1130 "Clay Canyon" product photo', 0, 1),
  ((SELECT id FROM products WHERE slug='gel-nyc-arctic' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), 'products/asics-nyc-arctic.jpg', 'GEL-NYC "Arctic Sky" product photo', 0, 1),
  ((SELECT id FROM products WHERE slug='gel-nyc-graphite' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), 'products/asics-nyc-graphite.jpg', 'GEL-NYC "Graphite" product photo', 0, 1),
  ((SELECT id FROM products WHERE slug='chuck-hi' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), 'products/chuck-classic-hi.jpg', 'Chuck Taylor All Star Hi product photo', 0, 1),
  ((SELECT id FROM products WHERE slug='chuck-70-ox' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), 'products/chuck-70-ox.jpg', 'Chuck 70 Ox "Parchment" product photo', 0, 1),
  ((SELECT id FROM products WHERE slug='run-star-hike' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), 'products/run-star-hike.jpg', 'Run Star Hike product photo', 0, 1),
  ((SELECT id FROM products WHERE slug='yeezy-foam-rnnr' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), 'products/yeezy-foam-rnnr.jpg', 'Yeezy Foam Runner "Onyx" product photo', 0, 1),
  ((SELECT id FROM products WHERE slug='nb-530' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), 'products/nb-530.jpg', 'New Balance 530 product photo', 0, 1),
  ((SELECT id FROM products WHERE slug='gel-1130-black' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), 'products/asics-1130-black.jpg', 'ASICS GEL-1130 "Black" product photo', 0, 1),
  ((SELECT id FROM products WHERE slug='nb-1906r' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), 'products/nb-1906r.jpg', 'New Balance 1906R product photo', 0, 1);

-- ---------- product variants (EU sizes) ----------
INSERT INTO product_variants (product_id, size_label, size_system, stock, sort_order) VALUES
  ((SELECT id FROM products WHERE slug='dunk-panda' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '40', 'EU', 7, 0),
  ((SELECT id FROM products WHERE slug='dunk-panda' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '41', 'EU', 9, 1),
  ((SELECT id FROM products WHERE slug='dunk-panda' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '42', 'EU', 11, 2),
  ((SELECT id FROM products WHERE slug='dunk-panda' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '43', 'EU', 4, 3),
  ((SELECT id FROM products WHERE slug='dunk-panda' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '44', 'EU', 6, 4),
  ((SELECT id FROM products WHERE slug='dunk-panda' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '45', 'EU', 8, 5),
  ((SELECT id FROM products WHERE slug='af1-white' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '40', 'EU', 7, 0),
  ((SELECT id FROM products WHERE slug='af1-white' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '41', 'EU', 9, 1),
  ((SELECT id FROM products WHERE slug='af1-white' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '42', 'EU', 11, 2),
  ((SELECT id FROM products WHERE slug='af1-white' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '43', 'EU', 4, 3),
  ((SELECT id FROM products WHERE slug='af1-white' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '44', 'EU', 6, 4),
  ((SELECT id FROM products WHERE slug='af1-white' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '45', 'EU', 8, 5),
  ((SELECT id FROM products WHERE slug='dunk-grey-fog' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '40', 'EU', 7, 0),
  ((SELECT id FROM products WHERE slug='dunk-grey-fog' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '41', 'EU', 9, 1),
  ((SELECT id FROM products WHERE slug='dunk-grey-fog' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '42', 'EU', 11, 2),
  ((SELECT id FROM products WHERE slug='dunk-grey-fog' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '43', 'EU', 4, 3),
  ((SELECT id FROM products WHERE slug='dunk-grey-fog' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '44', 'EU', 6, 4),
  ((SELECT id FROM products WHERE slug='dunk-grey-fog' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '45', 'EU', 8, 5),
  ((SELECT id FROM products WHERE slug='kobe-6-grinch' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '40', 'EU', 7, 0),
  ((SELECT id FROM products WHERE slug='kobe-6-grinch' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '41', 'EU', 9, 1),
  ((SELECT id FROM products WHERE slug='kobe-6-grinch' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '42', 'EU', 11, 2),
  ((SELECT id FROM products WHERE slug='kobe-6-grinch' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '43', 'EU', 4, 3),
  ((SELECT id FROM products WHERE slug='kobe-6-grinch' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '44', 'EU', 6, 4),
  ((SELECT id FROM products WHERE slug='kobe-6-grinch' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '45', 'EU', 8, 5),
  ((SELECT id FROM products WHERE slug='aj3-white-cement' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '40', 'EU', 7, 0),
  ((SELECT id FROM products WHERE slug='aj3-white-cement' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '41', 'EU', 9, 1),
  ((SELECT id FROM products WHERE slug='aj3-white-cement' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '42', 'EU', 11, 2),
  ((SELECT id FROM products WHERE slug='aj3-white-cement' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '43', 'EU', 4, 3),
  ((SELECT id FROM products WHERE slug='aj3-white-cement' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '44', 'EU', 6, 4),
  ((SELECT id FROM products WHERE slug='aj3-white-cement' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '45', 'EU', 8, 5),
  ((SELECT id FROM products WHERE slug='aj4-military' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '40', 'EU', 7, 0),
  ((SELECT id FROM products WHERE slug='aj4-military' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '41', 'EU', 9, 1),
  ((SELECT id FROM products WHERE slug='aj4-military' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '42', 'EU', 11, 2),
  ((SELECT id FROM products WHERE slug='aj4-military' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '43', 'EU', 4, 3),
  ((SELECT id FROM products WHERE slug='aj4-military' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '44', 'EU', 6, 4),
  ((SELECT id FROM products WHERE slug='aj4-military' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '45', 'EU', 8, 5),
  ((SELECT id FROM products WHERE slug='aj11-cool-grey' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '40', 'EU', 7, 0),
  ((SELECT id FROM products WHERE slug='aj11-cool-grey' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '41', 'EU', 9, 1),
  ((SELECT id FROM products WHERE slug='aj11-cool-grey' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '42', 'EU', 11, 2),
  ((SELECT id FROM products WHERE slug='aj11-cool-grey' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '43', 'EU', 4, 3),
  ((SELECT id FROM products WHERE slug='aj11-cool-grey' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '44', 'EU', 6, 4),
  ((SELECT id FROM products WHERE slug='aj11-cool-grey' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '45', 'EU', 8, 5),
  ((SELECT id FROM products WHERE slug='samba-og' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '40', 'EU', 7, 0),
  ((SELECT id FROM products WHERE slug='samba-og' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '41', 'EU', 9, 1),
  ((SELECT id FROM products WHERE slug='samba-og' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '42', 'EU', 11, 2),
  ((SELECT id FROM products WHERE slug='samba-og' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '43', 'EU', 4, 3),
  ((SELECT id FROM products WHERE slug='samba-og' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '44', 'EU', 6, 4),
  ((SELECT id FROM products WHERE slug='samba-og' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '45', 'EU', 8, 5),
  ((SELECT id FROM products WHERE slug='campus-00s' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '40', 'EU', 7, 0),
  ((SELECT id FROM products WHERE slug='campus-00s' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '41', 'EU', 9, 1),
  ((SELECT id FROM products WHERE slug='campus-00s' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '42', 'EU', 11, 2),
  ((SELECT id FROM products WHERE slug='campus-00s' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '43', 'EU', 4, 3),
  ((SELECT id FROM products WHERE slug='campus-00s' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '44', 'EU', 6, 4),
  ((SELECT id FROM products WHERE slug='campus-00s' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '45', 'EU', 8, 5),
  ((SELECT id FROM products WHERE slug='superstar' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '40', 'EU', 7, 0),
  ((SELECT id FROM products WHERE slug='superstar' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '41', 'EU', 9, 1),
  ((SELECT id FROM products WHERE slug='superstar' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '42', 'EU', 11, 2),
  ((SELECT id FROM products WHERE slug='superstar' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '43', 'EU', 4, 3),
  ((SELECT id FROM products WHERE slug='superstar' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '44', 'EU', 6, 4),
  ((SELECT id FROM products WHERE slug='superstar' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '45', 'EU', 8, 5),
  ((SELECT id FROM products WHERE slug='yeezy-350-zebra' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '40', 'EU', 7, 0),
  ((SELECT id FROM products WHERE slug='yeezy-350-zebra' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '41', 'EU', 9, 1),
  ((SELECT id FROM products WHERE slug='yeezy-350-zebra' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '42', 'EU', 11, 2),
  ((SELECT id FROM products WHERE slug='yeezy-350-zebra' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '43', 'EU', 4, 3),
  ((SELECT id FROM products WHERE slug='yeezy-350-zebra' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '44', 'EU', 6, 4),
  ((SELECT id FROM products WHERE slug='yeezy-350-zebra' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '45', 'EU', 8, 5),
  ((SELECT id FROM products WHERE slug='nb-550' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '40', 'EU', 7, 0),
  ((SELECT id FROM products WHERE slug='nb-550' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '41', 'EU', 9, 1),
  ((SELECT id FROM products WHERE slug='nb-550' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '42', 'EU', 11, 2),
  ((SELECT id FROM products WHERE slug='nb-550' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '43', 'EU', 4, 3),
  ((SELECT id FROM products WHERE slug='nb-550' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '44', 'EU', 6, 4),
  ((SELECT id FROM products WHERE slug='nb-550' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '45', 'EU', 8, 5),
  ((SELECT id FROM products WHERE slug='nb-2002r-rain' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '40', 'EU', 7, 0),
  ((SELECT id FROM products WHERE slug='nb-2002r-rain' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '41', 'EU', 9, 1),
  ((SELECT id FROM products WHERE slug='nb-2002r-rain' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '42', 'EU', 11, 2),
  ((SELECT id FROM products WHERE slug='nb-2002r-rain' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '43', 'EU', 4, 3),
  ((SELECT id FROM products WHERE slug='nb-2002r-rain' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '44', 'EU', 6, 4),
  ((SELECT id FROM products WHERE slug='nb-2002r-rain' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '45', 'EU', 8, 5),
  ((SELECT id FROM products WHERE slug='nb-9060' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '40', 'EU', 7, 0),
  ((SELECT id FROM products WHERE slug='nb-9060' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '41', 'EU', 9, 1),
  ((SELECT id FROM products WHERE slug='nb-9060' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '42', 'EU', 11, 2),
  ((SELECT id FROM products WHERE slug='nb-9060' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '43', 'EU', 4, 3),
  ((SELECT id FROM products WHERE slug='nb-9060' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '44', 'EU', 6, 4),
  ((SELECT id FROM products WHERE slug='nb-9060' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '45', 'EU', 8, 5),
  ((SELECT id FROM products WHERE slug='gel-kayano-14' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '40', 'EU', 7, 0),
  ((SELECT id FROM products WHERE slug='gel-kayano-14' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '41', 'EU', 9, 1),
  ((SELECT id FROM products WHERE slug='gel-kayano-14' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '42', 'EU', 11, 2),
  ((SELECT id FROM products WHERE slug='gel-kayano-14' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '43', 'EU', 4, 3),
  ((SELECT id FROM products WHERE slug='gel-kayano-14' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '44', 'EU', 6, 4),
  ((SELECT id FROM products WHERE slug='gel-kayano-14' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '45', 'EU', 8, 5),
  ((SELECT id FROM products WHERE slug='gel-1130' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '40', 'EU', 7, 0),
  ((SELECT id FROM products WHERE slug='gel-1130' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '41', 'EU', 9, 1),
  ((SELECT id FROM products WHERE slug='gel-1130' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '42', 'EU', 11, 2),
  ((SELECT id FROM products WHERE slug='gel-1130' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '43', 'EU', 4, 3),
  ((SELECT id FROM products WHERE slug='gel-1130' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '44', 'EU', 6, 4),
  ((SELECT id FROM products WHERE slug='gel-1130' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '45', 'EU', 8, 5),
  ((SELECT id FROM products WHERE slug='gel-nyc-arctic' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '40', 'EU', 7, 0),
  ((SELECT id FROM products WHERE slug='gel-nyc-arctic' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '41', 'EU', 9, 1),
  ((SELECT id FROM products WHERE slug='gel-nyc-arctic' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '42', 'EU', 11, 2),
  ((SELECT id FROM products WHERE slug='gel-nyc-arctic' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '43', 'EU', 4, 3),
  ((SELECT id FROM products WHERE slug='gel-nyc-arctic' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '44', 'EU', 6, 4),
  ((SELECT id FROM products WHERE slug='gel-nyc-arctic' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '45', 'EU', 8, 5),
  ((SELECT id FROM products WHERE slug='gel-nyc-graphite' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '40', 'EU', 7, 0),
  ((SELECT id FROM products WHERE slug='gel-nyc-graphite' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '41', 'EU', 9, 1),
  ((SELECT id FROM products WHERE slug='gel-nyc-graphite' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '42', 'EU', 11, 2),
  ((SELECT id FROM products WHERE slug='gel-nyc-graphite' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '43', 'EU', 4, 3),
  ((SELECT id FROM products WHERE slug='gel-nyc-graphite' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '44', 'EU', 6, 4),
  ((SELECT id FROM products WHERE slug='gel-nyc-graphite' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '45', 'EU', 8, 5),
  ((SELECT id FROM products WHERE slug='chuck-hi' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '40', 'EU', 7, 0),
  ((SELECT id FROM products WHERE slug='chuck-hi' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '41', 'EU', 9, 1),
  ((SELECT id FROM products WHERE slug='chuck-hi' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '42', 'EU', 11, 2),
  ((SELECT id FROM products WHERE slug='chuck-hi' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '43', 'EU', 4, 3),
  ((SELECT id FROM products WHERE slug='chuck-hi' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '44', 'EU', 6, 4),
  ((SELECT id FROM products WHERE slug='chuck-hi' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '45', 'EU', 8, 5),
  ((SELECT id FROM products WHERE slug='chuck-70-ox' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '40', 'EU', 7, 0),
  ((SELECT id FROM products WHERE slug='chuck-70-ox' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '41', 'EU', 9, 1),
  ((SELECT id FROM products WHERE slug='chuck-70-ox' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '42', 'EU', 11, 2),
  ((SELECT id FROM products WHERE slug='chuck-70-ox' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '43', 'EU', 4, 3),
  ((SELECT id FROM products WHERE slug='chuck-70-ox' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '44', 'EU', 6, 4),
  ((SELECT id FROM products WHERE slug='chuck-70-ox' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '45', 'EU', 8, 5),
  ((SELECT id FROM products WHERE slug='run-star-hike' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '40', 'EU', 7, 0),
  ((SELECT id FROM products WHERE slug='run-star-hike' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '41', 'EU', 9, 1),
  ((SELECT id FROM products WHERE slug='run-star-hike' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '42', 'EU', 11, 2),
  ((SELECT id FROM products WHERE slug='run-star-hike' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '43', 'EU', 4, 3),
  ((SELECT id FROM products WHERE slug='run-star-hike' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '44', 'EU', 6, 4),
  ((SELECT id FROM products WHERE slug='run-star-hike' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '45', 'EU', 8, 5),
  ((SELECT id FROM products WHERE slug='yeezy-foam-rnnr' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '40', 'EU', 7, 0),
  ((SELECT id FROM products WHERE slug='yeezy-foam-rnnr' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '41', 'EU', 9, 1),
  ((SELECT id FROM products WHERE slug='yeezy-foam-rnnr' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '42', 'EU', 11, 2),
  ((SELECT id FROM products WHERE slug='yeezy-foam-rnnr' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '43', 'EU', 4, 3),
  ((SELECT id FROM products WHERE slug='yeezy-foam-rnnr' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '44', 'EU', 6, 4),
  ((SELECT id FROM products WHERE slug='yeezy-foam-rnnr' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '45', 'EU', 8, 5),
  ((SELECT id FROM products WHERE slug='nb-530' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '40', 'EU', 7, 0),
  ((SELECT id FROM products WHERE slug='nb-530' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '41', 'EU', 9, 1),
  ((SELECT id FROM products WHERE slug='nb-530' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '42', 'EU', 11, 2),
  ((SELECT id FROM products WHERE slug='nb-530' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '43', 'EU', 4, 3),
  ((SELECT id FROM products WHERE slug='nb-530' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '44', 'EU', 6, 4),
  ((SELECT id FROM products WHERE slug='nb-530' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '45', 'EU', 8, 5),
  ((SELECT id FROM products WHERE slug='gel-1130-black' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '40', 'EU', 7, 0),
  ((SELECT id FROM products WHERE slug='gel-1130-black' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '41', 'EU', 9, 1),
  ((SELECT id FROM products WHERE slug='gel-1130-black' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '42', 'EU', 11, 2),
  ((SELECT id FROM products WHERE slug='gel-1130-black' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '43', 'EU', 4, 3),
  ((SELECT id FROM products WHERE slug='gel-1130-black' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '44', 'EU', 6, 4),
  ((SELECT id FROM products WHERE slug='gel-1130-black' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '45', 'EU', 8, 5),
  ((SELECT id FROM products WHERE slug='nb-1906r' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '40', 'EU', 7, 0),
  ((SELECT id FROM products WHERE slug='nb-1906r' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '41', 'EU', 9, 1),
  ((SELECT id FROM products WHERE slug='nb-1906r' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '42', 'EU', 11, 2),
  ((SELECT id FROM products WHERE slug='nb-1906r' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '43', 'EU', 4, 3),
  ((SELECT id FROM products WHERE slug='nb-1906r' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '44', 'EU', 6, 4),
  ((SELECT id FROM products WHERE slug='nb-1906r' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '45', 'EU', 8, 5);

-- ---------- tags ----------
INSERT INTO tags (slug, name, kind) VALUES
  ('sneakers', 'Sneakers', 'style'),
  ('retro', 'Retro', 'style'),
  ('running', 'Running', 'use'),
  ('basketball', 'Basketball', 'use'),
  ('lifestyle', 'Lifestyle', 'use'),
  ('skate', 'Skate', 'use'),
  ('white', 'White', 'color'),
  ('black', 'Black', 'color'),
  ('grey', 'Grey', 'color'),
  ('leather', 'Leather', 'material'),
  ('canvas', 'Canvas', 'material'),
  ('mesh', 'Mesh', 'material'),
  ('knit', 'Knit', 'material'),
  ('suede', 'Suede', 'material'),
  ('unisex', 'Unisex', 'audience'),
  ('limited', 'Limited', 'other'),
  ('classic', 'Classic', 'other');

-- ---------- product tags (keyword pass; AI refines later) ----------
INSERT INTO product_tags (product_id, tag_id, source) VALUES
  ((SELECT id FROM products WHERE slug='dunk-panda' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), (SELECT id FROM tags WHERE slug='sneakers'), 'human'),
  ((SELECT id FROM products WHERE slug='dunk-panda' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), (SELECT id FROM tags WHERE slug='white'), 'human'),
  ((SELECT id FROM products WHERE slug='dunk-panda' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), (SELECT id FROM tags WHERE slug='black'), 'human'),
  ((SELECT id FROM products WHERE slug='af1-white' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), (SELECT id FROM tags WHERE slug='sneakers'), 'human'),
  ((SELECT id FROM products WHERE slug='af1-white' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), (SELECT id FROM tags WHERE slug='white'), 'human'),
  ((SELECT id FROM products WHERE slug='dunk-grey-fog' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), (SELECT id FROM tags WHERE slug='sneakers'), 'human'),
  ((SELECT id FROM products WHERE slug='dunk-grey-fog' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), (SELECT id FROM tags WHERE slug='white'), 'human'),
  ((SELECT id FROM products WHERE slug='dunk-grey-fog' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), (SELECT id FROM tags WHERE slug='grey'), 'human'),
  ((SELECT id FROM products WHERE slug='dunk-grey-fog' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), (SELECT id FROM tags WHERE slug='leather'), 'human'),
  ((SELECT id FROM products WHERE slug='kobe-6-grinch' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), (SELECT id FROM tags WHERE slug='sneakers'), 'human'),
  ((SELECT id FROM products WHERE slug='aj3-white-cement' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), (SELECT id FROM tags WHERE slug='sneakers'), 'human'),
  ((SELECT id FROM products WHERE slug='aj3-white-cement' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), (SELECT id FROM tags WHERE slug='white'), 'human'),
  ((SELECT id FROM products WHERE slug='aj4-military' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), (SELECT id FROM tags WHERE slug='sneakers'), 'human'),
  ((SELECT id FROM products WHERE slug='aj4-military' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), (SELECT id FROM tags WHERE slug='white'), 'human'),
  ((SELECT id FROM products WHERE slug='aj4-military' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), (SELECT id FROM tags WHERE slug='black'), 'human'),
  ((SELECT id FROM products WHERE slug='aj11-cool-grey' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), (SELECT id FROM tags WHERE slug='sneakers'), 'human'),
  ((SELECT id FROM products WHERE slug='aj11-cool-grey' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), (SELECT id FROM tags WHERE slug='grey'), 'human'),
  ((SELECT id FROM products WHERE slug='aj11-cool-grey' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), (SELECT id FROM tags WHERE slug='leather'), 'human'),
  ((SELECT id FROM products WHERE slug='samba-og' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), (SELECT id FROM tags WHERE slug='sneakers'), 'human'),
  ((SELECT id FROM products WHERE slug='samba-og' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), (SELECT id FROM tags WHERE slug='white'), 'human'),
  ((SELECT id FROM products WHERE slug='samba-og' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), (SELECT id FROM tags WHERE slug='leather'), 'human'),
  ((SELECT id FROM products WHERE slug='samba-og' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), (SELECT id FROM tags WHERE slug='classic'), 'human'),
  ((SELECT id FROM products WHERE slug='campus-00s' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), (SELECT id FROM tags WHERE slug='sneakers'), 'human'),
  ((SELECT id FROM products WHERE slug='campus-00s' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), (SELECT id FROM tags WHERE slug='skate'), 'human'),
  ((SELECT id FROM products WHERE slug='campus-00s' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), (SELECT id FROM tags WHERE slug='suede'), 'human'),
  ((SELECT id FROM products WHERE slug='superstar' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), (SELECT id FROM tags WHERE slug='sneakers'), 'human'),
  ((SELECT id FROM products WHERE slug='yeezy-350-zebra' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), (SELECT id FROM tags WHERE slug='sneakers'), 'human'),
  ((SELECT id FROM products WHERE slug='yeezy-350-zebra' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), (SELECT id FROM tags WHERE slug='knit'), 'human'),
  ((SELECT id FROM products WHERE slug='nb-550' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), (SELECT id FROM tags WHERE slug='sneakers'), 'human'),
  ((SELECT id FROM products WHERE slug='nb-550' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), (SELECT id FROM tags WHERE slug='basketball'), 'human'),
  ((SELECT id FROM products WHERE slug='nb-550' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), (SELECT id FROM tags WHERE slug='white'), 'human'),
  ((SELECT id FROM products WHERE slug='nb-550' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), (SELECT id FROM tags WHERE slug='grey'), 'human'),
  ((SELECT id FROM products WHERE slug='nb-2002r-rain' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), (SELECT id FROM tags WHERE slug='sneakers'), 'human'),
  ((SELECT id FROM products WHERE slug='nb-2002r-rain' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), (SELECT id FROM tags WHERE slug='grey'), 'human'),
  ((SELECT id FROM products WHERE slug='nb-9060' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), (SELECT id FROM tags WHERE slug='sneakers'), 'human'),
  ((SELECT id FROM products WHERE slug='nb-9060' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), (SELECT id FROM tags WHERE slug='classic'), 'human'),
  ((SELECT id FROM products WHERE slug='gel-kayano-14' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), (SELECT id FROM tags WHERE slug='sneakers'), 'human'),
  ((SELECT id FROM products WHERE slug='gel-kayano-14' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), (SELECT id FROM tags WHERE slug='running'), 'human'),
  ((SELECT id FROM products WHERE slug='gel-kayano-14' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), (SELECT id FROM tags WHERE slug='white'), 'human'),
  ((SELECT id FROM products WHERE slug='gel-kayano-14' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), (SELECT id FROM tags WHERE slug='mesh'), 'human'),
  ((SELECT id FROM products WHERE slug='gel-1130' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), (SELECT id FROM tags WHERE slug='sneakers'), 'human'),
  ((SELECT id FROM products WHERE slug='gel-1130' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), (SELECT id FROM tags WHERE slug='retro'), 'human'),
  ((SELECT id FROM products WHERE slug='gel-nyc-arctic' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), (SELECT id FROM tags WHERE slug='sneakers'), 'human'),
  ((SELECT id FROM products WHERE slug='gel-nyc-graphite' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), (SELECT id FROM tags WHERE slug='sneakers'), 'human'),
  ((SELECT id FROM products WHERE slug='gel-nyc-graphite' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), (SELECT id FROM tags WHERE slug='grey'), 'human'),
  ((SELECT id FROM products WHERE slug='chuck-hi' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), (SELECT id FROM tags WHERE slug='sneakers'), 'human'),
  ((SELECT id FROM products WHERE slug='chuck-hi' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), (SELECT id FROM tags WHERE slug='canvas'), 'human'),
  ((SELECT id FROM products WHERE slug='chuck-70-ox' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), (SELECT id FROM tags WHERE slug='sneakers'), 'human'),
  ((SELECT id FROM products WHERE slug='chuck-70-ox' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), (SELECT id FROM tags WHERE slug='canvas'), 'human'),
  ((SELECT id FROM products WHERE slug='run-star-hike' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), (SELECT id FROM tags WHERE slug='sneakers'), 'human'),
  ((SELECT id FROM products WHERE slug='yeezy-foam-rnnr' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), (SELECT id FROM tags WHERE slug='sneakers'), 'human'),
  ((SELECT id FROM products WHERE slug='nb-530' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), (SELECT id FROM tags WHERE slug='sneakers'), 'human'),
  ((SELECT id FROM products WHERE slug='nb-530' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), (SELECT id FROM tags WHERE slug='retro'), 'human'),
  ((SELECT id FROM products WHERE slug='gel-1130-black' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), (SELECT id FROM tags WHERE slug='sneakers'), 'human'),
  ((SELECT id FROM products WHERE slug='gel-1130-black' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), (SELECT id FROM tags WHERE slug='black'), 'human'),
  ((SELECT id FROM products WHERE slug='nb-1906r' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), (SELECT id FROM tags WHERE slug='sneakers'), 'human');

-- ---------- highlights (centre island presets) ----------
INSERT INTO highlights (space_id, code, title, subtitle, accent_color, is_active, sort_order) VALUES
  ((SELECT id FROM spaces WHERE slug='solespace'), 'sale', 'SALE %', 'Marked down while stock lasts', '#ff2d55', 1, 0),
  ((SELECT id FROM spaces WHERE slug='solespace'), 'popular', 'POPULAR', 'What everyone is buying', '#ffd166', 0, 1),
  ((SELECT id FROM spaces WHERE slug='solespace'), 'new_arrival', 'NEW ARRIVALS', 'Fresh on the shelves', '#3ddc84', 0, 2);

-- ---------- highlight items ----------
INSERT INTO highlight_items (highlight_id, product_id, sort_order) VALUES
  ((SELECT id FROM highlights WHERE code='sale' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), (SELECT id FROM products WHERE slug='yeezy-foam-rnnr' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), 0),
  ((SELECT id FROM highlights WHERE code='sale' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), (SELECT id FROM products WHERE slug='nb-530' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), 1),
  ((SELECT id FROM highlights WHERE code='sale' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), (SELECT id FROM products WHERE slug='gel-1130-black' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), 2),
  ((SELECT id FROM highlights WHERE code='sale' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), (SELECT id FROM products WHERE slug='nb-1906r' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), 3),
  ((SELECT id FROM highlights WHERE code='popular' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), (SELECT id FROM products WHERE slug='dunk-panda' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), 0),
  ((SELECT id FROM highlights WHERE code='popular' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), (SELECT id FROM products WHERE slug='samba-og' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), 1),
  ((SELECT id FROM highlights WHERE code='popular' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), (SELECT id FROM products WHERE slug='aj4-military' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), 2),
  ((SELECT id FROM highlights WHERE code='popular' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), (SELECT id FROM products WHERE slug='nb-550' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), 3),
  ((SELECT id FROM highlights WHERE code='new_arrival' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), (SELECT id FROM products WHERE slug='gel-kayano-14' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), 0),
  ((SELECT id FROM highlights WHERE code='new_arrival' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), (SELECT id FROM products WHERE slug='nb-2002r-rain' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), 1),
  ((SELECT id FROM highlights WHERE code='new_arrival' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), (SELECT id FROM products WHERE slug='kobe-6-grinch' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), 2),
  ((SELECT id FROM highlights WHERE code='new_arrival' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), (SELECT id FROM products WHERE slug='campus-00s' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), 3);

-- ---------- discounts ----------
INSERT INTO discounts (code, name, kind, value, scope, target_id, starts_at, ends_at, is_active, priority) VALUES
  ('SEED-YEEZYFOAMRNN', 'Launch markdown - yeezy-foam-rnnr', 'fixed', 3100, 'product', (SELECT id FROM products WHERE slug='yeezy-foam-rnnr' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), NOW(), DATE_ADD(NOW(), INTERVAL 90 DAY), 1, 10),
  ('SEED-NB530', 'Launch markdown - nb-530', 'fixed', 3100, 'product', (SELECT id FROM products WHERE slug='nb-530' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), NOW(), DATE_ADD(NOW(), INTERVAL 90 DAY), 1, 10),
  ('SEED-GEL1130BLACK', 'Launch markdown - gel-1130-black', 'fixed', 4100, 'product', (SELECT id FROM products WHERE slug='gel-1130-black' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), NOW(), DATE_ADD(NOW(), INTERVAL 90 DAY), 1, 10),
  ('SEED-NB1906R', 'Launch markdown - nb-1906r', 'fixed', 5600, 'product', (SELECT id FROM products WHERE slug='nb-1906r' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), NOW(), DATE_ADD(NOW(), INTERVAL 90 DAY), 1, 10);

-- ---------- search index (text; embeddings filled by the AI worker) ----------
INSERT INTO product_search (product_id, content) VALUES
  ((SELECT id FROM products WHERE slug='dunk-panda' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), 'Dunk Low "Panda" Nike nike sneakers The black-and-white staple that refuses to stay in stock. Goes with everything you own.'),
  ((SELECT id FROM products WHERE slug='af1-white' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), 'Air Force 1 ''07 Nike nike sneakers Triple white. The most worn sneaker on planet Earth, and still undefeated.'),
  ((SELECT id FROM products WHERE slug='dunk-grey-fog' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), 'Dunk Low "Grey Fog" Nike nike sneakers Soft grey overlays on crisp white leather. The Panda''s calmer sibling.'),
  ((SELECT id FROM products WHERE slug='kobe-6-grinch' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), 'Kobe 6 "Reverse Grinch" Nike nike sneakers Christmas-day energy all year. Sharp, fast, and impossible to miss on court.'),
  ((SELECT id FROM products WHERE slug='aj3-white-cement' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), 'Air Jordan 3 "White Cement" Jordan jordan sneakers Elephant print, visible Air, and history in every step. The ''88 icon reimagined.'),
  ((SELECT id FROM products WHERE slug='aj4-military' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), 'Air Jordan 4 "Military Black" Jordan jordan sneakers Clean white base, black hits, endless outfit rotation. A modern-day essential.'),
  ((SELECT id FROM products WHERE slug='aj11-cool-grey' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), 'Air Jordan 11 "Cool Grey" Jordan jordan sneakers Patent leather shine in signature Cool Grey. Dress code approved, court certified.'),
  ((SELECT id FROM products WHERE slug='samba-og' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), 'Samba OG adidas adidas sneakers Terrace classic turned global fashion staple. White leather, gum sole, done.'),
  ((SELECT id FROM products WHERE slug='campus-00s' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), 'Campus 00s adidas adidas sneakers Chunky Y2K proportions with premium suede. The skate-shop look, revived.'),
  ((SELECT id FROM products WHERE slug='superstar' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), 'Superstar adidas adidas sneakers Shell toe. Three stripes. Fifty years of street cred in one silhouette.'),
  ((SELECT id FROM products WHERE slug='yeezy-350-zebra' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), 'Yeezy Boost 350 V2 "Zebra" adidas adidas sneakers The unmistakable stripe pattern on Primeknit, riding full-length Boost.'),
  ((SELECT id FROM products WHERE slug='nb-550' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '550 "White Grey" New Balance newbalance sneakers The ''89 basketball shape that took over the streets. Perfectly aged proportions.'),
  ((SELECT id FROM products WHERE slug='nb-2002r-rain' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '2002R "Rain Cloud" New Balance newbalance sneakers Protection Pack construction with soft layered greys. Comfort with edge.'),
  ((SELECT id FROM products WHERE slug='nb-9060' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), '9060 "Sea Salt" New Balance newbalance sneakers Warped lines and creamy tones — a futurist remix of the classic 99X series.'),
  ((SELECT id FROM products WHERE slug='gel-kayano-14' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), 'GEL-Kayano 14 ASICS asics sneakers Y2K running tech turned runway favorite. White and pure silver mesh magic.'),
  ((SELECT id FROM products WHERE slug='gel-1130' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), 'GEL-1130 "Clay Canyon" ASICS asics sneakers Retro runner DNA with modern comfort. The quiet flex of people who know.'),
  ((SELECT id FROM products WHERE slug='gel-nyc-arctic' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), 'GEL-NYC "Arctic Sky" ASICS asics sneakers Layered cream and icy blue inspired by early-2000s city marathons.'),
  ((SELECT id FROM products WHERE slug='gel-nyc-graphite' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), 'GEL-NYC "Graphite" ASICS asics sneakers Tonal grey stack with reflective hits. Urban camouflage, elevated.'),
  ((SELECT id FROM products WHERE slug='chuck-hi' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), 'Chuck Taylor All Star Hi Converse converse sneakers The canvas high-top that started it all. Every generation makes it theirs.'),
  ((SELECT id FROM products WHERE slug='chuck-70-ox' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), 'Chuck 70 Ox "Parchment" Converse converse sneakers Vintage-spec construction, warmer canvas, higher foxing. The connoisseur''s Chuck.'),
  ((SELECT id FROM products WHERE slug='run-star-hike' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), 'Run Star Hike Converse converse sneakers The Chuck on a platform lugged sole. Height, attitude, and grip included.'),
  ((SELECT id FROM products WHERE slug='yeezy-foam-rnnr' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), 'Yeezy Foam Runner "Onyx" adidas adidas sneakers Sculptural one-piece foam. Feels like walking on the moon, priced like Earth.'),
  ((SELECT id FROM products WHERE slug='nb-530' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), 'New Balance 530 New Balance newbalance sneakers Silvery retro runner with everyday comfort. Last sizes going fast.'),
  ((SELECT id FROM products WHERE slug='gel-1130-black' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), 'ASICS GEL-1130 "Black" ASICS asics sneakers The stealth colorway of the fan favorite. Discounted, not discontinued.'),
  ((SELECT id FROM products WHERE slug='nb-1906r' AND space_id=(SELECT id FROM spaces WHERE slug='solespace')), 'New Balance 1906R New Balance newbalance sneakers Tech-runner shine in Sea Salt metallics. Premium comfort, clearance price.');

-- ---------- admin user ----------
-- Default login: admin@metamart.local  /  ChangeMe!2026   <-- CHANGE THIS AFTER FIRST LOGIN
INSERT INTO admin_users (email, password_hash, name, role) VALUES
  ('admin@metamart.local', '$2b$10$O8L.kIpUTEoAv2i5T8DUPu1eqqudQLhFIbz3SCZ/vB1xjXZanKC8e', 'Owner', 'owner');

-- ---------- settings ----------
INSERT INTO settings (k, v_json) VALUES
  ('mart.name', '"METAMART"'),
  ('mart.currency', '"USD"'),
  ('ai.provider_order', '["groq","openai","gemini"]'),
  ('ai.enabled_agents', '["enrich","search","vision","merchandiser","stylist"]'),
  ('ai.daily_budget_usd', '5');

-- end of seed

COMMIT;
