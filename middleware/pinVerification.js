import dotenv from "dotenv";
import db from "../dbConnection.js";

dotenv.config();

function queryAsync(query, params) {
  return new Promise((resolve, reject) => {
    db.query(query, params, (error, results) => {
      if (error) reject(error);
      else resolve(results);
    });
  });
}

export default async function verifyPin(req, res, next) {
  const { email, pin } = req?.body;
  if (!email || !pin) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  try {
    const query = "SELECT * FROM users WHERE email = ?";
    const result = await queryAsync(query, [email]);
    if (result.length > 0) {
      if (result[0].user_pin === pin) {
        return next();
      } else {
        return res.status(403).send({ message: "Pin not verified !" });
      }
    } else {
      return res.status(404).send({ message: "User not found" });
    }
  } catch (error) {
    return res.status(500).send({ message: "Internal Server Error" });
  }
}
