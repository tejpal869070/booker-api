import db from "./dbConnection.js";
const SECRET_KEY = process.env.SECRET_KEY;
import jwt from "jsonwebtoken";
import cron from 'node-cron';
import axios from 'axios';
import moment from 'moment'; 
import { matchJobs } from "./modules/jobScheduler.js";



function queryAsync(query, params) {
    return new Promise((resolve, reject) => {
        db.query(query, params, (error, results) => {
            if (error) reject(error);
            else resolve(results);
        });
    });
} 

async function getUserDetail(user_id) {
    if(!user_id){
      return false
    }
    try {
      const query = `SELECT u.id, u.user_name, u.email, u.mobile, u.user_pin, u.user_id, w.main_wallet, w.game_wallet FROM users u INNER JOIN wallet w ON u.user_id = w.user_id WHERE u.user_id = ?`;
      const result = await queryAsync(query, [user_id]);
      return result[0]
    } catch (error) {
      throw error
    }
  }


  // game wallet statement add function--------------
async function addWalletStatement( id, email, amount, game_name, description, user_id) {
  const transectionId = `GAME0${id}${Date.now()}`;
  try {
    const user_game_wallet_balance = await queryAsync( "SELECT * FROM wallet WHERE user_id = ?", [user_id] ); 
    if (user_game_wallet_balance.length > 0) {
      const game_wallet_balance = user_game_wallet_balance[0].game_wallet;
      const statementQuery = "INSERT INTO game_wallet (email, amount, game_name, description, updated_balance, transection_id) VALUES (?, ?, ?, ?, ?, ?)";
      const statementParams = [ email, amount, game_name, JSON.stringify(description) || "", parseFloat(game_wallet_balance), transectionId ];
      const statementResult = await queryAsync(statementQuery, statementParams); 
      if (statementResult.affectedRows > 0) {
        return true;
      } else {
        return false;
      }
    } else {
      return false;
    }
  } catch (error) { 
    throw error
  }
}


  async function getUserDetailEmail(email) {
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
  
  
async function adminTokenCheck(req, res) {
  const authHeader = req.headers['authorization'];
  const { username } = req.body

  if (!authHeader || !username) {
    return res.status(401).send({ message: "Authorization header missing." });
  }

  // Expected format: "Bearer <token>"
  const token = authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).send({ message: "Token missing from Authorization header." });
  }

  try {
    const decoded = jwt.verify(token, SECRET_KEY);

    if (decoded.username === "admin" && decoded.role === "admin") {
      res.status(200).send({ message: "Token is valid." });
    } else {
      res.status(403).send({ message: "Invalid token payload." });
    }
  } catch (error) { 
    res.status(401).send({ message: "Token verification failed.", error: error.message });
  }
}
  


async function allDepositRequest(req,res) { 
    try {
        const query = "SELECT * FROM deposit";
        const params = [];
        const results = await queryAsync(query, params); 
        return res.status(200).send( results )
         
    } catch (error) {
        return res.status(500).send({ message: "Internal Server Error" });
    }
}



async function allWithdrawalRequest(req,res) { 
  try {
      const query = "SELECT * FROM withdrawal";
      const params = [];
      const results = await queryAsync(query, params); 
      return res.status(200).send( results )
       
  } catch (error) {
      return res.status(500).send({ message: "Internal Server Error" });
  }
}
 


async function addMainStatement(transection_id, type, amount, updated_balance,	description, user_id ) {
    if (!type || !amount || !updated_balance ||	!description || !transection_id){
      return res.status(404).send({ message: "All fields are required !"})
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
      return false;
    }
  }



  async function adminLogin(req, res) {
    const { username, password } = req.body; // Assume that login credentials are sent in the body
  
    // Validate credentials
    if (username.toLowerCase() === "admin" && password === "111111") {
      try {
        // Generate JWT token
        const token = jwt.sign(
          { username: "admin", role: "admin" }, // Payload
          SECRET_KEY, // Secret key for signing the token
          { expiresIn: "24h" } // Token expiration time (24 hours)
        );
  
        // Send response with JWT token
        res.status(200).send({
          message: "Login successful!",
          token: token
        });
      } catch (error) {
        res.status(500).send({
          message: "Error generating token.",
          error: error.message
        });
      }
    } else {
      res.status(401).send({ message: "Invalid credentials!" });
    }
  }


