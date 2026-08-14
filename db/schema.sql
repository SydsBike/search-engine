CREATE TABLE IF NOT EXISTS frontier(
    url TEXT PRIMARY KEY NOT NULL,
    host TEXT NOT NULL,
    crawl_status TEXT NOT NULL DEFAULT 'pending',
    depth INTEGER NOT NULL,
    discovered_at INTEGER NOT NULL,
    attempted_at INTEGER NULL,
    http_status INTEGER NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    redirect_to TEXT NULL,
    error TEXT NULL,
    skip_reason TEXT NULL
) STRICT;
CREATE INDEX IF NOT EXISTS idx_frontier_status_host_depth ON frontier(crawl_status, host, depth);