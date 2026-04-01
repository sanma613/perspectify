import './globals.css'

import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { DM_Sans, Syne } from 'next/font/google'

const dmSans = DM_Sans({
	subsets: ['latin'],
	variable: '--font-body',
})

const syne = Syne({
	subsets: ['latin'],
	variable: '--font-display',
})

export const metadata: Metadata = {
	metadataBase: new URL('https://perspectify.com'),
	title: {
		default: 'Perspectify - Webhook reliability for Stripe + Zapier/Make',
		template: '%s | Perspectify',
	},
	description:
		'Perspectify captures every Stripe webhook before it reaches Zapier or Make. Auto-retries, one-click rescue, and instant failure alerts. Never lose a payment again.',
	keywords: [
		'stripe webhook failed',
		'zapier webhook dropped',
		'make webhook lost',
		'stripe zapier reliability',
		'webhook retry',
		'webhook monitoring',
		'stripe payment lost',
		'zapier downtime',
	],
	authors: [{ name: 'Perspectify' }],
	creator: 'Perspectify',
	openGraph: {
		type: 'website',
		locale: 'en_US',
		url: 'https://perspectify.com',
		siteName: 'Perspectify',
		title: 'Never lose a Stripe payment to Zapier or Make again',
		description:
			'Perspectify sits between Stripe and your automations. Captures every event, retries automatically, and lets you rescue failures with one click.',
		images: [
			{
				url: '/og-image.png',
				width: 1200,
				height: 630,
				alt: 'Perspectify - Webhook reliability for Stripe users',
			},
		],
	},
	twitter: {
		card: 'summary_large_image',
		title: 'Never lose a Stripe payment to Zapier or Make again',
		description:
			'Perspectify captures every Stripe webhook before Zapier or Make can drop it.',
		images: ['/og-image.png'],
		creator: '@perspectify',
	},
	robots: {
		index: true,
		follow: true,
		googleBot: {
			index: true,
			follow: true,
			'max-image-preview': 'large',
			'max-snippet': -1,
		},
	},
	alternates: {
		canonical: 'https://perspectify.com',
	},
	icons: {
		icon: '/favicon.svg',
		shortcut: '/favicon.svg',
	},
}

type RootLayoutProps = {
	children: ReactNode
}

export default function RootLayout({ children }: RootLayoutProps) {
	return (
		<html lang="en">
			<body className={`${dmSans.variable} ${syne.variable} font-body`}>
				{children}
			</body>
		</html>
	)
}
