INSERT INTO "Category" (
    "id",
    "key",
    "name",
    "active",
    "sortOrder",
    "createdAt"
)
VALUES (
    '44444444-4444-4444-8444-444444444444',
    'PROVEEDORES',
    'Proveedores',
    true,
    4,
    CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO NOTHING;
