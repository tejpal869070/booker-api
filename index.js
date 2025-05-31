import express from "express";
import bodyParser from "body-parser";
import mysql from "mysql2";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import verifyToken from "./middleware/authToken.js";
import multer from "multer";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import {
  allDepositRequest,
  allWithdrawalRequest,
  approveDepositRequest,
  inprocessWithdrawalRequest,
  rejectDepositRequest,
  rejectWithdrawalRequest,
  apprveWithdrawalRequest,
  getGames,
  updateGames,
  addNewMatch,
  getAllMatch,
  getSingleMatchDetail,
  changeMatchStatus,
  updateMatchResults,
  deleteMatch,
  winLossMatch,
  getAllBets,
  getAdminData,
  adminLogin,
  adminTokenCheck,
  getAllUsers,
  getUserDetails,
  updateUserStatus,
  addRefund,
  getAllGamesData,
  completeMatch,
  updateMatchTime
} from "./admin.js";
import db from "./dbConnection.js";
import cors from "cors";
import verifyPin from "./middleware/pinVerification.js";
import CryptoJS from "crypto-js";

const app = express();
// app.use(cors());
// app.use(cors({ origin: process.env.ALLOWED_ORIGINS || "*" }));
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",")
  : [
      "http://localhost:3000", // Local development
      "https://your-frontend.com", // Production frontend
      "http://192.168.29.169:8081"
    ];

// Configure CORS to allow multiple origins
app.use(
  cors({
    origin: allowedOrigins, // Array of allowed origins
    credentials: true, // Allow cookies/auth headers
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"], // Allowed methods
  })
);
var SECRET_KEY_CRYPTO =
  "3e6dLf3A02D52L51630ac3883A339Y92b776CY97dbeYC21e113DdLe8314LbD84C53aad90C06D6A0aabYa6DCD139cCDCcf491AZA72CcYacb5CL7D08Zb159D7Z91";

// Recreate __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use("/assets", express.static(path.join(__dirname, "assets")));

// Body parsing middleware
app.use(express.json()); // for parsing application/json
app.use(express.urlencoded({ extended: true }));
app.use(bodyParser.json());

dotenv.config();

// Setup multer storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "assets"); // Save in 'assets' folder
  },
  filename: function (req, file, cb) {
    const uniqueName = Date.now() + "-" + file.originalname;
    cb(null, uniqueName);
  },
});

const upload = multer({ storage: storage });

const SECRET_KEY = process.env.SECRET_KEY;

function queryAsync(query, params) {
  return new Promise((resolve, reject) => {
    db.query(query, params, (error, results) => {
      if (error) reject(error);
      else resolve(results);
    });
  });
}

// game wallet statement add function--------------
async function addWalletStatement(id, email, amount, game_name, description, user_id) {
  const transectionId = `GAME0${id}${Date.now()}`;

  try {
    const user_game_wallet_balance = await queryAsync("SELECT * FROM wallet WHERE user_id = ?", [user_id]);

    if (user_game_wallet_balance.length > 0) {
      const game_wallet_balance = user_game_wallet_balance[0].main_wallet;

      const statementQuery =
        "INSERT INTO game_wallet (email, amount, game_name, description, updated_balance, transection_id) VALUES (?, ?, ?, ?, ?, ?)";
      const statementParams = [email, amount, game_name, JSON.stringify(description) || "", parseFloat(game_wallet_balance), transectionId];
      const statementResult = await queryAsync(statementQuery, statementParams);

      if (statementResult.affectedRows > 0) {
        return transectionId;
      } else {
        console.error("Failed to add wallet statement.");
        return false;
      }
    } else {
      console.error("User wallet not found for statement.");
      return false;
    }
  } catch (error) {
    console.error("Error while adding wallet statement:", error);
    return false;
  }
}


async function addMainStatement(transection_id, type, amount, updated_balance,	description, user_id ) { 
  if (!type || !amount || !updated_balance ||	!description || !transection_id){
    return false
  }

  try {
    const date = new Date().toISOString() 
    const statementQuery = "INSERT INTO statement (transection_id,	type,	amount,	updated_balance,	date,	description, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)";
    const statementParams = [transection_id,	type,	amount,	updated_balance,	date,	description, user_id]
    const statementResult = await queryAsync(statementQuery, statementParams);
      if (statementResult.affectedRows > 0) {
        return true;
      } else {
        return false;
      }
  } catch (error) { 
    console.log(error)
    throw error
  }
}