async function approveDepositRequest(req,res) { 
    const { id } = req?.body;
      try {
        const findIdQuery = "SELECT * FROM deposit WHERE id = ?";
        const findIdResult = await queryAsync(findIdQuery, [id]) 
        if(findIdResult.length > 0){ 
           const checkPendingStatusQuery = "SELECT status FROM deposit WHERE id = ?";
           const checkPendingStatusResult = await queryAsync(checkPendingStatusQuery, [id])
            //check deposit status----------------------------
           if(checkPendingStatusResult[0].status ==="R"){
             return res.status(302).send({ message: "Deposit Request is Rejected!"})
           } else if(checkPendingStatusResult[0].status ==="S"){
             return res.status(302).send({ message: "Deposit Request Already Success!"})
           } else{
             const updateStatusQuery = "UPDATE deposit SET status = ? WHERE id = ?";
             await queryAsync(updateStatusQuery, ["S", id])
             //update wallet balance-----------------------
            const updateWalletBalanceQuery = "UPDATE wallet SET main_wallet = main_wallet + ? WHERE user_id = ?" 
            const updateWalletBalanceResult = await queryAsync(updateWalletBalanceQuery, [findIdResult[0].amount, findIdResult[0].user_id])
            if( updateWalletBalanceResult.affectedRows > 0 ){
                const userDetail = await getUserDetail(findIdResult[0].user_id) 
                const type = "Deposit"
                const description = "Deposit Success"
                const updated_balance = userDetail.main_wallet
                await addMainStatement(findIdResult[0].transection_id, type, findIdResult[0].amount,updated_balance, description, findIdResult[0].user_id )
              return res.status(200).send({message: "Deposit Request Approved Successfully!"})
            } else {
              return res.status(500).send({ message: "Wallet Balance Not Updated"})
            }
           }
        } else{
          return res.status(400).send({ message: "Invalid Request!"})
        }
      } catch (error) {
        
        return res.status(500).send({ message: "Internal Server Error Main" });
      }
}


async function rejectDepositRequest(req,res) {
    const { id, reason } = req?.body;
    if(!id || !reason){
        return res.status(400).send({ message: "Id & Reason are must !"})
    }
    try {
        const findIdQuery = "SELECT * FROM deposit WHERE id = ?";
        const findIdResult = await queryAsync(findIdQuery, [id]) 
        if(findIdResult.length > 0){
            if(findIdResult[0].status ==="P"){
                const query = "UPDATE deposit SET status = ?, reason = ? WHERE id = ?";
                const result = await queryAsync(query, ["R", JSON.stringify(reason), id])
                if(result.affectedRows > 0){
                    return res.status(200).send({ message: "Deposit Request Rejected Successfully!"})
                } else {
                    return res.status(500).send({ message: "Deposit Request Not Rejected" })
                }
            } else{
                return res.status(302).send({ message: "Deposit Request is Already Rejected or Success"})
            }
        } else{
            return res.status(400).send({ message: "Deposit Request Not Found!"})
        }
    } catch (error) {
        console.log(error)
        return res.status(500).send({ message: "Internal Server Error" });
    }
}


async function inprocessWithdrawalRequest(req, res) {
    const { id } = req?.body;
    if (!id) {
        return res.status(400).send({ message: "Id is required!" });
    }
    try {
        const findWithdrawalQuery = "SELECT * FROM withdrawal WHERE id = ?";
        const findWithdrawalResult = await queryAsync(findWithdrawalQuery, [id]);
        if (findWithdrawalResult.length > 0) {
            const findStatus = findWithdrawalResult[0].status
            if (findStatus === "P") {
                const query = "UPDATE withdrawal SET status = ? WHERE id = ?";
                const result = await queryAsync(query, ["I", id]);
                if (result.affectedRows > 0) {
                    return res.status(200).send({ message: "Withdrawal Request is now in process." });
                } else {
                    return res.status(500).send({ message: "Withdrawal Request Not Updated" });
                }
            } else{
                return res.status(302).send({ message: "Withdrawal Request is Already Approved, Rejected or Cancelled" });
            }
        } else{
            return res.status(400).send({ message: "Withdrawal Request Not Found!" });
        }
    } catch (error) {
      console.log(error)
        return res.status(500).send({ message: "Internal Server Error" });
    }
}




async function rejectWithdrawalRequest(req,res) {
    const { id, reason } = req.body
    if(!id || !reason){
      return res.status(404).send({ message : "Id & Reason is required"})
    } 

    try {
      // find withdrawal request
      const withdrawalQuery = "SELECT * FROM withdrawal WHERE id = ?"
      const withdrawalQueryResult = await queryAsync(withdrawalQuery, [id]) 
      if(withdrawalQueryResult.length > 0){
        // check status
        if(withdrawalQueryResult[0].status === "P" || withdrawalQueryResult[0].status === "I"){
          // set to rejected
          const updateQuery = "UPDATE withdrawal SET status = ?, reason = ? WHERE id = ?" 
          const updateQueryResult = await queryAsync(updateQuery, ["R", reason, id])
          if(updateQueryResult.affectedRows > 0){
            // ROLLBACK
            const userDetail = await getUserDetailEmail(withdrawalQueryResult[0].email)  
            const addAmountQuery = "UPDATE wallet SET main_wallet = main_wallet + ? WHERE user_id = ?"
            const addAmountResult = await queryAsync(addAmountQuery, [withdrawalQueryResult[0].amount, userDetail.user_id])
            if(addAmountResult.affectedRows > 0){
              // delete in statement table
              const deleteQuery = "DELETE FROM statement WHERE transection_id = ?"
              await queryAsync(deleteQuery, [withdrawalQueryResult[0].transection_id])
              // make new statemtn
              const type = "Withdrawal"
              const description = "Withdrawal Rejected"
              const currentUserDetail = await getUserDetailEmail(withdrawalQueryResult[0].email)
              await addMainStatement(withdrawalQueryResult[0].transection_id, type, withdrawalQueryResult[0].amount, currentUserDetail.main_wallet, description, userDetail.user_id)
              return res.status(200).send({ message: "Withdrawal Request Rejected !"})
            }
            else{
              return res.status(302).send({ message: "Error in cancelling request !"})
            } 
          } else{
            return res.status(504).send({ message : "Erorr in Rejecting"})
          }
        } else{
          return res.status(309).send({ message : "Request is already Rejecte or Cancelled"})
        }
      } else {
        res.status(404).send({ message : "Request not found"})
      }
    } catch (error) {
        console.log(error)
      return res.status(500).send({ message : "Internal Server Error !"})
    }
}




