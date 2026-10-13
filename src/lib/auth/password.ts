import { hash, verify } from "@node-rs/argon2";

const OPTIONS = {
  memoryCost: 19456,
  timeCost: 2,
  outputLen: 32,
  parallelism: 1,
};

export async function hashPassword(password: string) {
  return hash(password, OPTIONS);
}

export async function verifyPassword(hashValue: string, password: string) {
  return verify(hashValue, password, OPTIONS);
}

export function assertPasswordPolicy(password: string) {
  if (password.length < 10) {
    throw new Error("Password must be at least 10 characters.");
  }
}