async function getUserDetail(email) {
  if(!email){
    return false
  }

  try {
    const query = `SELECT u.id, u.user_name, u.email, u.mobile, u.user_pin, u.user_id, w.main_wallet, w.game_wallet FROM users u INNER JOIN wallet w ON u.user_id = w.user_id WHERE u.email = ?`;
    const result = await queryAsync(query, [email]);
    return result[0]
  } catch (error) {
    throw error
  }
}


 

// check user existance--------------------------
app.post("/check-user-existance", async (req, res) => {
  const { mobile, email } = req.body;
  if (!email || !mobile) {
    return res.status(400).send({ message: "Mobile and email is required !" });
  }

  try {
    const query = "SELECT * FROM users where email = ?";
    const result = await queryAsync(query, [email]);
    if (result.length > 0) {
      res
        .status(302)
        .send({ message: "User with this Email Already Exists !" });
    } else {
      const query2 = "SELECT * FROM users where mobile = ?";
      const result2 = await queryAsync(query2, [mobile]);
      if (result2.length > 0) {
        res
          .status(302)
          .send({ message: "User with this mobile Already Exists !" });
      } else {
        res.status(200).send({ message: "User can register" });
      }
    }
  } catch (error) {
    return res.status(500).send({ message: "Internal server Error !" });
  }
});

app.post("/register", async (req, res) => {
  const { user_name, email, password, mobile } = req?.body;

  // if data is missing
  if (!user_name || !email || !password || !mobile) {
    return res.status(400).send({ message: "All fields are required!" });
  }

  try {
    db.query(
      "SELECT * FROM users WHERE email = ?",
      [email],
      async (err, result) => {
        if (err) throw err;
        if (result.length > 0) {
          return res.status(400).send({ message: "Email already exists!" });
        } else {
          db.query(
            "SELECT * FROM users WHERE mobile = ?",
            [mobile],
            async (err, result) => {
              if (err) {
                res
                  .status(409)
                  .send({ message: " Mobile number already exists" });
              }
              if (result.length > 0) {
                return res
                  .status(400)
                  .send({ message: "Phone already exists!" });
              } else {
                // create user ----------------
                const hashedPassword = await bcrypt.hash(password, 10);
                const user_id = `UID${mobile}`;
                db.query(
                  "INSERT INTO users SET ?",
                  {
                    user_name,
                    email,
                    password: hashedPassword,
                    mobile,
                    user_id,
                  },
                  (err, result) => {
                    if (err) throw err;
                    // set wallet balance-------
                    db.query(
                      "INSERT INTO wallet (user_id, main_wallet, game_wallet) VALUES (?,?,?) ON DUPLICATE KEY UPDATE user_id = ?, main_wallet = ?, game_wallet = ?",
                      [user_id, 0, 0, user_id, 0, 0],
                      (err, result) => {
                        if (err) {
                          res
                            .status(500)
                            .send({ message: " Error creating user" });
                        } else {
                          res.send({ message: "User created successfully!" });
                        }
                      }
                    );
                  }
                );
              }
            }
          );
        }
      }
    );
  } catch (error) {
    res.status(500).send({ message: " Internal Server Error" });
  }
});

app.post("/login", (req, res) => {
  const { emailOrMobile, password } = req?.body; 

  if (!emailOrMobile || !password) {
    return res.status(400).send({ message: "Email/Mobile & Password are required" });
  }

  try {
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailOrMobile);
    let query = "SELECT * FROM users WHERE ";

    if (isEmail) {
      query += "email = ?";
    } else {
      query += "mobile = ?";
    }

    db.query(query, [emailOrMobile], (err, result) => {
      if (err) {
        console.log(err);
        return res.status(409).send({ message: "Internal Server Error!" });
      } 

      if (result.length > 0) {
        const user = result[0];

        // Check if user is active
        if (user.is_active === "N") {
          return res.status(403).send({ message: "User is blocked"});
        }

        const isValidPassword = bcrypt.compareSync(password, user.password);

        if (isValidPassword) {
          const token = jwt.sign(
            { id: user.id, email: user.email, user_id: user.user_id },
            SECRET_KEY,
            { expiresIn: "24h" }
          );

          db.query(
            "INSERT INTO token (token, email) VALUES (?, ?) ON DUPLICATE KEY UPDATE token = ?",
            [token, user.email, token],
            (err) => {
              if (err) {
                return res.status(409).send({ message: "Error saving token" });
              } 
              
              res.status(200).send({
                message: "Login Successful!",
                status: true,
                token: token,
                email: user.email,
                userId: user.id,
              });
            }
          );
        } else {
          res.status(400).send({ message: "Invalid Password!" });
        }
      } else {
        res.status(400).send({ message: "Account Not Found" });
      }
    });
  } catch (error) {
    res.status(500).send({ message: "Server Down" });
  }
});


