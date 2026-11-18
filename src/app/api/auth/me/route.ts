import { NextResponse } from "next/server";
import { currentUser } from "@/lib/session";
import { runWithDatabaseUser } from "@/lib/db";
export async function GET(){const user=await currentUser();return runWithDatabaseUser(user.id, async () => {
return NextResponse.json({user:{id:user.id,email:user.email,profile:user.profile}});
});
}
