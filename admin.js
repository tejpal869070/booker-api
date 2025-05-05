import db from "./dbConnection.js";

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
      return res.status(404).send({ message: "user_id is required !"})
    }
    try {
      const query = `SELECT u.id, u.user_name, u.email, u.mobile, u.user_pin, u.user_id, w.main_wallet, w.game_wallet FROM users u INNER JOIN wallet w ON u.user_id = w.user_id WHERE u.user_id = ?`;
      const result = await queryAsync(query, [user_id]);
      return result[0]
    } catch (error) {
      return res.status(500).send({ message: "Internal Server Error" });
    }
  }


  // game wallet statement add function--------------
async function addWalletStatement( id, email, amount, game_name, description, user_id) {
  const transectionId = `GAME0${id}${Date.now()}`;
  try {
    const user_game_wallet_balance = await queryAsync( "SELECT * FROM wallet WHERE user_id = ?", [user_id] );
    console.log(user_id)
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
    res.status(500).send({ message: " Error adding wallet statement" });
  }
}


  async function getUserDetailEmail(email) {
    if(!email){
      return res.status(404).send({ message: "email is required !"})
    }
  
    try {
      const query = `SELECT u.id, u.user_name, u.email, u.mobile, u.user_pin, u.user_id, w.main_wallet, w.game_wallet FROM users u INNER JOIN wallet w ON u.user_id = w.user_id WHERE u.email = ?`;
      const result = await queryAsync(query, [email]);
      return result[0]
    } catch (error) {
      return res.status(500).send({ message: "Internal Server Error" });
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
  console.log(req.files)
  if (!match_time || !sections || !teams || !title) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  // Handle file uploads and save filenames
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
    const query = `INSERT INTO match_table (match_time, sections, teams, title, result) VALUES (?, ?, ?, ?, ?)`;
    const values = [match_time, JSON.stringify(sections), JSON.stringify(teams), title, "Y"];
    const result = await queryAsync(query, values);

    if (result.affectedRows > 0) {
      return res.status(200).send({ message: "Match Added Successfully!" });
    } else {
      return res.status(409).send({ message: "Error in adding match" });
    }
  } catch (error) {
    console.error(error); // Log error for debugging
    return res.status(500).send({ message: "Internal Server Error" });
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



async function changeMatchStatus(req,res) {
  const { id, status, can_bet_place } = req.body 
  if(!id || !status){
    return res.status(404).send({ message : "Id & status is required !"})
  }
  try {
    // find match
    const findyQuery = "SELECT * FROM match_table WHERE id = ?"
    const queryResult = await queryAsync(findyQuery, [id])
    if(queryResult.length > 0){
      const updateQuery = "UPDATE match_table SET status = ?, can_place_bet = ? WHERE id = ?"
      const updateResult = await queryAsync(updateQuery, [status, can_bet_place, id])
      if(updateResult.affectedRows > 0){
        return res.status(200).send({ message : "Match is Live Now !"})
      } else {
        return res.status(309).send({ message : "Error in making Live !"})
      }
    } else { 
      return res.status(404).send({ message : "No match found !"})
    }
  } catch (error) {
    return res.status(500).send({ message : "Internal server error !"})
  }
}


async function updateMatchResults(req, res) {
  const { match_id, section_id, result } = req.body;

  if (!section_id || !match_id || !result) {
    return res.status(400).send({ message: "All fields are required!" });
  }

  try {
    // Fetch match
    const findQuery = "SELECT * FROM match_table WHERE id = ?";
    const queryResult = await queryAsync(findQuery, [match_id]);

    if (queryResult.length === 0) {
      return res.status(404).send({ message: "No match found!" });
    }

    // Parse sections
    let match = queryResult[0];
    let sections = JSON.parse(JSON.parse(match.sections)); 
    // Find and update the section
    const sectionIndex = sections.findIndex(sec => sec.id === Number(section_id));
    if (sectionIndex === -1) {
      return res.status(404).send({ message: "Section not found!" });
    }

    sections[sectionIndex].result = result;

    // Update match in database
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
  const { id, section_id } = req.body;
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
    const sectionResult = section.result;
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
          const updateWalletQuery = "UPDATE wallet SET game_wallet = ? WHERE user_id = ?";
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
      }
    }
    

    return res.status(200).send({ winners: winningUsers });

  } catch (error) { 
    res.status(500).send({ message: 'Internal server error' });
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

    // match info
    const matchQuery = "SELECT * FROM match_table WHERE id = ?"
    const matchResult = await queryAsync(matchQuery, [id])
    const sections = JSON.parse(JSON.parse(matchResult[0].sections)) 

    // Attach user details to each bet
    const resultWithUserDetails = bets.map(bet => ({
      ...bet,
      mobile: userMap[bet.user_id].mobile || null,
      section : sections.find(i=> Number(i.id) === Number(bet.section_id))?.after_over
    }));

    return res.status(200).send(resultWithUserDetails);
  } catch (error) {
    console.error(error);
    return res.status(500).send({ message: 'Internal server error' });
  }
}



async function getAdminData(req, res) {
  try {
      // Query to get the length of the deposit table
      const depositQuery = "SELECT COUNT(*) AS depositCount FROM deposit";
      const depositResult = await queryAsync(depositQuery);

      // Query to get the length of the withdrawal table
      const withdrawalQuery = "SELECT COUNT(*) AS withdrawalCount FROM withdrawal";
      const withdrawalResult = await queryAsync(withdrawalQuery);

      // Return the result as JSON
      return res.status(200).send({
          depositCount: depositResult[0].depositCount,
          withdrawalCount: withdrawalResult[0].withdrawalCount
      });
  } catch (error) {
      // Handle errors
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
  getAdminData
};