app.post("/check-token", async (req, res) => {
  const { email } = req.body;
  var token = req?.headers?.authorization;
  if (!token || !email) {
    return res.status(404).send({ message: "Token or Email Not Foundd !" });
  }
  try {
    token = token.replace("Bearer ", "");
    // check toke in db
    const query = "SELECT * FROM token WHERE token = ?";
    const result = await queryAsync(query, [token]);
    // check email atteched 
    if (result.length > 0 && result[0]?.email === email) {
      res.status(200).send({ message: "User Auth !" });
    } else {
      res.status(404).send({ message: "Unauth User !" });
    }
  } catch (error) { 
    return res.status(500).send({ message: "Internal Server Error" });
  }
});

app.post("/send-otp", async (req, res) => {
  const { email } = req?.body;
  if (!email) {
    res.status(400).send({ message: "Email is required!" });
  }
  const otp = Math.floor(1000 + Math.random() * 9000);
  const query =
    "INSERT INTO otp (email, otp) VALUES (?, ?) ON DUPLICATE KEY UPDATE otp = ?";
  db.query(query, [email, otp, otp], (err, result) => {
    if (err) {
      res.status(409).send({ message: "error" });
    } else {
      res.status(200).send({ otp: otp });
    }
  });

  
});

app.post("/verify-otp", async (req, res) => {
  const { email, otp } = req?.body;
  if (!email || !otp) {
    res.status(400).send({ message: "Email and Otp are required!" });
  } else {
    const query = "SELECT * FROM otp WHERE email = ? AND otp = ?";
    db.query(query, [email, otp], (err, result) => {
      if (err) {
        res.status(409).send({ message: "error" });
      } else {
        if (result.length > 0) {
          const query = "DELETE FROM otp WHERE email = ?";
          db.query(query, [email], (err, result) => {
            if (err) {
              res.status(409).send({ message: "error" });
            } else {
              res.status(200).send({ message: "Otp Verified Successfully!" });
            }
          });
        } else {
          res.status(400).send({ message: "Invalid Otp!" });
        }
      }
    });
  }
});


app.post('/reset-password', async (req, res) => {
  const { email, password } = req.body;

  // Check if email and password are provided
  if (!email || !password) {
    return res.status(400).send({ message: "Email and new password are required!" });
  }

  // Query to check if the email exists in the database
  const query = "SELECT * FROM users WHERE email = ?";
  db.query(query, [email], async (err, result) => {
    if (err) {
      return res.status(500).send({ message: "Database error" });
    }

    if (result.length === 0) {
      return res.status(400).send({ message: "Email is not registered!" });
    } 

    try {
      // Hash the new password before storing it in the database
      const hashedPassword = await bcrypt.hash(password, 10);

      // Update the password in the database
      const updateQuery = "UPDATE users SET password = ? WHERE email = ?";
      db.query(updateQuery, [hashedPassword, email], (err, result) => {
        if (err) {
          return res.status(500).send({ message: "Error updating password" });
        }

        // Successfully reset password
        res.status(200).send({
          message: "Password reset successfully!",
        });
      });
    } catch (error) { 
      console.log("tjis",error)
      res.status(500).send({ message: "Error hashing password" });
    }
  });
});

app.post("/get-user-details", verifyToken, async (req, res) => {
  try {
    const query = `SELECT u.id, u.user_name, u.email, u.mobile, u.user_pin,u.created_at, w.main_wallet, w.game_wallet FROM users u INNER JOIN wallet w ON u.user_id = w.user_id WHERE u.email = ?`;
    const result = await queryAsync(query, [req?.body.email]);
    res.status(200).send({
        message: "User Details Retrieved Successfully!",
        user: result[0],
      });
  } catch (error) {
    res.status(500).send({ message: "Internal Server Error" });
  }
});

app.post("/create-pin", verifyToken, async (req, res) => {
  const { pin, email } = req.body;
  if (!pin || !email) {
    return res.status(404).send({ message: "Pin and Email is required !" });
  } else if (pin?.length !== 4) {
    return res.status(302).send({ message: "Pin length must be 4 !" });
  }
  try {
    const query = "UPDATE users SET user_pin = ? WHERE email = ?";
    const result = await queryAsync(query, [pin, email]);
    if (result.affectedRows > 0) {
      res.status(200).send({ message: "Pin Created Success" });
    }
  } catch (error) {
    res.status(500).send({ message: "Internal Server Error !" });
  }
});

