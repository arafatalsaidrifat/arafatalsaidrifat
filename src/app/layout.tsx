import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'F-Commerce OS | Commerce Operations',description:'A secure operations workspace for Bangladesh social-commerce teams.'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>;}
