import argon2 from "argon2";

const options = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

let dummyHash: Promise<string> | undefined;

export function hashPassword(password: string) {
  return argon2.hash(password, options);
}

export function verifyPassword(hash: string, password: string) {
  return argon2.verify(hash, password);
}

export async function consumeUnknownPassword(password: string) {
  dummyHash ??= hashPassword("not-a-real-account-password");
  await verifyPassword(await dummyHash, password).catch(() => false);
}