async function apprveWithdrawalRequest(req,res) {
  const { id } = req.body
  if(!id){
    return res.status(404).send({ message:" Id is required !"})
  }

  try {
    // check status
    const withdrawalQuery = "SELECT * FROM withdrawal WHERE id = ?"
    const withdrawalQueryResult = await queryAsync(withdrawalQuery, [id])
    if(withdrawalQueryResult.length > 0){
      if(withdrawalQueryResult[0].status === "I"){

        const updateQuery = "UPDATE withdrawal SET status = ? WHERE id = ?"
        const updateQueryResult = await queryAsync(updateQuery, ["S", id])
        if(updateQueryResult.affectedRows > 0){
          //  update statement table
              const deleteQuery = "DELETE FROM statement WHERE transection_id = ?"
              await queryAsync(deleteQuery, [withdrawalQueryResult[0].transection_id])
              const type = "Withdrawal"
              const description = "Withdrawal Success"
              const userDetail = await getUserDetailEmail(withdrawalQueryResult[0].email)
              await addMainStatement(withdrawalQueryResult[0].transection_id, type, withdrawalQueryResult[0].amount, userDetail.main_wallet, description, userDetail.user_id)
              return res.status(200).send({ message: "Withdrawal Request Success !"})
        } else {
          return res.status(309).send({ message : "Not Updated !"})
        }
      } else {
        return res.status(309).send({ message : "Withdrawal request not in process"})
      }
    }
    else {
      res.status(404).send({ message : "Request not found"})
    }
  } catch (error) {
    
  }
}


async function getGames(req,res) {
  try {
    const gameQuery = "SELECT * FROM games"
    const games = await queryAsync(gameQuery, [])
    return res.status(200).send(games)
  } catch (error) {
    return res.status(500).send({ message : "Internal Server Error !"})
  }
}


async function updateGames(req,res) {
  const { id } = req.params; 
  const { status } = req.body
  if(!id || !status || (status !== 'Y' && status !== 'N')){
    return res.status(404).send({ message : "Id and Status is required !"})
  }

  try {
    const query = 'UPDATE games SET status = ? WHERE id = ?';
    const result = await queryAsync(query, [status, id])
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Game not found' });
    }
    return res.status(200).json({ message: 'Game status updated successfully' });
  } catch (error) {
    console.log(error)
    return res.status(500).send({ message : "Internal Server Error !"})
  }
  
}


