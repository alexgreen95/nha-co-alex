const { validCookie } = require('./_gate');
module.exports = function handler(req,res){
  const secret=process.env.HOUSE_PASSWORD;
  if(!secret) return res.status(500).json({ok:false});
  res.setHeader('Cache-Control','no-store');
  return validCookie(req,secret) ? res.status(200).json({ok:true}) : res.status(401).json({ok:false});
};
