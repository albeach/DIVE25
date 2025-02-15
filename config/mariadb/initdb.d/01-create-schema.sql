-- config/mariadb/initdb.d/01-create-schema.sql

-- Create NATO security metadata tables
CREATE TABLE IF NOT EXISTS wp_nato_security_metadata (
    post_id BIGINT(20) UNSIGNED NOT NULL,
    classification VARCHAR(50) NOT NULL,
    releasability TEXT,
    coi_tags TEXT,
    lacv_code VARCHAR(10),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (post_id),
    FOREIGN KEY (post_id) REFERENCES wp_posts(ID) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add indexes for performance
CREATE INDEX idx_classification ON wp_nato_security_metadata(classification);
CREATE INDEX idx_lacv_code ON wp_nato_security_metadata(lacv_code);