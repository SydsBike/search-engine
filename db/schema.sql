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

CREATE TABLE IF NOT EXISTS docs (
    id INTEGER PRIMARY KEY NOT NULL,
    url TEXT NOT NULL UNIQUE,
    path TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    text_hash TEXT NULL,
    content_length INTEGER NOT NULL,
    fetched_at INTEGER NOT NULL,
    content_type TEXT NULL,
    "charset" TEXT NULL,
    http_status INTEGER NOT NULL,
    etag TEXT NULL,
    last_modified TEXT NULL,
    title TEXT NULL,
    token_count INTEGER NULL
) STRICT;

CREATE INDEX IF NOT EXISTS idx_docs_content_hash ON docs(content_hash);