app.post("/verify-pin", verifyToken, async (req, res) => {
  const { pin } = req.body;
  if (!pin) {
    return res.status(404).send({ message: "Pin is Required !" });
  }
  try {
    const query = "SELECT * FROM users WHERE email = ?";
    const result = await queryAsync(query, [req.user.email]);
    if (result.length > 0) {
      if (result[0].user_pin === pin) {
        res.status(200).send({ message: "Pin Verified !" });
      } else {
        res.status(403).send({ message: "Pin not verified !" });
      }
    } else {
      res.status(404).send({ message: "User not found" });
    }
  } catch (error) {
    res.status(500).send({ message: "Internal Server Error" });
  }
});

app.post("/add-deposit-request", verifyToken, async (req, res) => {
  const { email, transection_hash, deposit_to, amount } = req?.body;

  if (!email || !transection_hash || !deposit_to || !amount || isNaN(amount) || amount <= 0) {
    return res.status(400).send({ message: "All fields are required!" });
  }

  try {
    // Check that user deposited to our address
    const checkAddressQuery = "SELECT * FROM usdt_address WHERE usdt_address = ?";
    const checkAddressResult = await queryAsync(checkAddressQuery, [deposit_to]);

    if (checkAddressResult.length === 0) {
      return res.status(404).send({ message: "You are not depositing on our address." });
    }

    // Check for duplicate transaction hash
    const duplicateDeposit = "SELECT transection_hash FROM deposit WHERE transection_hash = ?";
    const duplicateDepositResult = await queryAsync(duplicateDeposit, [transection_hash]);

    if (duplicateDepositResult.length > 0) {
      return res.status(400).send({ message: "Transaction Hash Already Exists!" });
    }

    // Check if there's already a pending deposit for this user
    const alreadyDeposit = "SELECT * FROM deposit WHERE user_id = ? AND status = 'P'";
    const alreadyDepositResult = await queryAsync(alreadyDeposit, [req.user.user_id]);

    if (alreadyDepositResult.length > 0) {
      return res.status(409).send({ message: "A deposit request is already in process!" });
    }

    // Insert new deposit request
    const transection_id = `DPST0${req.user.id}${Date.now()}`;
    const user_id = req.user.user_id;
    const insertQuery = "INSERT INTO deposit (user_id, transection_hash, deposit_to, amount, transection_id, type) VALUES (?, ?, ?, ?, ?,?)";
    await queryAsync(insertQuery, [user_id, transection_hash, deposit_to, amount, transection_id, "Pending Despoit"]);
    

    res.status(200).send({ message: "Deposit Request Added Successfully!" });
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Internal Server Error" });
  }
}); 


app.post( "/add-withdrawal-request", verifyToken, verifyPin, async (req, res) => {
    const { email, withdrawal_address, amount } = req.body;

    if ( !email || !withdrawal_address || !amount || isNaN(amount) || amount <= 0) {
      res.status(400).send({ message: "All Fields are Required!" });
    }
 
    try { 
      // find if there is already withdrawal request exists
      const findWithdrawalQuery = "SELECT status FROM withdrawal WHERE email = ? AND status = ?";
      const findWithdrawalResult = await queryAsync(findWithdrawalQuery, [ email, "P",]);
      if (findWithdrawalResult.length > 0) {
        res.status(302).send({ message: "Withdrawal Request Already Exists!" });
      } else {
        const findUserBalanceQuery = "SELECT main_wallet FROM wallet WHERE user_id = ?";
        const findUserBalanceResult = await queryAsync(findUserBalanceQuery, [ req.user.user_id ]);
        if (findUserBalanceResult.length > 0) {
          if (Number(findUserBalanceResult[0].main_wallet) < Number(amount)) { 
            res.status(400).send({ message: "Insufficient Balance!" });
          } else {
            // create new withdrawal request-------------------
            const createWithdrawalQuery = "INSERT INTO withdrawal SET ?";
            const transection_id = `WDST0${req.user.id}${Date.now()}`;
            const createWithdrawalResult = await queryAsync( createWithdrawalQuery, { email, withdrawal_address, amount, transection_id } );
            if (createWithdrawalResult.affectedRows > 0) {
              // deduct wallet balance---------------------------
              const deductWalletBalanceQuery = "UPDATE wallet SET main_wallet = main_wallet - ? WHERE user_id = ?";
              const deductWalletBalanceResult = await queryAsync(
                deductWalletBalanceQuery,
                [amount, req.user.user_id]
              );
              if (deductWalletBalanceResult.affectedRows > 0) {
                // add main statement---------
                const userDetail = await getUserDetail(req.user.email) 
                const type = "Withdrawal"
                const description = "Pending Withdrawal"
                const updated_balance = userDetail.main_wallet
                await addMainStatement(transection_id, type, amount,updated_balance, description, req.user.user_id )
                res.status(200).send({ message: "Withdrawal Request Created Successfully!", });
              } else {
                res.status(500).send({ message: "Internal Server Error" });
              }
            } else {
              res
                .status(500)
                .send({ message: "Withdrawal Request can't be process !" });
            }
          }
        } else {
          res.status(400).send({ message: "Error in checking Balance!" });
        }
      }
    } catch (error) {
        console.log(error)
      res.status(500).send({ message: "Internal Server Error Main" });
    }
  }
);

