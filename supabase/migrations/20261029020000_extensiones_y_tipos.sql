-- Extensiones y tipos compartidos del paso de identidad.
create schema if not exists extensions;
create schema if not exists app;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists citext with schema extensions;

revoke all on schema app from public;
grant usage on schema app to authenticated, service_role;

create type public.tenant_status as enum ('active', 'suspended', 'archived');
create type public.domain_kind as enum ('subdomain', 'custom');
create type public.tenant_role as enum (
  'owner',
  'admin',
  'instructor',
  'instructor_guest',
  'client_coordinator',
  'student'
);
create type public.member_status as enum ('active', 'suspended');
create type public.client_status as enum ('active', 'inactive');
create type public.client_member_role as enum ('coordinator', 'member');
