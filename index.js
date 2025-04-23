import express from 'express';
import bodyParser from 'body-parser';
import mysql from 'mysql2';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import verifyToken from './middleware/authToken.js';
import multer from 'multer';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import  { allDepositRequest, approveDepositRequest, inprocessWithdrawalRequest, rejectDepositRequest }  from "./admin.js" 
import db from './dbConnection.js';
import cors from 'cors'

const app = express();
app.use(cors());

// Recreate __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
 
app.use('/assets', express.static(path.join(__dirname, 'assets')));



// Body parsing middleware
app.use(express.json()); // for parsing application/json
app.use(express.urlencoded({ extended: true })); 
app.use(bodyParser.json());

dotenv.config();

 
// Setup multer storage  
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'assets'); // Save in 'assets' folder
  },
  filename: function (req, file, cb) {
    const uniqueName = Date.now() + '-' + file.originalname;
    cb(null, uniqueName);
  }
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
  const transectionId = `GAME0${Date.now()}${id}`
  try {
     const user_game_wallet_balance  = await queryAsync("SELECT * FROM wallet WHERE user_id = ?", [user_id]); 
     console.log(user_id)
     if(user_game_wallet_balance.length > 0){
       const game_wallet_balance = user_game_wallet_balance[0].game_wallet;   
       const statementQuery =  "INSERT INTO game_wallet (email, amount, game_name, description, updated_balance, transection_id) VALUES (?, ?, ?, ?, ?, ?)"  
       const statementParams = [email, amount, game_name, JSON.stringify(description) || "" , game_wallet_balance, transectionId];
       const statementResult = await queryAsync(statementQuery, statementParams);
       if(statementResult.affectedRows > 0){
          return true;
       } else { return false }
     } else{ 
       return false;
     }
  } 
  catch (error) {
     res.status(500).send({ message: " Error adding wallet statement" });
  }
}

