import { randomBytes, timingSafeEqual } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { hashPassword, assertPasswordPolicy } from "../src/lib/auth/password";
const prisma=new PrismaClient();
async function main(){
 const token=process.env.OWNER_BOOTSTRAP_TOKEN??"";const tokenConfirm=process.env.OWNER_BOOTSTRAP_TOKEN_CONFIRM??"";const confirm=process.env.OWNER_BOOTSTRAP_CONFIRM??"";const username=(process.env.OWNER_BOOTSTRAP_USERNAME??"").trim().toLowerCase();const password=process.env.OWNER_BOOTSTRAP_PASSWORD??"";
 if(token.length<32||tokenConfirm.length!==token.length||confirm!=="CREATE_OWNER"||!username||!password)throw new Error("Set a 32+ character bootstrap token and matching confirmation, OWNER_BOOTSTRAP_CONFIRM=CREATE_OWNER, username and password.");
 if(!timingSafeEqual(Buffer.from(token),Buffer.from(tokenConfirm)))throw new Error("Owner bootstrap token confirmation failed.");assertPasswordPolicy(password);
 if(await prisma.userRole.count({where:{role:{name:"OWNER"}}})>0)throw new Error("An Owner is already configured; bootstrap is disabled.");
 const role=await prisma.role.findUnique({where:{name:"OWNER"}});if(!role)throw new Error("Run npm run db:seed before Owner bootstrap.");
 const user=await prisma.user.create({data:{username,customerCode:`NRF${randomBytes(4).toString("hex").toUpperCase()}`,profile:{create:{fullName:process.env.OWNER_BOOTSTRAP_NAME?.trim()||username}},password:{create:{hash:await hashPassword(password)}},roles:{create:{roleId:role.id}}}});
 await prisma.auditLog.create({data:{actorId:user.id,action:"owner.bootstrap",entityType:"User",entityId:user.id}});console.info(`Owner account ${user.username} created. Credentials were not printed.`);
}
main().catch(error=>{console.error(error instanceof Error?error.message:"Owner bootstrap failed.");process.exitCode=1}).finally(async()=>prisma.$disconnect());