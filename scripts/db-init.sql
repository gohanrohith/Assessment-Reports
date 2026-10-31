SELECT 'CREATE ROLE assessment_app LOGIN PASSWORD ''local_app_only'' NOSUPERUSER NOBYPASSRLS' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname='assessment_app')\gexec
GRANT CONNECT ON DATABASE assessment TO assessment_app;
