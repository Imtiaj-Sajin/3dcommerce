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