app.post("/inter-wallet-money-transfer", verifyToken, verifyPin, async (req, res) => {
  const { type, email, amount } = req.body;

  // Validate input fields
  if (!type || !email || !amount || isNaN(amount) || amount <= 0) {
    return res.status(400).send({ message: "All Fields are Required and Amount should be greater than zero!" });
  }

  try {
    const user_id = req.user.user_id;

    // Check user balance in the wallet
    const findUserBalanceQuery = "SELECT * FROM wallet WHERE user_id = ?";
    const findUserBalanceResult = await queryAsync(findUserBalanceQuery, [user_id]);

    if (findUserBalanceResult.length === 0) {
      return res.status(400).send({ message: "No wallet found for the user!" });
    }

    const wallet = findUserBalanceResult[0]; 
    // Transfer from Main Wallet to Game Wallet
    if (type === 1) {
      if (Number(wallet.main_wallet) < Number(amount)) {
        return res.status(400).send({ message: "Insufficient Balance in Main Wallet!" });
      }

      // Deduct from main wallet and add to game wallet
      const deductMainWalletQuery = "UPDATE wallet SET main_wallet = main_wallet - ?, game_wallet = game_wallet + ? WHERE user_id = ?";
      const deductMainWalletResult = await queryAsync(deductMainWalletQuery, [amount, amount, user_id]);

      if (deductMainWalletResult.affectedRows > 0) {
        // Add statement to game_wallet table
        const description = "Received From Main Wallet";
        const game_type = "Received";
        const statementAdded = await addWalletStatement(req.user.id, email, amount, game_type, description, user_id);
        // addd main wallet statement
        const userDetail = await getUserDetail(req.user.email)
        const type = "Money Transfer"
        const description2 = "Sent to Game Wallet"
        const mainStatementAdded = await addMainStatement(statementAdded, type, amount, userDetail.main_wallet,description2, req.user.user_id );
        if (statementAdded || mainStatementAdded) {
          return res.status(200).send({ message: "Money Transferred Successfully!" });
        } else {
          return res.status(500).send({ message: "Failed to add statement to Game Wallet!" });
        }
      } else {
        return res.status(500).send({ message: "Failed to update Wallet balances!" });
      }
    }

    // Transfer from Game Wallet to Main Wallet
    else if (type === 2) {
      if (Number(wallet.game_wallet) < Number(amount)) {
        return res.status(400).send({ message: "Insufficient Balance in Game Wallet!" });
      }

      // Deduct from game wallet and add to main wallet
      const deductGameWalletQuery = "UPDATE wallet SET main_wallet = main_wallet + ?, game_wallet = game_wallet - ? WHERE user_id = ?";
      const deductGameWalletResult = await queryAsync(deductGameWalletQuery, [amount, amount, user_id]);

      if (deductGameWalletResult.affectedRows > 0) {
        // Add statement to game_wallet table
        const description = "Sent to Main Wallet";
        const game_type = "Transfer";
        const statementAdded = await addWalletStatement(req.user.id, email, amount, game_type, description, user_id);
        // addd main wallet statement
        const userDetail = await getUserDetail(req.user.email)
        const type = "Money Transfer"
        const description2 = "Recieved from Game Wallet"
        const mainStatementAdded = await addMainStatement(statementAdded, type, amount, userDetail.main_wallet,description2, req.user.user_id );
        if (statementAdded || mainStatementAdded) {
          return res.status(200).send({ message: "Money Transferred Successfully!" });
        } else {
          return res.status(500).send({ message: "Failed to add statement to Game Wallet!" });
        }
      } else {
        return res.status(500).send({ message: "Failed to update Wallet balances!" });
      }
    } else {
      return res.status(400).send({ message: "Invalid Wallet Type!" });
    }

  } catch (error) {
    console.error("Error during transaction:", error);
    return res.status(500).send({ message: "Internal Server Error!" });
  }
});


