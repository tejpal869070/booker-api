import db from "./dbConnection.js";

function queryAsync(query, params) {
    return new Promise((resolve, reject) => {
        db.query(query, params, (error, results) => {
            if (error) reject(error);
            else resolve(results);
        });
    });
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
                const query = "UPDATE withdrawal SET status = ?, WHERE id = ?";
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
        return res.status(500).send({ message: "Internal Server Error" });
    }
}

export { allDepositRequest, approveDepositRequest, rejectDepositRequest, inprocessWithdrawalRequest };