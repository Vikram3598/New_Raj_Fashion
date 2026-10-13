import nodemailer from "nodemailer";
import { prisma } from "@/lib/db";

async function claimNotification(input:{userId?:string;channel:"EMAIL"|"SMS";templateKey:string;destination:string;payload:Record<string,string>;idempotencyKey:string;enabled:boolean}){
 const record=await prisma.notification.upsert({where:{idempotencyKey:input.idempotencyKey},update:{},create:{userId:input.userId,channel:input.channel,templateKey:input.templateKey,destination:input.destination,payload:input.payload,status:input.enabled?"QUEUED":"SKIPPED",idempotencyKey:input.idempotencyKey}});
 if(!input.enabled||record.status==="SENT"||record.status==="SKIPPED")return{record,claimed:false};
 const claim=await prisma.notification.updateMany({where:{id:record.id,status:{in:["QUEUED","FAILED"]}},data:{status:"SENDING",error:null}});
 if(!claim.count)return{record,claimed:false};
 return{record:{...record,status:"SENDING" as const},claimed:true};
}

export async function sendEmail(input:{to:string;subject:string;text:string;html?:string;templateKey:string;idempotencyKey:string;userId?:string}){
 const host=process.env.SMTP_HOST;const {record,claimed}=await claimNotification({userId:input.userId,channel:"EMAIL",templateKey:input.templateKey,destination:input.to,payload:{subject:input.subject},idempotencyKey:input.idempotencyKey,enabled:Boolean(host)});
 if(!claimed)return prisma.notification.findUnique({where:{id:record.id}}).then(value=>value??record);
 try{
  const transporter=nodemailer.createTransport({host:host!,port:Number(process.env.SMTP_PORT??587),secure:process.env.SMTP_SECURE==="true",auth:process.env.SMTP_USER?{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS}:undefined});
  await transporter.sendMail({from:process.env.SMTP_FROM,to:input.to,subject:input.subject,text:input.text,html:input.html});
  return prisma.notification.update({where:{id:record.id},data:{status:"SENT",sentAt:new Date(),error:null}});
 }catch(error){await prisma.notification.update({where:{id:record.id},data:{status:"FAILED",error:error instanceof Error?error.message:"Email delivery failed"}});throw error}
}

export async function sendSms(input:{to:string;text:string;templateKey:string;idempotencyKey:string;userId?:string}){
 const sid=process.env.TWILIO_ACCOUNT_SID;const token=process.env.TWILIO_AUTH_TOKEN;const from=process.env.TWILIO_FROM;
 const {record,claimed}=await claimNotification({userId:input.userId,channel:"SMS",templateKey:input.templateKey,destination:input.to,payload:{messageType:"verification"},idempotencyKey:input.idempotencyKey,enabled:process.env.SMS_PROVIDER==="twilio"&&Boolean(sid&&token&&from)});
 if(!claimed)return prisma.notification.findUnique({where:{id:record.id}}).then(value=>value??record);
 try{
  const body=new URLSearchParams({To:input.to,From:from!,Body:input.text});
  const response=await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid!)}/Messages.json`,{method:"POST",headers:{Authorization:`Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,"Content-Type":"application/x-www-form-urlencoded"},body});
  if(!response.ok)throw new Error("SMS provider rejected the message.");
  return prisma.notification.update({where:{id:record.id},data:{status:"SENT",sentAt:new Date(),error:null}});
 }catch(error){await prisma.notification.update({where:{id:record.id},data:{status:"FAILED",error:error instanceof Error?error.message:"SMS delivery failed"}});throw error}
}