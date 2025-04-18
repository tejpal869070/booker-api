import mysql from "mysql2";

// mysql connection
const db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "",
  database: "booker-website",
});

db.connect((err) => {
  if (err) {
    console.error("error connecting:", err);
    return;
  }
  console.log("Database Connected");
});

export default db;
