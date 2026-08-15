import Database from "better-sqlite3";
import path from "node:path";
import { readFileSync } from "node:fs";

const dbPath = path.join(import.meta.dirname, "..", "data", "crawl.db");
const sqlPath = path.join(import.meta.dirname, "..", "db", "schema.sql");
const sqlString = readFileSync(sqlPath, "utf8");
const db = new Database(dbPath);
db.exec(sqlString);