const crypto = require('crypto');
const { tokenFor } = require('./_gate');
module.exports = async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({ok:false});
  const secret=process.env.HOUSE_PASSWORD;
  if(!secret) return res.status(500).json({ok:false,error:'HOUSE_PASSWORD is not configured'});
  const supplied=String((req.body&&req.body.password)||'');
  const a=Buffer.from(supplied), b=Buffer.from(secret);
  const ok=a.length===b.length && crypto.timingSafeEqual(a,b);
  if(!ok) return res.status(401).json({ok:false});
  const token=tokenFor(secret);
  res.setHeader('Set-Cookie',`nha_gate=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`);
  return res.status(200).json({ok:true});
};
