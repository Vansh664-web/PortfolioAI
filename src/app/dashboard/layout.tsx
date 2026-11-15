import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";
import AssistantWidget from "@/components/AssistantWidget";
import DashboardFrame from "@/components/DashboardFrame";
export default async function Layout({children}:{children:React.ReactNode}){const user=await currentUser();if(!user)redirect("/login");return <DashboardFrame>{children}<AssistantWidget/></DashboardFrame>}
