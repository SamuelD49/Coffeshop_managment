import { getDb } from "../src/lib/db";

const rows = getDb().prepare("SELECT business_date FROM sales_sessions LIMIT 5").all();
console.log("Sample business_dates:", rows);