app.post("/deduct-game-wallet", verifyToken, async (req, res) => {
  const { data } = req.body;
  
  // Decrypt and parse the request data
  let newData;
  try {
    newData = CryptoJS.AES.decrypt(data, SECRET_KEY_CRYPTO).toString(CryptoJS.enc.Utf8);
  } catch (error) {
    return res.status(400).send({ message: "Invalid data encryption or decryption!" });
  }

  let parsedData;
  try {
    parsedData = JSON.parse(newData);
  } catch (error) {
    return res.status(400).send({ message: "Invalid data format!" });
  }

  const { amount, type, game_type } = parsedData;

  // Input validation
  if (isNaN(amount) || amount <= 0 || !type || !game_type) {
    return res.status(400).send({ message: "All fields are required and amount should always be a positive number!" });
  }

  try {
    if (type === "deduct") {
      // Check game wallet balance
      const findUserBalanceQuery = "SELECT * FROM wallet WHERE user_id = ?";
      const findUserBalanceResult = await queryAsync(findUserBalanceQuery, [req.user.user_id]);

      if (findUserBalanceResult.length === 0) {
        return res.status(404).send({ message: "User wallet not found!" });
      }

      const currentBalance = findUserBalanceResult[0].main_wallet;
      if (currentBalance < amount) {
        return res.status(400).send({ message: "Insufficient Balance!" });
      }

      // Deduct amount from game wallet
      const newBalance = (currentBalance - amount).toFixed(4);  // Ensure no negative balance and set to 4 decimal places
      if (newBalance < 0) {
        return res.status(400).send({ message: "Amount exceeds available balance!" });
      }

      const deductGameWalletQuery = "UPDATE wallet SET main_wallet = ? WHERE user_id = ?";
      const deductGameWalletResult = await queryAsync(deductGameWalletQuery, [newBalance, req.user.user_id]);

      if (deductGameWalletResult.affectedRows > 0) {
        // Add statement in game_wallet table
        const description = "Bet Deducted";
        await addWalletStatement(req.user.id, req.user.email, parseFloat(amount), game_type, description, req.user.user_id);

        return res.status(200).send({ message: "Money Deducted Successfully!" });
      } else {
        return res.status(500).send({ message: "Money can't be deducted!" }); 
      }

    } else if (type === "add") {
      // Add amount to game wallet
      const addGameWalletQuery = "UPDATE wallet SET main_wallet = main_wallet + ? WHERE user_id = ?";
      const addGameWalletResult = await queryAsync(addGameWalletQuery, [parseFloat(amount), req.user.user_id]);

      if (addGameWalletResult.affectedRows > 0) {
        // Add statement in game_wallet table
        const description = "Bet Win Added";
        await addWalletStatement(req.user.id, req.user.email, parseFloat(amount), game_type, description, req.user.user_id);

        return res.status(200).send({ message: "Money Added Successfully!" });
      } else {
        return res.status(500).send({ message: "Money can't be added!" });
      }

    } else {
      return res.status(400).send({ message: "Invalid Type!" });
    }
  } catch (error) {
    console.log(error);
    return res.status(500).send({ message: "Internal Server Error!" });
  }
});



app.post("/get-game-statement", verifyToken, async(req,res)=>{
  const { type } = req.body  
  if(!type){
    return res.status(404).send({ message : "Type not defined !"})
  }
  try {
    const query = "SELECT * FROM game_wallet WHERE email = ? AND game_name = ?"
    const result = await queryAsync(query, [req.user.email, type])
    const newResult = result.map((item) => ({
      ...item,
      description: JSON.parse(item.description),
    }));
    return res.status(200).send(newResult)
  } catch (error) { 
    console.log(error)
    return res.status(500).send({ message: "Internal server Error"})
  }
})

 

app.post('/get-all-game-statement', verifyToken, async(req,res)=>{ 
  try {
    const query = "SELECT * FROM game_wallet WHERE email = ?"
    const result = await queryAsync(query, [req.user.email])
    const newResult = result.map((item) => ({
      ...item,
      description: JSON.parse(item.description),
    }));
    return res.status(200).send(newResult)
  } catch (error) { 
    console.log(error)
    return res.status(500).send({ message: "Internal server Error"})
  }
})


app.post('/get-user-deposit-history', verifyToken, async(req,res)=>{ 
  const { type } = req.body
  if(!type){
    return res.status(404).send({ message: "Please define type !"})
  }
  try {
    if(type === "Deposit"){
      const query = "SELECT * FROM deposit WHERE user_id = ?"
      const result = await queryAsync(query, [req.user.user_id]) 
      return res.status(200).send(result)
    } else if(type === "Withdrawal"){
      const query = "SELECT * FROM withdrawal WHERE email = ?"
      const result = await queryAsync(query, [req.user.email]) 
      return res.status(200).send(result)
    }
  } catch (error) {  
    return res.status(500).send({ message: "Internal server Error"})
  }
})



