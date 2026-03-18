import './globals.css'

import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = {
	title: 'Perspectify Web',
	description: 'Next.js app running in Turborepo',
}

type RootLayoutProps = {
	children: ReactNode
}

export default function RootLayout({ children }: RootLayoutProps) {
	return (
		<html lang="en">
			<body className="font-sans min-h-screen">
				{children}
			</body>
		</html>
	)
}
