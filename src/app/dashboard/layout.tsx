import { currentUser } from "@/lib/session";
import AssistantWidget from "@/components/AssistantWidget";
import DashboardFrame from "@/components/DashboardFrame";
export default async function Layout({children}:{children:React.ReactNode}){await currentUser();return <DashboardFrame>{children}<AssistantWidget/></DashboardFrame>}
