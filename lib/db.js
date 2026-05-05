import postgres from 'postgres';

const globalForDb = globalThis;

export const sql = globalForDb.__pg || postgres(process.env.DATABASE_URL, {
  prepare: false, // Transaction pooler does NOT support prepared statements
  max: 10,
  idle_timeout: 20,
  connect_timeout: 30,
  ssl: 'require',
});

if (!globalForDb.__pg) globalForDb.__pg = sql;

export default sql;
