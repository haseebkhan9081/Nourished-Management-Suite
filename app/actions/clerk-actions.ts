"use server";

import { clerkClient } from "@clerk/nextjs/server";

export async function getClerkUsers() {
  const users = await clerkClient.users.getUserList();
  return users.map((user) => ({
    id: user.id,
    email: user.emailAddresses[0]?.emailAddress,
    imageUrl: user.imageUrl,
    createdAt: user.createdAt,
  }));
}