async function addNewMatch(req, res) {
  const { match_time, sections, teams, title } = req.body;

  if (!match_time || !sections || !teams || !title) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  let parsedTeams;
  try {
    parsedTeams = typeof teams === 'string' ? JSON.parse(teams) : teams;
  } catch (error) {
    return res.status(400).json({ message: 'Invalid teams format' });
  }

  const teamImageFilenames = req.files ? req.files.map(file => file.filename) : [];

  if (teamImageFilenames.length > 0) {
    parsedTeams.forEach((team, index) => {
      if (teamImageFilenames[index]) {
        team.image = teamImageFilenames[index];
      }
    });
  }

  try {
    const insertQuery = `
      INSERT INTO match_table (match_time, sections, teams, title, result)
      VALUES (?, ?, ?, ?, ?)
    `;
    const insertValues = [
      match_time,
      JSON.stringify(sections),
      JSON.stringify(parsedTeams),
      title,
      "Y"
    ];

    const result = await queryAsync(insertQuery, insertValues);

    if (result.affectedRows > 0) {
      const matchId = result.insertId;

      // Calculate time 10 minutes before match_time
      const scheduleTime = moment(match_time).subtract(10, 'minutes');
      const cronExpression = `${scheduleTime.minute()} ${scheduleTime.hour()} ${scheduleTime.date()} ${scheduleTime.month() + 1} *`;
 
      const job = cron.schedule(cronExpression, async () => {
        try {
            await changeMatchStatusLogic({
              id: matchId,
              status: 'LIVE',
              can_bet_place: 'N'
            });
            console.log(`Cron triggered: Match ${matchId} is now LIVE.`);
        } catch (err) {
            console.error(`Cron error for match ${matchId}:`, err.message);
        }
        });

      matchJobs[matchId] = job;

      return res.status(200).json({ message: "Match Added and Cron Job Scheduled Successfully." });
    } else {
      return res.status(409).json({ message: "Failed to insert match." });
    }
  } catch (error) {
    console.error("Internal Server Error:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
}



async function updateMatchTime(req, res) {
  const { match_id, match_time } = req.body;

  if (!match_id || !match_time) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  try {
    // 1. Check if match exists
    const checkQuery = `SELECT id FROM match_table WHERE id = ?`;
    const checkResult = await queryAsync(checkQuery, [match_id]);

    if (checkResult.length === 0) {
      return res.status(404).json({ message: "Match not found" });
    }

    // 2. Update match time, status and can_place_bet
    const updateQuery = `
      UPDATE match_table 
      SET match_time = ?, status = 'UC', can_place_bet = 'N' 
      WHERE id = ?
    `;
    const values = [match_time, match_id];
    const updateResult = await queryAsync(updateQuery, values);

    if (updateResult.affectedRows === 0) {
      return res.status(409).json({ message: "Error in updating match time" });
    }

    // 3. Cancel existing scheduled job if exists
    if (matchJobs[match_id]) {
      matchJobs[match_id].stop();
      delete matchJobs[match_id];
      console.log(`Previous job for match ${match_id} cancelled`);
    }

    // 4. Schedule new cron job for 10 minutes before updated match_time
    const tenMinBefore = moment(match_time).subtract(10, 'minutes');
    const cronExpression = `${tenMinBefore.minute()} ${tenMinBefore.hour()} ${tenMinBefore.date()} ${tenMinBefore.month() + 1} *`;

    const job = cron.schedule(cronExpression, async () => {
      try {
        await changeMatchStatusLogic({
          id: match_id,
          status: 'LIVE',
          can_bet_place: 'N'
        });
        console.log(`Match ${match_id} status set to LIVE (rescheduled)`);
      } catch (err) {
        console.error(`Failed to update match ${match_id} in cron:`, err.message);
      }
    }); 

    matchJobs[match_id] = job;

    return res.status(200).json({ message: "Match Time Updated & Cron Rescheduled" });
 
  } catch (error) { 
    console.error("Update match time error:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
} 
 


 
async function getAllMatch(req, res) { 
  try {
    const query = "SELECT * FROM match_table";
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
    console.log(error)
    return res.status(500).send({ message: "Internal Server Error!" });
  }
}


async function getSingleMatchDetail (req,res){
  const { id } = req.body
  if(!id){
    return res.status(404).send({ message : "Id is required !"})
  }
  try {
    // find match
    const findyQuery = "SELECT * FROM match_table WHERE id = ?"
    const queryResult = await queryAsync(findyQuery, [id])
    if(queryResult.length > 0){
      queryResult[0].sections = JSON.parse(JSON.parse(queryResult[0].sections));
      queryResult[0].teams = JSON.parse(queryResult[0].teams);
      return res.status(200).send(queryResult[0])
    } else {
      return res.status(404).send({ message : "No match found !"})
    }
  } catch (error) {
    return res.status(500).send({ message : "Internal server error !"})
  }
}


async function changeMatchStatusLogic({ id, status, can_bet_place, visible = "Y" }) {
  if (!id || !status) {
    throw new Error("Id & status are required!");
  }

  const findQuery = "SELECT * FROM match_table WHERE id = ?";
  const match = await queryAsync(findQuery, [id]);

  if (match.length === 0) {
    throw new Error("No match found!");
  }

  const updateQuery = "UPDATE match_table SET status = ?, can_place_bet = ?, visible = ? WHERE id = ?";
  const updateResult = await queryAsync(updateQuery, [status, can_bet_place, visible , id]);

  if (updateResult.affectedRows > 0) {
    return { success: true, message: "Match is Live Now!" };
  } else {
    throw new Error("Error in making match live!");
  }
}



async function changeMatchStatus(req, res) {
  try {
    const result = await changeMatchStatusLogic(req.body);
    return res.status(200).send({ message: result.message });
  } catch (err) {
    if (err.message.includes('No match')) {
      return res.status(404).send({ message: err.message });
    } else if (err.message.includes('required')) {
      return res.status(400).send({ message: err.message });
    } else {
      return res.status(500).send({ message: err.message });
    }
  }
}


async function updateMatchResults(req, res) {
  const { match_id, section_id, result, team_name } = req.body;

  // Validate the incoming request body
  if (!section_id || !match_id || result === undefined || !team_name) {
    return res.status(400).send({ message: "All fields are required!" });
  }

  try {
    // Fetch match from the database
    const findQuery = "SELECT * FROM match_table WHERE id = ?";
    const queryResult = await queryAsync(findQuery, [match_id]);

    if (queryResult.length === 0) {
      return res.status(404).send({ message: "No match found!" });
    }

    // Parse sections from the match
    let match = queryResult[0];
    let sections = JSON.parse(JSON.parse(match.sections)); // Sections are stored as stringified JSON

    // Find the section to update
    const sectionIndex = sections.findIndex(sec => sec.id === Number(section_id));
    if (sectionIndex === -1) {
      return res.status(404).send({ message: "Section not found!" });
    }

    // Ensure the section has a result array, if not, initialize it
    const section = sections[sectionIndex];
    if (!section.result) {
      section.result = []; // Initialize result as an empty array if it doesn't exist
    }

    // Check if the team already exists in the result array
    const existingResultIndex = section.result.findIndex(r => r.team_name === team_name);

    if (existingResultIndex === -1) {
      // If team_name doesn't exist, add it
      section.result.push({ team_name, score: result });
    } else {
      // If team_name exists, update the score
      return res.status(302).send({ message : "Already updated"})
    }

    // Update match in the database with the new sections data
    const updateQuery = "UPDATE match_table SET sections = ? WHERE id = ?";
    await queryAsync(updateQuery, [JSON.stringify(JSON.stringify(sections)), match_id]);

    return res.status(200).send({ message: "Match section result updated successfully!" });

  } catch (error) {
    console.error(error);
    return res.status(500).send({ message: "Internal server error!" });
  }
}






async function deleteMatch(req, res) {
  const { id } = req.body;
  if(!id){
    return res.status(404).send({ message : "Id is required !"})
  }

  try {
    // 1. Check if match exists
    const findQuery = "SELECT * FROM match_table WHERE id = ?";
    const matchResult = await queryAsync(findQuery, [id]);

    if (matchResult.length === 0) {
      return res.status(404).send({ message: 'Match not found' });
    }

    // 2. Check for related match_bets
    const betsQuery = "SELECT * FROM match_bets WHERE match_id = ?";
    const betsResult = await queryAsync(betsQuery, [id]);

    if (betsResult.length > 0) {
      return res.status(400).send({ message: 'Cannot delete match with existing bets' });
    }

    // 3. Delete the match
    const deleteQuery = "DELETE FROM match_table WHERE id = ?";
    await queryAsync(deleteQuery, [id]);

    res.status(200).send({ message: 'Match deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: 'Internal server error' });
  }
}



async function winLossMatch(req, res) {
  const { id, section_id, team_name } = req.body;
  if (!id || !section_id) {
    return res.status(404).send({ message: "Id is required!" });
  }

  try {
    // Check if match exists
    const findQuery = "SELECT * FROM match_table WHERE id = ?";
    const matchData = await queryAsync(findQuery, [id]);

    if (matchData.length === 0) {
      return res.status(404).send({ message: 'Match not found' });
    }

    // Find all bets by match id and section id
    const matchQuery = "SELECT * FROM match_bets WHERE match_id = ? AND section_id = ?";
    const matchBetsResult = await queryAsync(matchQuery, [id, section_id]);

    // Parse sections
    const match = matchData[0];
    const section = JSON.parse(JSON.parse(match.sections))?.find(
      i => Number(i.id) === Number(section_id)
    );

    if (!section) {
      return res.status(404).send({ message: 'Section not found' });
    }

    const winningUsers = [];  
    const sectionResult = section.result?.find(i=> i.team_name===team_name)?.score;
    const lastDigit = sectionResult.toString().slice(-1);

    for (let bet of matchBetsResult) {
      const isExact = bet.bet_type === 'E' && Number(bet.bet_value) === Number(sectionResult);
      const isLastDigit = bet.bet_type === 'L' && Number(bet.bet_value) === Number(lastDigit);
    
      if (isExact || isLastDigit) {
        winningUsers.push(bet);
    
        // Get user's wallet
        const walletQuery = "SELECT * FROM wallet WHERE user_id = ?";
        const walletResult = await queryAsync(walletQuery, [bet.user_id]);
    
        if (walletResult.length > 0) {
          const wallet = walletResult[0];
    
          // Calculate amount won based on bet type
          const amountWon = bet.bet_type === 'E' 
            ? Number(bet.amount) * 20  // change to desireed multiply
            : Number(bet.amount) * 9;
    
          const newBalance = Number(wallet.game_wallet) + amountWon;
    
          // Update wallet balance
          const updateWalletQuery = "UPDATE wallet SET main_wallet = ? WHERE user_id = ?";
          await queryAsync(updateWalletQuery, [newBalance, bet.user_id]);
    
          // Update win_amount in match_bets
          const updateBetQuery = "UPDATE match_bets SET win_amount = ? WHERE id = ?";
          await queryAsync(updateBetQuery, [amountWon, bet.id]);
    
          // Update game wallet statement
          const userDetail = await getUserDetail(bet.user_id);
          const game_name = "Match";
          const description = "Match Win";
          await addWalletStatement(
            userDetail.id,
            userDetail.email,
            amountWon,
            game_name,
            description,
            userDetail.user_id
          );
        }
      } else{
          const updateLossQuery = "UPDATE match_bets SET win_amount = 0 WHERE id = ?";
          await queryAsync(updateLossQuery, [bet.id]);
      }
    }
    

    return res.status(200).send({ winners: winningUsers });

  } catch (error) { 
    console.log(error)
    res.status(500).send({ message: 'Internal server error' });
  }
}


async function completeMatch(req, res) {
  const { id } = req.body;

  if (!id) {
    return res.status(400).send({ message: "Match ID is required" });
  }

  try {
    // Check if match exists
    const matchQuery = "SELECT * FROM match_table WHERE id = ?";
    const matchData = await queryAsync(matchQuery, [id]);

    console.log(matchData)

    if (matchData.length === 0) {
      return res.status(404).send({ message: 'Match not found' });
    }

    // Get all unprocessed bets for the match
    const matchBetsQuery = "SELECT * FROM match_bets WHERE match_id = ? AND (win_amount IS NULL OR win_amount = '')";
    const matchBets = await queryAsync(matchBetsQuery, [id]); 

    const refundedUsers = [];

    for (const bet of matchBets) {
      const walletQuery = "SELECT * FROM wallet WHERE user_id = ?";
      const walletResult = await queryAsync(walletQuery, [bet.user_id]);

      if (walletResult.length > 0) {
        const wallet = walletResult[0];
        const refundAmount = Number(bet.amount);
        const newBalance = Number(wallet.game_wallet) + refundAmount;

        // Update user's wallet
        const updateWalletQuery = "UPDATE wallet SET game_wallet = ? WHERE user_id = ?";
        await queryAsync(updateWalletQuery, [newBalance, bet.user_id]);

        // Mark bet as refunded (win_amount = -1)
        const updateBetQuery = "UPDATE match_bets SET win_amount = ? WHERE id = ?";
        await queryAsync(updateBetQuery, [refundAmount, bet.id]);

       

        // Add wallet statement
        const userDetail = await getUserDetail(bet.user_id);
        const game_name = "Match";
        const description = "Refunded Unprocessed Bet";

        await addWalletStatement(
          userDetail.id,
          userDetail.email,
          refundAmount,
          game_name, 
          description,
          userDetail.user_id
        );

        refundedUsers.push({ 
          user_id: bet.user_id,
          amount: refundAmount,
          bet_id: bet.id
        });
      }
    }

    // update match status
    let updateMatchQuery = "UPDATE match_table SET status = ? , can_place_bet = ? WHERE id = ?";
    await queryAsync(updateMatchQuery, ["C","N", id]); 

    // change visibility to N after two days
    const twoDaysLater = moment().add(2, 'minutes'); // 2 days after now

    const cronExpression = `${twoDaysLater.minute()} ${twoDaysLater.hour()} ${twoDaysLater.date()} ${twoDaysLater.month() + 1} *`;

    cron.schedule(cronExpression, async () => {
      try {
        await changeMatchStatusLogic({
          id: id,
          status: 'C', // or keep current status
          can_bet_place: 'N', // optional depending on your logic
          visible: "N"
        });
        console.log(`✅ Match ${id} visibility set to 'N' after 2 days.`);
      } catch (err) {
        console.error(`❌ Failed to update match ${id} visibility in cron:`, err.message);
      }
    });


    return res.status(200).send({
      message: "Match completed. All unprocessed bets refunded.",
      refunded: refundedUsers
    });

  } catch (error) {
    console.error(error);
    return res.status(500).send({ message: 'Internal server error' });
  }
}





async function getAllBets(req, res) {
  const { id } = req.body;
  if (!id) {
    return res.status(404).send({ message: "Id is required!" });
  }

  try {
    const betsQuery = "SELECT * FROM match_bets WHERE match_id = ?";
    const bets = await queryAsync(betsQuery, [id]);

    // Check if no bets were found
    if (bets.length === 0) {
      return res.status(200).send([]);
    }

    // Get unique user_ids
    const userIds = [...new Set(bets.map(bet => bet.user_id))];

    // Fetch all user details at once
    const placeholders = userIds.map(() => '?').join(','); 
    const usersQuery = `SELECT * FROM users WHERE user_id IN (${placeholders})`;
    const users = await queryAsync(usersQuery, userIds);

    // Convert to map for fast lookup
    const userMap = {}; 
    users.forEach(user => {
      userMap[user.user_id] = user;
    });

    // Match info
    const matchQuery = "SELECT * FROM match_table WHERE id = ?";
    const matchResult = await queryAsync(matchQuery, [id]);
    const sections = JSON.parse(JSON.parse(matchResult[0].sections));

    // Attach user details to each bet
    const resultWithUserDetails = bets.map(bet => ({
      ...bet,
      mobile: userMap[bet.user_id]?.mobile || null,
      section: sections.find(i => Number(i.id) === Number(bet.section_id))?.after_over || null,
    }));

    return res.status(200).send(resultWithUserDetails);
  } catch (error) {
    console.error(error);
    return res.status(500).send({ message: 'Internal server error' });
  }
}




async function getAdminData(req, res) {
    const { type } = req?.body;
  try {

    // Build date condition
    let dateCondition = '';
    if (type === 'Today') {
      dateCondition = `AND created_at >= CURDATE() AND created_at < CURDATE() + INTERVAL 1 DAY`;
    } else if (type === 'Daily') {
      dateCondition = `AND created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)`;
    } else if (type === 'Weekly') {
      dateCondition = `AND created_at >= DATE_SUB(CURDATE(), INTERVAL 27 DAY)`;
    } else if (type === 'Monthly') {
      dateCondition = `AND created_at >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)`;
    } else if (type === 'Yearly') {
      dateCondition = `AND created_at >= DATE_SUB(CURDATE(), INTERVAL 5 YEAR)`;
    }

    // Deposit stats
    const depositStatsQuery = `
      SELECT 
        COUNT(*) AS total_deposits,
        SUM(CASE WHEN status = 'P' THEN 1 ELSE 0 END) AS pending_deposits,
        SUM(CASE WHEN status = 'S' THEN 1 ELSE 0 END) AS approved_deposits,
        SUM(CASE WHEN status = 'R' THEN 1 ELSE 0 END) AS rejected_deposits,
        COALESCE(SUM(CASE WHEN status = 'S' THEN amount ELSE 0 END), 0) AS total_deposit_amount
      FROM deposit
      WHERE 1=1 ${dateCondition}
    `;
    const depositStats = await queryAsync(depositStatsQuery);

    // Withdrawal stats
    const withdrawalStatsQuery = `
      SELECT 
        COUNT(*) AS total_withdrawals,
        SUM(CASE WHEN status = 'P' THEN 1 ELSE 0 END) AS pending_withdrawals,
        SUM(CASE WHEN status = 'R' THEN 1 ELSE 0 END) AS rejected_withdrawals,
        SUM(CASE WHEN status = 'C' THEN 1 ELSE 0 END) AS cancelled_withdrawals,
        SUM(CASE WHEN status = 'S' THEN 1 ELSE 0 END) AS approved_withdrawals,
        SUM(CASE WHEN status = 'I' THEN 1 ELSE 0 END) AS inprocess_withdrawals,
        COALESCE(SUM(CASE WHEN status = 'S' THEN amount ELSE 0 END), 0) AS total_withdrawal_amount
      FROM withdrawal
      WHERE 1=1 ${dateCondition}
    `;
    const withdrawalStats = await queryAsync(withdrawalStatsQuery);

    // User stats (optional: apply dateCondition if you have a created_at field)
    const userStatsQuery = `
      SELECT 
        COUNT(*) AS total_users,
        SUM(CASE WHEN is_active = 'Y' THEN 1 ELSE 0 END) AS active_users,
        SUM(CASE WHEN is_active = 'N' THEN 1 ELSE 0 END) AS blocked_users
      FROM users
    `;
    const userStats = await queryAsync(userStatsQuery);

    // Wallet balances (typically not filtered by date)
    const walletSumQuery = `
      SELECT 
        COALESCE(SUM(game_wallet), 0) AS total_game_wallet,
        COALESCE(SUM(main_wallet), 0) AS total_main_wallet
      FROM wallet
    `;
    const walletSums = await queryAsync(walletSumQuery);

    // Combine and return all data
    return res.status(200).send({
      deposit: {
        total: depositStats[0].total_deposits,
        pending: depositStats[0].pending_deposits,
        approved: depositStats[0].approved_deposits,
        rejected: depositStats[0].rejected_deposits,
        total_amount: depositStats[0].total_deposit_amount
      },
      withdrawal: {
        total: withdrawalStats[0].total_withdrawals,
        pending: withdrawalStats[0].pending_withdrawals,
        rejected: withdrawalStats[0].rejected_withdrawals,
        cancelled: withdrawalStats[0].cancelled_withdrawals,
        approved: withdrawalStats[0].approved_withdrawals,
        inprocess: withdrawalStats[0].inprocess_withdrawals,
        total_amount: withdrawalStats[0].total_withdrawal_amount
      },
      users: {
        total: userStats[0].total_users,
        active: userStats[0].active_users,
        blocked: userStats[0].blocked_users
      },
      wallets: {
        total_game_wallet: walletSums[0].total_game_wallet,
        total_main_wallet: walletSums[0].total_main_wallet
      }
    });
  } catch (error) {
    console.log(error);
    return res.status(500).send({ message: "Internal Server Error" });
  }
}





async function getAllUsers(req, res) {
  try {
    const query = `
      SELECT 
        u.user_id,
        u.user_name,
        u.email,
        u.mobile,
        w.main_wallet, 
        w.game_wallet 
      FROM users u
      LEFT JOIN wallet w ON u.user_id = w.user_id
    `;
    const params = [];
    const result = await queryAsync(query, params);
    return res.status(200).send(result);
  } catch (error) {
    console.log(error);
    return res.status(500).send({ message: "Internal Server Error" });
  }
}



async function getUserDetails(req, res) {
  const { user_id } = req.body;
  if (!user_id) {
    return res.status(400).send({ message: "User ID is required" });
  }

  try {
    // Get user and wallet info
    const userQuery = `
      SELECT 
        u.user_id,
        u.user_name,
        u.email,
        u.mobile, 
        u.is_active,
        w.main_wallet, 
        w.game_wallet 
      FROM users u
      LEFT JOIN wallet w ON u.user_id = w.user_id
      WHERE u.user_id = ?
    `;
    const userParams = [user_id];
    const userResult = await queryAsync(userQuery, userParams);

    if (userResult.length === 0) {
      return res.status(404).send({ message: "User not found" });
    }

    const email = userResult[0].email;

    // Get user statements
    const statementQuery = `
      SELECT 
        * 
      FROM statement 
      WHERE user_id = ?
      ORDER BY id DESC
    `;
    const statements = await queryAsync(statementQuery, [user_id]);

    // Get user game wallet statements
    const gameStatementQuery = `
      SELECT 
        * 
      FROM game_wallet 
      WHERE email = ?
      ORDER BY id DESC
    `;
    const gameStatements = await queryAsync(gameStatementQuery, [email]);

    // Get total deposits count
    const depositCountQuery = `
      SELECT COUNT(*) AS total_deposits
      FROM deposit
      WHERE user_id = ?
    `;
    const depositCountResult = await queryAsync(depositCountQuery, [user_id]);

    // Get total withdrawals count
    const withdrawalCountQuery = `
      SELECT COUNT(*) AS total_withdrawals
      FROM withdrawal
      WHERE email = ?
    `;
    const withdrawalCountResult = await queryAsync(withdrawalCountQuery, [email]);

    // Get total successful deposit amount
    const depositSumQuery = `
      SELECT COALESCE(SUM(amount), 0) AS total_deposit_amount
      FROM deposit
      WHERE user_id = ? AND status = 'S'
    `;
    const depositSumResult = await queryAsync(depositSumQuery, [user_id]);

    // Get total successful withdrawal amount
    const withdrawalSumQuery = `
      SELECT COALESCE(SUM(amount), 0) AS total_withdrawal_amount
      FROM withdrawal
      WHERE email = ? AND status = 'S'
    `;
    const withdrawalSumResult = await queryAsync(withdrawalSumQuery, [email]);

    // Combine all data
    const userDetails = {
      ...userResult[0],
      total_deposits: depositCountResult[0].total_deposits,
      total_withdrawals: withdrawalCountResult[0].total_withdrawals,
      total_deposit_amount: depositSumResult[0].total_deposit_amount,
      total_withdrawal_amount: withdrawalSumResult[0].total_withdrawal_amount,
      gameStatements,
      statements,
    };

    return res.status(200).send(userDetails);
  } catch (error) {
    console.log(error);
    return res.status(500).send({ message: "Internal Server Error" });
  }
}




async function updateUserStatus(req, res) { 
  const { email, type } = req.body;

  if (!email || !type || !["Y", "N"].includes(type)) {
    return res.status(400).send({ message: "Valid email and type (Y or N) are required" });
  }

  try {
    // Update user active status
    const statusQuery = `
      UPDATE users 
      SET is_active = ? 
      WHERE email = ?
    `;
    await queryAsync(statusQuery, [type, email]);

    // If blocking the user, also remove tokens
    if (type === "N") {
      const deleteTokenQuery = `
        DELETE FROM token 
        WHERE email = ?
      `;
      await queryAsync(deleteTokenQuery, [email]);
    }

    const statusMessage = type === "N" ? "User has been blocked" : "User has been activated";

    return res.status(200).send({ message: statusMessage });
  } catch (error) {
    console.log(error);
    return res.status(500).send({ message: "Internal Server Error" });
  }
}



async function addRefund(req,res) {
  const { user_id, amount, reason, type } = req.body;
  if (!user_id || !amount || !reason || !type) {
    return res.status(400).send({ message: "Valid user_id, amount and reason are required"})
  } 
  try {
    const updateQuery = "UPDATE wallet SET main_wallet = main_wallet + ? WHERE user_id = ?";
    const updateResult = await queryAsync(updateQuery, [amount, user_id]);
    if( updateResult.affectedRows === 0 ){
      return res.status(400).send({ message: "User not found" })
    } else {
       // addd main wallet statement
       const userDetail = await getUserDetail(user_id)
       const transectionId = `GAME0${amount}${Date.now()}`; 
       addMainStatement(transectionId, type, amount, userDetail.main_wallet,reason, user_id );
       return res.status(200).send({ message: "Refund added successfully" })
    }
  } catch (error) {
    console.log(error);
    return res.status(500).send({ message: "Internal Server Error" });
  }
}




async function getAllGamesData(req, res) { 
  try {
    const { type } = req.body; 
    const games = ['Mines', 'Wheel', 'Limbo', 'Dragon Tower', 'Coin Flip', 'Match'];
 
    // Build date condition
    let dateCondition = '';
    if (type === 'Today') {
      dateCondition = `AND date >= CURDATE() AND date < CURDATE() + INTERVAL 1 DAY`;
    } else if (type === 'Daily') { 
      dateCondition = `AND date >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)`;
    } else if (type === 'Weekly') { 
      dateCondition = `AND date >= DATE_SUB(CURDATE(), INTERVAL 27 DAY)`;
    } else if (type === 'Monthly') { 
      dateCondition = `AND date >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)`;
    } else if (type === 'Yearly') { 
      dateCondition = `AND date >= DATE_SUB(CURDATE(), INTERVAL 5 YEAR)`;
    }
    

    const query = `
      SELECT 
        game_name, 
        description,
        amount
      FROM game_wallet
      WHERE game_name IN (?, ?, ?, ?, ?, ?)
      ${dateCondition}
    `;

    const result = await queryAsync(query, games); 
     

    const gameStats = {};
    for (const game of games) {
      gameStats[game] = { total_bet_amount: 0, total_win_amount: 0, rounds: 0 };
    }

    for (const row of result) {
      let desc;
      try {
        desc = JSON.parse(row.description);
      } catch (e) {
        continue;
      }

      const amount = Number(row.amount) || 0;

      if (desc === 'Bet Deducted') {
        gameStats[row.game_name].total_bet_amount += amount;
        gameStats[row.game_name].rounds += 1;
      } else if (desc === 'Bet Win Added') {
        gameStats[row.game_name].total_win_amount += amount;
      }
    }

    return res.status(200).send([gameStats]);
  } catch (error) {
    console.log(error);
    return res.status(500).send({ message: "Internal Server Error" });
  }
}







// Assuming all the functions are already defined in the file, you can export them in one go

export {
  allDepositRequest,
  deleteMatch,
  getAllBets,
  winLossMatch,
  changeMatchStatus,
  updateMatchResults,
  approveDepositRequest,
  getSingleMatchDetail,
  rejectDepositRequest,
  inprocessWithdrawalRequest,
  allWithdrawalRequest, 
  rejectWithdrawalRequest,
  apprveWithdrawalRequest,
  getAllMatch,
  getGames,
  addNewMatch,
  updateGames,
  adminLogin,
  adminTokenCheck,
  getAdminData,
  getAllUsers,
  getUserDetails,
  updateUserStatus,
  addRefund,
  getAllGamesData,
  completeMatch,
  updateMatchTime
};
