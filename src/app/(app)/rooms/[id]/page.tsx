import { redirect } from "next/navigation";
export default async function Room({ params }: { params: Promise<{ id: string }> }) { redirect(`/chats?c=${(await params).id}`); }
