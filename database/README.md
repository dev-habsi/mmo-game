# Database

`schema.sql` is loaded by Docker Compose on first Postgres boot. For local dev, the server can also apply it when `AUTO_MIGRATE=true`.

The MVP uses JSONB inventory for faster iteration. Move to normalized inventory rows when item count, auditability, or economy tooling grows.
