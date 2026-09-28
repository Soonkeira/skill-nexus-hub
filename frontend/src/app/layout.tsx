import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import { ToastProvider } from "@/lib/toast";
import { SidebarProvider } from "@/lib/sidebar";

export const metadata: Metadata = {
  title: "Skill Nexus Hub",
  description: "内部 Agent Skill 管理平台",
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className={`${GeistSans.className} antialiased`}>
        <AuthProvider><SidebarProvider><ToastProvider>{children}</ToastProvider></SidebarProvider></AuthProvider>
      </body>
    </html>
  );
}