// const query = "INSERT INTO wallet_statement (user_id, amount, game_name, description) VALUES (?, ?, ?, ?)"




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
                res.status(409).send({ message: " Mobile number already exists" });
              }
              if (result.length > 0) {
                return res.status(400).send({ message: "Phone already exists!" });
              } else {
                // create user ----------------
                const hashedPassword = await bcrypt.hash(password, 10);
                const user_id = `UID${mobile}`
                db.query(
                  "INSERT INTO users SET ?",
                  { user_name, email, password: hashedPassword, mobile, user_id },
                  (err, result) => {
                    if (err) throw err;
                    // set wallet balance------- 
                    db.query("INSERT INTO wallet (user_id, main_wallet, game_wallet) VALUES (?,?,?) ON DUPLICATE KEY UPDATE user_id = ?, main_wallet = ?, game_wallet = ?",[user_id, 0,0, user_id,0, 0],(err,result)=>{
                        if(err) { 
                            res.status(500).send({ message: " Error creating user" });
                        } else{
                            res.send({ message: "User created successfully!" });
                        }
                        
                    }) 
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
  const { email, password } = req?.body;
  if (!email || !password) {
    return res.status(400).send({ message: "Email & Password is required" });
  }
  try {
    db.query("SELECT * FROM USERS WHERE email =?", [email], (err, result) => {
      if (err) {
        res.status(409).send({ message: "error" });
      } else {
        if (result.length > 0) {
          const user = result[0];
          const isValidPassword = bcrypt.compareSync(password, user.password);
          if (isValidPassword) { 
            // generate token--------
            const token = jwt.sign(
              { id: user.id, email: user.email, user_id : user.user_id },
              SECRET_KEY,
              { expiresIn: "1h" }
            );
            // set token in database--------
            db.query(
              "INSERT INTO token (token, email) VALUES (?, ?) ON DUPLICATE KEY UPDATE token = ?",
              [token, user.email, token],
              (err, result) => {
                if (err) { 
                  res.status(409).send({ message: "error" });
                } else { 
                  res.status(200).send({
                    message: "Login Successfull!",
                    status: true,
                    token: token,
                  });
                }
              }
            );
          } else {
            res.status(400).send({ message: "Invalid Password!" }); 
          }
        } else {
          res.status(400).send({ message: "Invalid Email!" });
        }
      }
    });
  } catch (error) { 
    res.status(500).send({ message: "Server Down" });
  }
});


app.post("/send-otp", async(req,res)=>{
    const {email} = req?.body;
    if(!email){
        res.status(400).send({message: "Email is required!"});
    }
    const otp = Math.floor(100000 + Math.random() * 900000);
    const query = "INSERT INTO otp (email, otp) VALUES (?, ?) ON DUPLICATE KEY UPDATE otp = ?";
    db.query(query, [email, otp, otp], (err, result) => {
        if (err) { 
            res.status(409).send({ message: "error" });
        } else {
            res.status(200).send({ message: "Otp Sent Successfully!", otp });
        }
    })
})


app.post("/verify-otp", async(req,res)=>{
    const {email, otp} = req?.body;
    if(!email || !otp){
        res.status(400).send({message: "Email and Otp are required!"});
    } else {
        const query = "SELECT * FROM otp WHERE email = ? AND otp = ?";
        db.query(query, [email, otp], (err, result) => {
            if (err) { 
                res.status(409).send({ message: "error" });
            } else {
                if(result.length > 0){
                    const query = "DELETE FROM otp WHERE email = ?";
                    db.query(query, [email], (err, result) => {
                        if (err) {
                            res.status(409).send({ message: "error" });
                        } else{
                            res.status(200).send({ message: "Otp Verified Successfully!" });
                        }
                    })
                } else{
                    res.status(400).send({ message: "Invalid Otp!" });
                }
            }
        })
    }
})



app.get("/get-user-details", verifyToken, async(req,res)=>{
    try {
        const query =  `SELECT u.id, u.user_name, u.email, u.mobile, w.main_wallet, w.game_wallet FROM users u INNER JOIN wallet w ON u.user_id = w.user_id WHERE u.email = ?`
        const result = await queryAsync(query,[req?.body.email]) 
        res.status(200).send({ message: "User Details Retrieved Successfully!", user: result[0] });
    } catch (error) {
        res.status(500).send({ message: "Internal Server Error" });
    }
})



app.post("/add-deposit-request",upload.single('image'), verifyToken, async(req,res)=>{
    const { email, transection_hash, deposit_to, amount} = req?.body;
    const image = req?.file; 
    if(!email || !transection_hash || !image || !deposit_to || !amount || isNaN(amount) || amount <= 0){
        if(image){
          fs.unlinkSync(path.join(__dirname, 'assets', image?.filename));
        }
        res.status(400).send({ message: "All fields are required!" }); 
    } 
    try {
        const duplicateDeposit = "SELECT transection_hash FROM deposit WHERE transection_hash = ?"
        const duplicateDepositResult = await queryAsync(duplicateDeposit, [transection_hash])
        if(duplicateDepositResult.length > 0){
            fs.unlinkSync(path.join(__dirname, 'assets', image.filename));
            res.status(400).send({ message: "Transection Hash Already Exist!" })
        } else {
            const image_url = `/assets/${image.filename}`;
            const query = "INSERT INTO deposit SET ?";
            const transection_id = `DPST0${req.user.id}${Date.now()}`
            const user_id = req.user.user_id
            await queryAsync(query, { user_id, transection_hash, deposit_to ,amount, image_url, transection_id}) 
            res.status(200).send({message: "Deposit Request Added Successfully!"})
        }
    } catch (error) {
        fs.unlinkSync(path.join(__dirname, 'assets', image.filename));
        res.status(500).send({ message : "Internal Server Error" });
    }
})






app.post("/add-withdrawal-request", verifyToken, async (req, res) => {
   const { email, withdrawal_address, amount } = req.body;

   if(!email || !withdrawal_address || !amount || isNaN(amount) || amount <= 0){
     res.status(400).send({ message: "All Fields are Required!"})
   } 

   try {
    // find if there is already withdrawal request exists
    const findWithdrawalQuery = "SELECT status FROM withdrawal WHERE email = ? AND status = ?"
    const findWithdrawalResult = await queryAsync(findWithdrawalQuery, [email, "P"]) 
    if(findWithdrawalResult.length > 0){ 
       res.status(302).send({ message: "Withdrawal Request Already Exists!"})
    } else{  
      const findUserBalanceQuery = "SELECT main_wallet FROM wallet WHERE user_id = ?"
      const findUserBalanceResult = await queryAsync(findUserBalanceQuery, [req.user.user_id])  
      if(findUserBalanceResult.length > 0){ 
        if(findUserBalanceResult[0].main_wallet < amount){
          res.status(400).send({ message: "Insufficient Balance!"})
        } else{
        // create new withdrawal request-------------------
        const createWithdrawalQuery = "INSERT INTO withdrawal SET ?"
        const createWithdrawalResult = await queryAsync(createWithdrawalQuery, { email, withdrawal_address, amount})
        if(createWithdrawalResult.affectedRows > 0){
          // deduct wallet balance---------------------------
          const deductWalletBalanceQuery = "UPDATE wallet SET main_wallet = main_wallet - ? WHERE user_id = ?"
          const deductWalletBalanceResult = await queryAsync(deductWalletBalanceQuery, [amount, req.user.user_id])
          if(deductWalletBalanceResult.affectedRows > 0){
            res.status(200).send({message: "Withdrawal Request Created Successfully!"})
          } else {
            res.status(500).send({ message: "Internal Server Error" });
          }
        } else{
            res.status(500).send({ message: "Withdrawal Request can't be process !" })
        }
      }
    } else{ 
      res.status(400).send({ message: "Error in checking Balance!"})
    }
    }  
   } catch (error) { 
    res.status(500).send({ message: "Internal Server Error Main" });
   }
})




app.post("/inter-wallet-money-transfer", verifyToken, async (req, res) => {
  const { type, email, amount } = req.body
  // type Main wallet = M, Game Wallet = G;
  if (!type || !email || !amount || isNaN(amount) || amount <= 0) {
    res.status(400).send({ message: "All Fields are Required!" })
  }

  try {
    // transfer from main wallet to game wallet-------------------
    if(type === 1){ 
      const findUserBalanceQuery = "SELECT * FROM wallet WHERE user_id = ?"
      const findUserBalanceResult = await queryAsync(findUserBalanceQuery, [req.user.user_id])
      if(findUserBalanceResult.length > 0){
        if(findUserBalanceResult[0].main_wallet < amount){
          res.status(400).send({ message: "Insufficient Balance!"})
        } else{
          // deduct main wallet---------------------------
          const deductMainWalletQuery = "UPDATE wallet SET main_wallet = main_wallet - ? , game_wallet = game_wallet + ? WHERE user_id = ?"
          const deductMainWalletResult = await queryAsync(deductMainWalletQuery, [amount, amount, req.user.user_id])
          if(deductMainWalletResult.affectedRows > 0){
            // add statement in game_wallet table-------------
            const description = "Received From Main Wallet"
            const game_type = "Received"
            await addWalletStatement(req.user.id, req.user.email, amount, game_type, description, req.user.user_id) 
            res.status(200).send({message: "Money Transfered Successfully!"})
          } else{
            res.status(500).send({ message: "Money Can't be transfered!" });
          }
        }
      }
    }

    // transfer from game wallet to main wallet-------------------
    else if(type === 2){
      const findUserBalanceQuery = "SELECT * FROM wallet WHERE user_id = ?"
      const findUserBalanceResult = await queryAsync(findUserBalanceQuery, [req.user.user_id])
      if(findUserBalanceResult.length > 0){
        if(findUserBalanceResult[0].game_wallet < amount){
          res.status(400).send({ message: "Insufficient Balance!"})
        } else{
          // deduct main wallet---------------------------
          const deductMainWalletQuery = "UPDATE wallet SET main_wallet = main_wallet + ? , game_wallet = game_wallet - ? WHERE user_id = ?"
          const deductMainWalletResult = await queryAsync(deductMainWalletQuery, [amount, amount, req.user.user_id])
          if(deductMainWalletResult.affectedRows > 0){
             // add statement in game_wallet table-------------
             const description = "Sent to Main Wallet"
             const game_type = "Transfer"
             await addWalletStatement(req.user.id, req.user.email, amount, game_type, description, req.user.user_id)
            res.status(200).send({message: "Money Transfered Successfully!"})
          } else{
            res.status(500).send({ message: "Money Can't be transfered!" });
          }
        }
      }
    } else{
      res.status(400).send({ message: "Invalid Type!" })
    }
  } catch (error) {
    res.status(500).send({ message: "Internal Server Error" });
  }
})



app.post("/deduct-game-wallet", verifyToken, async (req, res) => {
  const { amount, email, type, game_type } = req.body;
  if(!email || isNaN(amount) || amount <= 0 || !type || !game_type){
    res.status(400).send({ message: "All fields are required and amount should always be a positive number!" });
  } 

  try {
    if(type === "deduct"){
      // check game wallet balance-------------
      const findUserBalanceQuery = "SELECT * FROM wallet WHERE email = ?"
      const findUserBalanceResult = await queryAsync(findUserBalanceQuery, [email])
      if(findUserBalanceResult.length > 0){
        if(findUserBalanceResult[0].game_wallet < amount){
          res.status(400).send({ message: "Insufficient Balance!"})
        } else{
          // deduct game wallet---------------------------
          const deductGameWalletQuery = "UPDATE wallet SET game_wallet = game_wallet - ? WHERE email = ?"
          const deductGameWalletResult = await queryAsync(deductGameWalletQuery, [amount, email]) 
          if(deductGameWalletResult.affectedRows > 0){
            // add statement in game_wallet table-------------
            const description = "Add Bet"
            await addWalletStatement(req.user.id, req.user.email, amount, game_type, description, req.user.user_id) 
            res.status(200).send({ message: "Money Deducted Successfully!"})
          } else{
            res.status(500).send({ message: "Money Can't be deducted!" });
          }
        }
      }
    } else if(type === "add"){
      // add game wallet---------------------------
      const addGameWalletQuery = "UPDATE wallet SET game_wallet = game_wallet + ? WHERE email = ?"
      const addGameWalletResult = await queryAsync(addGameWalletQuery, [amount, email])
      if(addGameWalletResult.affectedRows > 0){
        // add statement in game_wallet table-------------
        const description = "win Bet"
        await addWalletStatement(req.user.id, req.user.email, amount, game_type, description, req.user.user_id) 
        res.status(200).send({message: "Money Added Successfully!"})
      } else{
        res.status(500).send({ message: "Money Can't be added!" });
      }
    } else{
      res.status(400).send({ message: "Invalid Type!" });
    }
  } catch (error) {
    res.status(500).send({ message: "Internal Server Errorr" });
  }
})



// admin api
app.post("/admin/all-deposit-requests" , allDepositRequest)
app.post("/admin/approve-deposit-request",  approveDepositRequest)
app.post("/admin/decline-deposit-request" , rejectDepositRequest)

app.post("/admin/inprocess-withdrawal-request" , inprocessWithdrawalRequest)



 

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