app.post('/cancel-withdrawal-request', verifyToken, async(req,res)=>{
  const { id } = req.body
  if(!id){
    return res.status(404).send({ message: "Id is required !"})
  }

  try {
    // find withdrwal
    const findWithdrawalQuery = "SELECT * FROM withdrawal WHERE id = ?"
    const withdrawalQueryResult = await queryAsync(findWithdrawalQuery, [id])
    if(withdrawalQueryResult.length === 0){
      return res.status(404).send({ message: "Withdrawal Not Found"})
    } else{
      // check withdrawal status and update
      if(withdrawalQueryResult[0].status === "P"){
        //  update to status "C"
        const query = "UPDATE withdrawal SET status = ? WHERE id = ?"
        const result = await queryAsync(query, ["C", id])
        if(result.affectedRows > 0){
          // add amount in wallet again
          const addAmountQuery = "UPDATE wallet SET main_wallet = main_wallet + ? WHERE user_id = ?"
          const addAmountResult = await queryAsync(addAmountQuery, [withdrawalQueryResult[0].amount, req.user.user_id])
          if(addAmountResult.affectedRows > 0){
            // update in statement table
            const deleteQuery = "DELETE FROM statement WHERE transection_id = ?"
            await queryAsync(deleteQuery, [withdrawalQueryResult[0].transection_id])
            // add new entry 
            const userDetail = await getUserDetail(req.user.email)  
            const type = "Withdrawal"
            const description = "Withdrawal Cancelled"

            await addMainStatement(withdrawalQueryResult[0].transection_id, type, withdrawalQueryResult[0].amount, userDetail.main_wallet, description, userDetail.user_id)
             
            return res.status(200).send({ message : "Withdrawal Request Cancelled !"})
            
          } else{
            return res.status(302).send({ message: "Error in cancelling request !"})
          }
        } else {
          return res.status(500).send({ message: "Error in cancelling request !"})
        }
      } else{
        return res.status(302).send({ message : "Withdrawal Request can't be cancelled !"})
      }
    }
  } catch (error) { 
      console.log(error)
    return res.status(500).send({ message: "Internal Server Error !"})
  }
})


app.post('/get-statement', verifyToken, async (req, res) => {
  try {
    const query1 = "SELECT *  FROM statement WHERE user_id = ?";
    const query2 = "SELECT * FROM deposit WHERE user_id = ? AND status = 'P'";

    const [statementResult, depositResult] = await Promise.all([
      queryAsync(query1, [req.user.user_id]),
      queryAsync(query2, [req.user.user_id])
    ]);

    const combined = [...statementResult, ...depositResult];

    return res.status(200).send(combined);
  } catch (error) {
    console.error("Error fetching combined data:", error);
    return res.status(500).send({ message: "Internal Server Error" });
  }
});


app.post("/user/get-games" ,async(req,res)=>{
  try {
    const gameQuery = "SELECT * FROM games WHERE status = 'Y'"
    const games = await queryAsync(gameQuery, [])
    return res.status(200).send(games)
  } catch (error) {
    return res.status(500).send({ message : "Internal Server Error !"})
  }
})


app.post("/add-match-bet", verifyToken, async (req, res) => {
  console.log(req.body)
  const { match_id, bet_type, bet_value, amount, section_id, selectedTeamName } = req.body; 

  // Validate input fields
  if (!match_id || !bet_type || bet_type.length !== 1 || isNaN(amount) || amount <= 0 || !section_id || !selectedTeamName) {
    return res.status(400).send({ message: "All fields are required and amount should be greater than zero!" });
  }

  try {
    // Find match in the match_table
    const matchQuery = "SELECT * FROM match_table WHERE id = ?";
    const matchQueryResult = await queryAsync(matchQuery, [match_id]);

    if (matchQueryResult.length > 0) {
      const match = matchQueryResult[0];

      // Check if the match is already live or completed
      if (match.status === "LIVE" || match.status === "C") {
        return res.status(400).send({ message: "Match already started, You can place bet now." });
      }

      // Check if betting is open for the match
      if (match.can_place_bet === "N") {
        return res.status(403).send({ message: "Betting hasn't started yet!" });
      }

      // Check user balance
      const userDetail = await getUserDetail(req.user.email);
      if (userDetail.main_wallet < amount) {
        return res.status(400).send({ message: "Insufficient balance!" });
      }

      // Add bet record to match_bets table
      const user_id = userDetail.user_id;
      const win_amount = "";  // Set win_amount to 0 initially (or null if your schema requires it)
      const betQuery = "INSERT INTO match_bets (match_id, bet_type, bet_value, amount, user_id, section_id, win_amount, team_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?)";
      const betResult = await queryAsync(betQuery, [match_id, bet_type, bet_value, amount, user_id, section_id, win_amount, selectedTeamName]);

      if (betResult.affectedRows > 0) {
        // Deduct the bet amount from the user's game wallet
        const walletUpdateQuery = "UPDATE wallet SET main_wallet = main_wallet - ? WHERE user_id = ?";
        await queryAsync(walletUpdateQuery, [amount, req.user.user_id]);

        // Add wallet statement
        const game_name = "Cricket Match";
        const description = "Bet in Match Success";
        await addWalletStatement(req.user.id, req.user.email, parseFloat(amount), game_name, description, req.user.user_id);

        return res.status(200).send({ message: "Bet placed successfully!" });
      } else {
        return res.status(500).send({ message: "Unable to place bet!" });
      }

    } else {
      return res.status(404).send({ message: "Match not found!" });
    }

  } catch (error) {
    console.log(error);
    return res.status(500).send({ message: "Internal Server Error!" });
  }
});


