import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();



export default async function verifyToken(req, res, next) {
    const email = req?.body?.email; 
    console.log(req.body)
    if(!email){ 
        return res.status(401).json({message: 'Unauthorized'});
    }
    try {
        let token = req.header("Authorization");
        if(!token){
            return res.status(401).json({message: "Access denied. No token provided."});
        } else{
            token = token.replace("Bearer ", ""); 
            console.log(token)
            jwt.verify(token, process.env.SECRET_KEY, (err,result)=>{
                if(err){
                    return res.status(401).json({message: "Invalid token."});
                } else{
                    req.user = result; 
                    if(email === req.user.email){
                        return next();
                    } else{ 
                        return res.status(401).json({message: "Unauthorized"});
                    }
                     
                }
            })
        }
    } catch (error) {
        res.status(500).send({ message: " Internal Server Error" });
    }
}