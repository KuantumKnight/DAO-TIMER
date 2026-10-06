import type { Metadata } from "next";
import { Admin } from "@/components/admin";
export const metadata: Metadata = { title: "Organizer controls | NeuralDAO", robots: { index: false, follow: false } };
export default function AdminPage() { return <Admin/>; }