app.post("/my-match-bets", verifyToken, async (req, res) => {
  const { match_id } = req?.body
  if( !match_id ){
    return res.status(400).send({ message: "Match ID is required!" });
  } 
  try {
    const betsQuery = "SELECT * FROM match_bets WHERE user_id = ? AND match_id = ?";
    const bets = await queryAsync(betsQuery, [req.user.user_id, match_id]); 
 
    const enrichedBets = await Promise.all( 
      bets.map(async (bet) => {
        const matchQuery = "SELECT * FROM match_table WHERE id = ?";
        const match = await queryAsync(matchQuery, [bet.match_id]);

        if (match.length > 0) {
          const matchDetails = match[0];

          // Safely parse JSON fields
          try {
            matchDetails.sections = JSON.parse(JSON.parse(matchDetails.sections));
          } catch (e) {
            matchDetails.sections = []; // fallback if parsing fails
          }

          try {
            matchDetails.teams = JSON.parse(matchDetails.teams);
          } catch (e) {
            matchDetails.teams = []; // fallback if parsing fails
          }

          return {
            ...bet,
            match_details: matchDetails
          };
        } else {
          return {
            ...bet,
            match_details: null
          };
        }
      })
    );

    return res.status(200).send(enrichedBets);
  } catch (error) {
    console.error(error);
    return res.status(500).send({ message: "Internal Server Error!" });
  }
});

app.post('/user/get-all-match', async(req,res)=>{ 
  try {
    const query = "SELECT * FROM match_table WHERE visible = 'Y'";
    const result = await queryAsync(query, []);
 
    const parsedResult = result.map(match => { 
      if (match.sections) {
        match.sections = JSON.parse(JSON.parse(match.sections));
      }
 
      if (match.teams) {
        match.teams = JSON.parse(match.teams);
      }

      return match;
    });

    return res.status(200).send(parsedResult);
  } catch (error) {
    return res.status(500).send({ message: "Internal Server Error!" });
  } 
})


 

// admin api
app.post("/admin/login", adminLogin) 
app.post("/admin/token-check", adminTokenCheck)
app.post("/admin/all-deposit-requests", allDepositRequest);
app.post("/admin/approve-deposit-request", approveDepositRequest);
app.post("/admin/decline-deposit-request", rejectDepositRequest);
app.post("/admin/all-withdrawal-request", allWithdrawalRequest)

app.post("/admin/inprocess-withdrawal-request", inprocessWithdrawalRequest);
app.post("/admin/reject-withdrawal-request", rejectWithdrawalRequest) 
app.post("/admin/approve-withdrawal-request", apprveWithdrawalRequest)

 
app.post("/admin/get-games", getGames)
app.post("/admin/update-games/:id", updateGames)


app.post("/admin/add-new-match", upload.array('team_image') ,addNewMatch)

app.post("/admin/get-all-match", getAllMatch)

app.post("/admin/get-single-match-detail", getSingleMatchDetail)

 
app.post("/admin/change-match-status", changeMatchStatus)

app.post("/admin/update-match-results", updateMatchResults)

app.post("/admin/delete-match", deleteMatch)

app.post("/admin/win-loss-match", winLossMatch)

app.post("/admin/get-all-bets", getAllBets)

app.post("/admin/complete-match", completeMatch)

app.post("/admin/update-match-time", updateMatchTime)


app.post("/admin/get-admin-data", getAdminData)


app.post("/admin/get-all-users", getAllUsers)
app.post("/admin/get-user-details", getUserDetails)
app.post("/admin/block-user", updateUserStatus)
app.post("/admin/add-refund", addRefund)
app.post("/admin/get-games-data", getAllGamesData)


const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
 